/**
 * 桌面端模型文件 IPC 封装测试
 *
 * 覆盖 B2 改造的契约面：命令名、参数名（Rust 侧刻意用单词参数以避开
 * camelCase/snake_case 转换歧义）、以及二进制 IPC 三种返回形态的归一化。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { modelFsIpc } from '@/core/model-fs-ipc';
import { TauriFileAdapter } from '@/core/model-file-adapter';

/** 与 Rust Response::new 对应的二进制返回形态 */
function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe('modelFsIpc — 命令与参数契约', () => {
  it('pickDir 传 title 并把 null/undefined 都归一为 null', async () => {
    invokeMock.mockResolvedValueOnce('/models/bge');
    await expect(modelFsIpc.pickDir('选择模型文件夹')).resolves.toBe('/models/bge');
    expect(invokeMock).toHaveBeenLastCalledWith('pick_model_dir', { title: '选择模型文件夹' });

    invokeMock.mockResolvedValueOnce(undefined);
    await expect(modelFsIpc.pickDir()).resolves.toBeNull();
    expect(invokeMock).toHaveBeenLastCalledWith('pick_model_dir', { title: '' });
  });

  it('listDir 走 list_model_dir 并原样返回 isDir 字段', async () => {
    const entries = [
      { name: 'config.json', isDir: false },
      { name: 'sub', isDir: true },
    ];
    invokeMock.mockResolvedValueOnce(entries);
    await expect(modelFsIpc.listDir('model/sub')).resolves.toEqual(entries);
    expect(invokeMock).toHaveBeenCalledWith('list_model_dir', { path: 'model/sub' });
  });

  it('copyFiles 用 source/model 两个单词参数名（与 Rust 签名一致）', async () => {
    invokeMock.mockResolvedValueOnce(['model.onnx', 'config.json']);
    await expect(modelFsIpc.copyFiles('/tmp/pick', 'bge-small-zh-v1.5')).resolves.toEqual([
      'model.onnx',
      'config.json',
    ]);
    expect(invokeMock).toHaveBeenCalledWith('copy_model_files', {
      source: '/tmp/pick',
      model: 'bge-small-zh-v1.5',
    });
  });

  it('hasModel 与 listInstalled 命中对应命令', async () => {
    invokeMock.mockResolvedValueOnce(true);
    await expect(modelFsIpc.hasModel('m1')).resolves.toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith('has_model_files', { model: 'm1' });

    invokeMock.mockResolvedValueOnce(['m1', 'm2']);
    await expect(modelFsIpc.listInstalled()).resolves.toEqual(['m1', 'm2']);
    expect(invokeMock).toHaveBeenLastCalledWith('list_installed_models', undefined);
  });
});

describe('modelFsIpc — 二进制 IPC 归一化', () => {
  it('ArrayBuffer / Uint8Array / number[] 三种形态都读成正确文本', async () => {
    const payload = bytesOf('{"dim":512}');

    invokeMock.mockResolvedValueOnce(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
    await expect(modelFsIpc.readText('model/m1/config.json')).resolves.toBe('{"dim":512}');

    invokeMock.mockResolvedValueOnce(payload);
    await expect(modelFsIpc.readText('model/m1/config.json')).resolves.toBe('{"dim":512}');

    invokeMock.mockResolvedValueOnce(Array.from(payload));
    await expect(modelFsIpc.readText('model/m1/config.json')).resolves.toBe('{"dim":512}');
  });

  it('readFile 返回 ArrayBuffer（非视图）供 ORT 直接消费', async () => {
    const payload = bytesOf('onnx-bytes');
    invokeMock.mockResolvedValueOnce(payload);
    const buf = await modelFsIpc.readFile('../../../model/m1/model.onnx');
    // 断言用字节长度 + 非视图判定：jsdom 与 Node realm 的 ArrayBuffer 构造器不同，
    // instanceof 在此不可靠。
    expect(ArrayBuffer.isView(buf)).toBe(false);
    expect(buf.byteLength).toBe(payload.byteLength);
    expect(new TextDecoder().decode(buf)).toBe('onnx-bytes');
    expect(invokeMock).toHaveBeenCalledWith('read_model_file', {
      path: '../../../model/m1/model.onnx',
    });
  });

  it('readModel / readModelText 走 read_model_by_id 并带 model+file', async () => {
    invokeMock.mockResolvedValueOnce(bytesOf('w'));
    await modelFsIpc.readModel('m1', 'model_int8.onnx');
    expect(invokeMock).toHaveBeenLastCalledWith('read_model_by_id', {
      model: 'm1',
      file: 'model_int8.onnx',
    });

    invokeMock.mockResolvedValueOnce(bytesOf('cfg'));
    await expect(modelFsIpc.readModelText('m1', 'config.json')).resolves.toBe('cfg');
  });
});

describe('TauriFileAdapter — 委托到 IPC 层', () => {
  const adapter = new TauriFileAdapter();

  it('exists 委托 has_model_files', async () => {
    invokeMock.mockResolvedValueOnce(false);
    await expect(adapter.exists('m1' as never)).resolves.toBe(false);
    expect(invokeMock).toHaveBeenLastCalledWith('has_model_files', { model: 'm1' });
  });

  it('importFromDir 传目录字符串走 copy_model_files', async () => {
    invokeMock.mockResolvedValueOnce(['model.onnx']);
    await expect(adapter.importFromDir('m1' as never, '/pick/dir')).resolves.toEqual(['model.onnx']);
    expect(invokeMock).toHaveBeenLastCalledWith('copy_model_files', {
      source: '/pick/dir',
      model: 'm1',
    });
  });

  it('importFromDir 传 File[]（Web 专用入参）时不触碰 IPC', async () => {
    await expect(adapter.importFromDir('m1' as never, [] as unknown as File[])).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('listInstalled 结果原样透出为模型 id 列表', async () => {
    invokeMock.mockResolvedValueOnce(['a', 'b']);
    await expect(adapter.listInstalled()).resolves.toEqual(['a', 'b']);
  });

  it('readModelBuffer 返回 ArrayBuffer 供 ORT 直接消费', async () => {
    invokeMock.mockResolvedValueOnce(bytesOf('weights'));
    const buf = await adapter.readModelBuffer('m1' as never, 'model.onnx');
    expect(ArrayBuffer.isView(buf)).toBe(false);
    expect(buf.byteLength).toBe(7);
    expect(new TextDecoder().decode(buf)).toBe('weights');
  });
});
