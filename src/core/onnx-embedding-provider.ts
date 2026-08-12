/**
 * ONNXEmbeddingProvider — 浏览器本地向量模型运行时(onnxruntime-web)
 *
 * 加载项目划定目录 model/<model-id>/ 下的模型文件:
 *   model.onnx(权重,来自用户选定的模型文件夹复制)
 *
 * 推理管线:input_ids/attention_mask → last_hidden_state → mean pooling → L2 归一化
 *
 * ponytail:tokenizer 目前为字符级哈希占位(中文 BGE 词表 21128 未内置);
 * 换真实分词时接 @huggingface/tokenizers 或加载 BERT vocab.txt,
 * 模型质量会进一步提升,接口不变。
 */
import type { EmbeddingProvider, EmbeddingVector } from './embedding';
import type { ModelFileAdapter } from './vector-model-source';
import type { VectorModelId } from './vector-model-manager';

/** 分词钩子:text → token ids(BERT 系词表尺寸由模型决定) */
export interface Tokenizer {
  encode(text: string): number[];
  readonly vocabSize: number;
}

/**
 * BERT WordPiece 分词器(基于 vocab.txt,标准文件:
 * 0=[PAD] 100=[UNK] 101=[CLS] 102=[SEP])
 * 中文按单字(中文 BERT 词表为字符级);英文按空格分割,整词查表,
 * 未命中回退单字符(简化:不做 ## 子词后缀)
 */
export class BertWordPieceTokenizer implements Tokenizer {
  private readonly id: Map<string, number>;
  private readonly unkId = 100;
  readonly vocabSize: number;

  constructor(vocabText: string) {
    const lines = vocabText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    this.vocabSize = lines.length;
    this.id = new Map(lines.map((w, i) => [w, i]));
  }

  encode(text: string): number[] {
    const ids: number[] = [];
    const push = (w: string) => {
      const id = this.id.get(w);
      if (id !== undefined) {
        ids.push(id);
      } else if (/^[\u4e00-\u9fff]$/.test(w) || w.length === 1) {
        // 单字未命中 → UNK
        ids.push(this.unkId);
      } else {
        // 英文词按字符回退(简化,不生成 ## 子词)
        for (const ch of w) {
          ids.push(this.id.get(ch) ?? this.unkId);
        }
      }
    };
    // 中文单字;英文按空白/标点切词(保留中文标点单字)
    const parts = text.split(/([\u4e00-\u9fff，。！？、；：“”‘’（）])|(\s+)/).filter((x) => x && x.length > 0);
    for (const part of parts) {
      if (/^[\u4e00-\u9fff，。！？、；：“”‘’（）]$/.test(part) || part.length === 1) {
        push(part);
      } else {
        for (const word of part.split(/(?<=\w)(?=\W)|(?<=\W)(?=\w)/).filter((x) => x)) {
          if (/^[a-zA-Z0-9]+$/.test(word)) push(word);
          else for (const ch of word) push(ch);
        }
      }
    }
    return ids.slice(0, 510); // 预留 [CLS]/[SEP]
  }
}

/** 字符级占位分词器(模型目录无 vocab.txt 时的回退) */
export class CharLevelTokenizer implements Tokenizer {
  readonly vocabSize = 21128;
  encode(text: string): number[] {
    const ids: number[] = [];
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      const idx = (code % 4999) + 1;
      ids.push(idx < this.vocabSize ? idx : (code % (this.vocabSize - 5000)) + 5000);
    }
    return ids;
  }
}

export interface OnnxEmbeddingConfig {
  modelId: VectorModelId;
  /** 文件读取适配器(项目模型目录) */
  adapter: ModelFileAdapter;
  /** 权重文件名(默认 model.onnx) */
  onnxFile?: string;
  /** 输出维度(未知时从模型输出推断) */
  dim?: number;
  /** 最大输入长度(默认 512,需求 1 预算) */
  maxLen?: number;
  tokenizer?: Tokenizer;
  /** onnx 执行后端(默认 wasm) */
  executionProvider?: 'wasm' | 'webgpu';
}

