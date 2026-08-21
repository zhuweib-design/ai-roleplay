/**
 * onnx-embedding-provider — 真实模型验证(本地 model/ 目录,已下载)
 *
 * 使用 node 环境直接读文件(不经 IndexedDB/Tauri),验证:
 * - 权重文件名探测(model.onnx → model_int8.onnx)
 * - BERT WordPiece tokenizer(vocab.txt)
 * - 真实推理:gte-large-quant(1024 维)与 bge-int8(1024 维)
 * - 语义相似文本 → 高余弦(真实嵌入质量冒烟)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  OnnxEmbeddingProvider,
  BertWordPieceTokenizer,
  JsonWordPieceTokenizer,
} from '@core/onnx-embedding-provider';
import type { ModelFileAdapter } from '@core/vector-model-source';
import { cosineSimilarity } from '@core/embedding';
import type { VectorModelId } from '@core/vector-model-manager';

const MODEL_ROOT = path.resolve(process.cwd(), 'model');

/** 直读文件系统适配器(仅测试:节点环境直接读 model/ 目录) */
class NodeFileAdapter implements ModelFileAdapter {
  async exists(modelId: VectorModelId): Promise<boolean> {
    return fs.existsSync(path.join(MODEL_ROOT, modelId, 'model.onnx')) ||
      fs.existsSync(path.join(MODEL_ROOT, modelId, 'model_int8.onnx'));
  }
  async importFromDir(): Promise<string[]> {
    return [];
  }
  async readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer> {
    const p = path.join(MODEL_ROOT, modelId, fileName);
    const buf = fs.readFileSync(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  async readText(modelId: VectorModelId, fileName: string): Promise<string> {
    return fs.readFileSync(path.join(MODEL_ROOT, modelId, fileName), 'utf-8');
  }
  async listInstalled(): Promise<VectorModelId[]> {
    return fs.readdirSync(MODEL_ROOT) as VectorModelId[];
  }
}

// 真实模型验证依赖本地已下载的 model/ 权重目录(大文件不入库)。
// CI 等无该目录的环境应整体跳过而不是因 ENOENT 失败。
describe.skipIf(!fs.existsSync(MODEL_ROOT))('真实模型验证(model/ 目录)', () => {
  it('模型目录包含三个 onnx 模型目录', () => {
    const installed = fs.readdirSync(MODEL_ROOT);
    expect(installed).toContain('bge-large-zh-v1.5-int8-onnx');
    expect(installed).toContain('bge-small-zh-v1.5-int8-onnx');
    expect(installed).toContain('gte-large-zh-int8-onnx');
    // bge 系用 model_int8.onnx 命名;gte 需 model_int8.onnx 或 model.onnx
    const hasGteWeights = fs.existsSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'model_int8.onnx')) ||
      fs.existsSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'model.onnx'));
    expect(fs.existsSync(path.join(MODEL_ROOT, 'bge-large-zh-v1.5-int8-onnx', 'model_int8.onnx'))).toBe(true);
    // gte 权重文件可能未放置,此处仅记录(不强制)
    console.log('gte 权重文件存在:', hasGteWeights);
  });

  it('bge vocab.txt → BertWordPieceTokenizer 词表加载与中文编码', () => {
    const vocab = fs.readFileSync(path.join(MODEL_ROOT, 'bge-large-zh-v1.5-int8-onnx', 'vocab.txt'), 'utf-8');
    const t = new BertWordPieceTokenizer(vocab);
    expect(t.vocabSize).toBeGreaterThan(20000);
    const ids = t.encode('星陨之剑');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id < t.vocabSize)).toBe(true);
  });

  it('JsonWordPieceTokenizer:tokenizer.json(反转 vocab)加载与中文编码', () => {
    const raw = fs.readFileSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'tokenizer.json'), 'utf-8');
    const t = new JsonWordPieceTokenizer(JSON.parse(raw));
    expect(t.vocabSize).toBeGreaterThanOrEqual(21128);
    // 特殊 token 映射正确(反转 vocab 自动检测)
    const ids = t.encode('星陨之剑');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id >= 0 && id < t.vocabSize)).toBe(true);
  });

  it(
    'gte-large-zh-int8-onnx:权重存在时推理(1024 维),缺失时跳过',
    async () => {
      const adapter = new NodeFileAdapter();
      const hasWeights = fs.existsSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'model_int8.onnx')) ||
        fs.existsSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'model.onnx'));
      if (!hasWeights) {
        // 权重未放置:验证 vocab.txt 可加载(分词器就绪),推理路径留给权重就位后
        const vocab = fs.readFileSync(path.join(MODEL_ROOT, 'gte-large-zh-int8-onnx', 'vocab.txt'), 'utf-8');
        const t = new BertWordPieceTokenizer(vocab);
        expect(t.vocabSize).toBeGreaterThanOrEqual(21127);
        expect(t.encode('星陨之剑').length).toBeGreaterThan(0);
        return;
      }
      const provider = new OnnxEmbeddingProvider({ modelId: 'gte-large-zh-int8-onnx', adapter });
      const v1 = await provider.embed('星陨之剑的封印被解开了');
      const v2 = await provider.embed('星陨之剑的封印被解开了吗');
      const v3 = await provider.embed('今天天气很好');
      expect(v1.dim).toBe(1024);
      expect(cosineSimilarity(v1, v2)).toBeGreaterThan(0.8);
      expect(cosineSimilarity(v1, v3)).toBeLessThan(cosineSimilarity(v1, v2));
    },
    180_000
  );

  it(
    'bge-large-zh-v1.5-int8-onnx:文件名探测(model_int8.onnx)+ vocab 分词推理',
    async () => {
      const adapter = new NodeFileAdapter();
      const provider = new OnnxEmbeddingProvider({
        modelId: 'bge-large-zh-v1.5-int8-onnx',
        adapter,
      });
      const v = await provider.embed('角色设定:精灵王国的守护者');
      expect(v.dim).toBe(1024);
      expect(v.values.length).toBe(1024);
      const norm = Math.sqrt(v.values.reduce((a, b) => a + b * b, 0));
      expect(norm).toBeCloseTo(1, 3); // L2 归一化
    },
    180_000
  );

  it(
    'bge-small-zh-v1.5-int8-onnx:浏览器推荐模型(512 维)推理与语义',
    async () => {
      const adapter = new NodeFileAdapter();
      const provider = new OnnxEmbeddingProvider({
        modelId: 'bge-small-zh-v1.5-int8-onnx',
        adapter,
      });
      const v1 = await provider.embed('星陨之剑的封印被解开');
      const v2 = await provider.embed('星陨之剑的封印被解开了吗');
      const v3 = await provider.embed('今天的天气真好');
      expect(v1.dim).toBe(512);
      expect(cosineSimilarity(v1, v2)).toBeGreaterThan(0.8);
      expect(cosineSimilarity(v1, v3)).toBeLessThan(cosineSimilarity(v1, v2));
    },
    180_000
  );

  it('无权重模型:探测失败给出明确错误', async () => {
    const adapter = new NodeFileAdapter();
    const provider = new OnnxEmbeddingProvider({
      modelId: 'bge-small-zh-v1.5', // 目录无 onnx(仅 pytorch 权重)
      adapter,
    });
    await expect(provider.embed('测试')).rejects.toThrow(/权重未找到|model\.onnx|model_int8\.onnx/);
  });
});