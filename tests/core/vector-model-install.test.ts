/**
 * 用户自定义向量模型安装核心 (自定义添加本地模型) 测试
 *
 * 覆盖:
 * - makeUserModelId / isUserVectorModelId 命名空间
 * - extractZipFiles:解压多文件(自由命名,含包根目录归一化)
 * - findOnnxFile 识别权重
 * - parseConfigDim 维度解析
 * - trimModelName 名称处理
 */
import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import {
  makeUserModelId,
  isUserVectorModelId,
  extractZipFiles,
  findOnnxFile,
  parseConfigDim,
  trimModelName,
} from '@core/vector-model-install';

/** 用 fflate 生成 zip 字节(测试夹具) */
function makeZip(entries: Record<string, string>): ArrayBuffer {
  const u8map: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(entries)) {
    u8map[name] = new TextEncoder().encode(text);
  }
  const zipped = zipSync(u8map);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

describe('命名空间', () => {
  it('makeUserModelId 生成 user- 前缀唯一 id', () => {
    const id = makeUserModelId('我的模型 B');
    expect(id).toMatch(/^user-\d+-/);
    expect(isUserVectorModelId(id)).toBe(true);
  });

  it('isUserVectorModelId 区分预置模型', () => {
    expect(isUserVectorModelId('bge-small-zh-v1.5')).toBe(false);
    expect(isUserVectorModelId('user-1710000000-my-model')).toBe(true);
  });
});

describe('extractZipFiles', () => {
  it('解压多文件自由命名(与真实模型目录一致)', () => {
    const zip = makeZip({
      'model_int8.onnx': 'weights-binary-placeholder',
      'config.json': '{"hidden_size":1024}',
      'tokenizer.json': '{}',
      'vocab.txt': 'word\n',
      '1_Pooling/config.json': '{"hidden_size":1024}',
    });
    const files = extractZipFiles(zip);
    // 目录项 1_Pooling/config.json 归一化为 config.json(冲突保留一个)
    expect(files.has('model_int8.onnx')).toBe(true);
    expect(files.has('config.json')).toBe(true);
    expect(files.has('tokenizer.json')).toBe(true);
    expect(files.has('vocab.txt')).toBe(true);
  });

  it('跳过纯目录项', () => {
    const zip = makeZip({ 'dir/sub/': '', 'model.onnx': 'x' });
    const files = extractZipFiles(zip);
    expect(files.has('model.onnx')).toBe(true);
    // 不含目录项
    for (const name of files.keys()) {
      expect(name.endsWith('/')).toBe(false);
    }
  });

  it('归一化包根目录前缀', () => {
    const zip = makeZip({ 'my-pack/model.onnx': 'x', 'my-pack/config.json': '{}' });
    const files = extractZipFiles(zip);
    expect(files.has('model.onnx')).toBe(true);
    expect(files.has('config.json')).toBe(true);
  });
});

describe('findOnnxFile', () => {
  it('识别多种 onnx 命名', () => {
    expect(findOnnxFile(['config.json', 'model.onnx'])).toBe('model.onnx');
    expect(findOnnxFile(['model_int8.onnx', 'vocab.txt'])).toBe('model_int8.onnx');
    expect(findOnnxFile(['tokenizer.json'])).toBeUndefined();
  });
});

describe('parseConfigDim', () => {
  it('从 hidden_size 解析维度', () => {
    expect(parseConfigDim('{"hidden_size":1024}')).toBe(1024);
    expect(parseConfigDim('{"dim":512}')).toBe(512);
    expect(parseConfigDim('not-json')).toBe(0);
    expect(parseConfigDim(undefined)).toBe(0);
  });
});

describe('trimModelName', () => {
  it('去除 .zip 后缀', () => {
    expect(trimModelName('bge-small.zip')).toBe('bge-small');
    expect(trimModelName('模型_b.zip')).toBe('模型_b');
    expect(trimModelName('model.onnx')).toBe('model.onnx');
  });
});