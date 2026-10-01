/**
 * rag-model-catalog — 嵌入模型"自动择优"结果目录（纯 localStorage 同步函数）
 *
 * 从 rag-benchmark 拆出（ORT_ISOLATION_DESIGN S1）：vector-model-manager 的
 * `selectVectorModel` 是**同步**函数，必须同步读取择优结果；但 rag-benchmark
 * 静态依赖 onnx-embedding-provider（→ onnxruntime-web），导致首屏 entry 经
 * dual-channel-runtime 被拖入 ort（见 docs/dev/ORT_ISOLATION_DESIGN.md §2）。
 * 把零依赖的目录函数下沉到本模块，切断 vector-model-manager → rag-benchmark 边。
 */

const BEST_KEY = 'aijiuguan.bestEmbeddingModel';

/** 读取最佳模型 id(无则 null) */
export function getBestEmbeddingModel(): string | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

/** 持久化最佳模型与跑分指标 */
export function setBestEmbeddingModel(id: string, recall: number, latencyMs: number): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ id, recall, latencyMs, timestamp: Date.now() }));
  } catch {
    /* 环境无 localStorage:静默 */
  }
}

/** 清除择优结果,恢复平台默认 */
export function clearBestEmbeddingModel(): void {
  try {
    localStorage.removeItem(BEST_KEY);
  } catch {
    /* 静默 */
  }
}
