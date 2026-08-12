/**
 * vector-model-source — 模型来源管理测试
 *
 * 覆盖:
 * - mapSourceFiles:只复制约定文件(model.onnx/config.json),忽略杂项
 * - register:模型未安装(目录不存在)时抛错
 * - importFromDir:复制后登记(adapter 行为)
 */
import { describe, it, expect } from 'vitest';
import {
  mapSourceFiles,
  VectorModelSourceRegistry,
  type ModelFileAdapter,
} from '@core/vector-model-source';
import type { VectorModelId } from '@core/vector-model-manager';

describe('mapSourceFiles', () => {
  it('只映射约定文件,忽略杂项', () => {
    const mapped = mapSourceFiles('/usr/models/bge', [
      'model.onnx',
      'config.json',
      'README.md',
      'random.bin',
    ]);
    expect(mapped).toEqual([
      { from: '/usr/models/bge/model.onnx', to: 'model.onnx' },
      { from: '/usr/models/bge/config.json', to: 'config.json' },
    ]);
  });
});

describe('VectorModelSourceRegistry', () => {
  const makeAdapter = (installed: string[]): ModelFileAdapter => ({
    exists: async (id) => installed.includes(id),
    importFromDir: async (id, _src) => {
      installed.push(id);
      return ['model.onnx', 'config.json'];
    },
    readModelBuffer: async () => new ArrayBuffer(0),
    readText: async () => '',
    listInstalled: async (): Promise<VectorModelId[]> => [...installed] as VectorModelId[],
  });

  it('register:目录不存在抛错,存在则登记', async () => {
    const reg = new VectorModelSourceRegistry(makeAdapter(['bge-small-zh-v1.5']));
    await expect(
      reg.register({ kind: 'local', modelId: 'bge-large-zh-v1.5', dim: 1024 })
    ).rejects.toThrow('模型未安装');
    await reg.register({ kind: 'local', modelId: 'bge-small-zh-v1.5', dim: 512 });
    expect(reg.get('bge-small-zh-v1.5')?.dim).toBe(512);
    expect(reg.list()).toEqual(['bge-small-zh-v1.5']);
  });

  it('importFromDir:复制到划定目录并登记', async () => {
    const reg = new VectorModelSourceRegistry(makeAdapter([]));
    const files = await reg.importFromDir('gte-large-zh-int8-onnx', '/user/Downloads/gte-quant');
    expect(files).toContain('model.onnx');
    expect(reg.get('gte-large-zh-int8-onnx')?.sourceDir).toBe('/user/Downloads/gte-quant');
  });
});