export class OnnxEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'onnx';
  private session: any = null;
  private readonly maxLen: number;
  private readonly config: OnnxEmbeddingConfig;

  constructor(config: OnnxEmbeddingConfig) {
    this.config = config;
    this.maxLen = config.maxLen ?? 512;
  }

  get dim(): number {
    return this.resolvedDim ?? this.config.dim ?? 768;
  }

  /** 动态加载 onnxruntime(避免静态 import 在非浏览器环境崩溃) */
  private async loadRuntime(): Promise<any> {
    const ort = await import('onnxruntime-web');
    if (this.session) return ort;
    // 探测权重文件名:model.onnx → model_int8.onnx(int8 导出命名)
    const fileName = await this.resolveOnnxFile();
    const buf = await this.config.adapter.readModelBuffer(this.config.modelId, fileName);
    // 跨 realm 拷贝(jsdom/node 差异:instanceof 检查失败时报 "must be 'path' or 'buffer'")
    const modelData = new Uint8Array(buf);
    this.session = await ort.InferenceSession.create(modelData, {
      executionProviders: [this.config.executionProvider ?? 'wasm'],
    });
    // 记录模型输入名(不同模型输入不同:gte 无 token_type_ids)
    this.inputNames = (this.session.inputNames as string[]) ?? null;
    // 探测输出维度并回填
    if (!this.resolvedDim) {
      const meta = this.session.inputMetadata as Record<string, { shape?: number[] }>;
      const inputShape = meta?.input_ids?.shape;
      if (Array.isArray(inputShape)) {
        // [1, seq, hidden] 或 [seq, hidden]
        this.resolvedDim = inputShape[inputShape.length - 1] ?? this.config.dim ?? 768;
      }
    }
    return ort;
  }

  private resolvedDim: number | null = null;
  private inputNames: string[] | null = null;
  private static ONNX_CANDIDATES = ['model.onnx', 'model_int8.onnx'];

  /** 依次尝试候选权重文件,返回第一个存在的 */
  private async resolveOnnxFile(): Promise<string> {
    const explicit = this.config.onnxFile;
    const candidates = explicit ? [explicit] : OnnxEmbeddingProvider.ONNX_CANDIDATES;
    for (const name of candidates) {
      try {
        await this.config.adapter.readModelBuffer(this.config.modelId, name);
        return name;
      } catch {
        /* 尝试下一个 */
      }
    }
    throw new Error(
      `模型权重未找到: ${this.config.modelId}(需要 ${OnnxEmbeddingProvider.ONNX_CANDIDATES.join(' 或 ')} 之一,请先在设置页安装)`
    );
  }

  /** 加载真实分词器(优先 vocab.txt → BERT WordPiece;无则字符级回退) */
  private async resolveTokenizer(): Promise<Tokenizer> {
    if (this.config.tokenizer) return this.config.tokenizer;
    try {
      const vocab = await this.config.adapter.readText(this.config.modelId, 'vocab.txt');
      if (vocab.length > 100) return new BertWordPieceTokenizer(vocab);
    } catch {
      /* 无 vocab.txt */
    }
    return new CharLevelTokenizer();
  }

  /** 懒初始化:加载分词器(在首次 embed 前) */
  private tokenizerReady: Promise<Tokenizer> | null = null;

  private get tokenizer(): Promise<Tokenizer> {
    if (!this.tokenizerReady) {
      this.tokenizerReady = this.resolveTokenizer();
    }
    return this.tokenizerReady;
  }

  /** 文本 → token ids + attention mask(用指定分词器) */
  private tokenizeWith(tokenizer: Tokenizer, text: string): { ids: number[]; mask: number[] } {
    const ids = tokenizer.encode(text).slice(0, this.maxLen);
    const mask = ids.map(() => 1);
    while (ids.length < this.maxLen) {
      ids.push(0);
      mask.push(0);
    }
    return { ids, mask };
  }

  /** 归一化向量 */
  private normalize(values: number[]): EmbeddingVector {
    let norm = 0;
    for (const v of values) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return { dim: values.length, values: values.map((v) => v / norm) };
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const ort = await this.loadRuntime();
    const tok = await this.tokenizer;
    const { ids, mask } = this.tokenizeWith(tok, text);
    const feeds: Record<string, unknown> = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, this.maxLen]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(mask.map(BigInt)), [1, this.maxLen]),
    };
    // 部分模型(如 gte-large-zh)无 token_type_ids 输入,按模型输入名动态添加
    if (this.inputNames?.includes('token_type_ids')) {
      feeds.token_type_ids = new ort.Tensor('int64', new BigInt64Array(this.maxLen), [1, this.maxLen]);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const outputs = await this.session.run(feeds);
    // last_hidden_state: [1, seq, hidden] → mean pooling
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const last = outputs[this.session.outputNames[0]].data as Float32Array;
    const hidden = last.length / this.maxLen;
    const pooled = new Array<number>(hidden).fill(0);
    for (let i = 0; i < this.maxLen; i++) {
      for (let h = 0; h < hidden; h++) {
        pooled[h] += mask[i] === 1 ? last[i * hidden + h] : 0;
      }
    }
    const denom = mask.reduce((a, b) => a + b, 0) || 1;
    for (let h = 0; h < hidden; h++) pooled[h] /= denom;
    return this.normalize(pooled);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const out: EmbeddingVector[] = [];
    for (const t of texts) out.push(await this.embed(t));
    return out;
  }
}