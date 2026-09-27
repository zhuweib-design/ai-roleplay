import { beforeEach, describe, expect, it } from 'vitest';
import { WebFileAdapter, openModelDb } from '@/core/model-file-adapter';

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
