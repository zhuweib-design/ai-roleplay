import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Rust 命令的唯一出口被打桩。下面那条"浏览器环境不发 invoke"的断言靠它计数,
 * 所以负向对照(把环境切成 Tauri)必须让这个 spy 真的被调用一次,否则断言是空跑的。
 */
const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  WebFileAdapter,
  TauriFileAdapter,
  createModelFileAdapter,
  openModelDb,
} from '@/core/model-file-adapter';

async function clearModelDb(): Promise<void> {
  const db = await openModelDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('WebFileAdapter.listInstalled', () => {
  beforeEach(async () => {
    await clearModelDb();
  });

  it('列出当前导入格式的 model 键', async () => {
    const adapter = new WebFileAdapter();
    await adapter.importFromDir('bge-small-zh-v1.5', [new File(['onnx'], 'model.onnx')]);
    await adapter.importFromDir('gte-large-zh-int8-onnx', [new File(['onnx'], 'model_int8.onnx')]);

    await expect(adapter.listInstalled()).resolves.toEqual([
      'bge-small-zh-v1.5',
      'gte-large-zh-int8-onnx',
    ]);
  });

  it('兼容旧版 models/embedding 键', async () => {
    const db = await openModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(new File(['onnx'], 'model.onnx'), 'models/embedding/bge-large-zh-v1.5/model.onnx');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await expect(new WebFileAdapter().listInstalled()).resolves.toEqual(['bge-large-zh-v1.5']);
  });
});

/**
 * 适配器选择守卫（HANDOFF 任务 A 验收 3）
 *
 * 断言的是"走的是哪条实现"，不是"有没有报错"——组件外层有 try/catch，
 * 走错分支的错误会被吞成一条 toast，只看报错看不出降级没跑到。
 */
describe('createModelFileAdapter 的环境选择', () => {
  function setTauri(on: boolean): void {
    if (on) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    } else {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  }

  beforeEach(async () => {
    invokeMock.mockReset();
    setTauri(false);
    await clearModelDb();
  });

  afterEach(() => {
    setTauri(false);
  });

  it('浏览器环境选 WebFileAdapter，导入与列举都不发一条 invoke', async () => {
    const adapter = createModelFileAdapter();
    expect(adapter).toBeInstanceOf(WebFileAdapter);

    await adapter.importFromDir('bge-small-zh-v1.5', [new File(['onnx'], 'model.onnx')]);
    await expect(adapter.exists('bge-small-zh-v1.5')).resolves.toBe(true);
    // 不断言读文件内容：jsdom 的结构化克隆不保留 Blob 方法（arrayBuffer/text），
    // 真实浏览器里这条路径由 e2e 的量测覆盖，在单测里断言只会得到内核差异造成的红。
    await expect(adapter.listInstalled()).resolves.toEqual(['bge-small-zh-v1.5']);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('负向对照：把环境标成 Tauri，同一个 spy 必须真的被调用', async () => {
    setTauri(true);
    invokeMock.mockResolvedValue(['bge-small-zh-v1.5']);

    const adapter = createModelFileAdapter();
    expect(adapter).toBeInstanceOf(TauriFileAdapter);
    await expect(adapter.listInstalled()).resolves.toEqual(['bge-small-zh-v1.5']);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[0]).toBe('list_installed_models');
  });
});
