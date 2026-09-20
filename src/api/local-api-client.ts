import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream, ChatStreamEvent } from './types';
import { t } from '@/i18n';

/** local-model store 实例类型（动态导入避免运行时拉取 WebLLM 链） */
type LocalStore = ReturnType<typeof import('@/stores/local-model').useLocalModelStore>;

/** WebLLM 引擎 top_p 的最终兜底值（请求与 store 都未设置时） */
const LOCAL_FALLBACK_TOP_P = 0.95;

/**
 * P0-3：解析本地模型实际使用的 top_p
 *
 * 优先级：request.topP（角色级 ?? Profile 级 ?? 全局默认）> store.defaultTopP > 0.95
 * 语义沿用 T-16：`undefined` / `null` = 未设置，继续向下回落（不能用 0 兜底）。
 */
function resolveLocalTopP(request: ChatRequest, store: LocalStore): number {
  if (typeof request.topP === 'number' && Number.isFinite(request.topP)) {
    return request.topP;
  }
  const storeTopP = (store as { settings?: { defaultTopP?: number } }).settings?.defaultTopP;
  if (typeof storeTopP === 'number' && Number.isFinite(storeTopP)) {
    return storeTopP;
  }
  return LOCAL_FALLBACK_TOP_P;
}

/**
 * 本地 WebLLM 客户端 (第9条)
 *
 * 将浏览器内本地模型（WebLLM）推理包装为 ApiClient，
 * 使 ChatManager 能以统一接口调用「云端 API」或「本地模型」。
 *
 * 设计：
 * - 本地模型注册表 + 引擎由 local-model store 管理（models/加载状态/推理）
 * - 本客户端仅记录目标模型 id，推理前确保模型已加载
 * - chatStream 为单次生成：引擎内部流式，对外一次性返回（ChatManager 兼容）
 *
 * P0 能力边界（硬边界，UI 侧据此隐藏对应控件）：
 * - 支持 `top_p`（WebLLM 引擎原生参数）
 * - 不支持 `presence_penalty` / `frequency_penalty` / `reasoning_effort` → 静默忽略
 * - 思维链只能走**标签型**（模型输出 `<think>…</think>`），由编排层统一解析
 */
export class LocalApiClient implements ApiClient {
  readonly provider = 'local';

  constructor(private readonly modelId: string) {}

  /** 确保引擎可用且目标模型已加载 */
  private async ensureModel(): Promise<LocalStore> {
    const { useLocalModelStore } = await import('@/stores/local-model');
    const store = useLocalModelStore();
    if (!store.isAvailable) {
      throw new Error(t('core.localEngineUnavailable'));
    }
    if (store.loadedModelId !== this.modelId) {
      const ok = await store.loadModel(this.modelId);
      if (!ok) throw new Error(store.lastError ?? t('core.localModelLoadFailed', { id: this.modelId }));
    }
    return store;
  }

  async chat(request: ChatRequest): Promise<string> {
    const store = await this.ensureModel();
    // T-05 + P0-3：top-p **优先读请求**（修既有漏洞：此前硬编码 ?? 0.95，
    // 从不读 request.topP，导致角色级/Profile 级设置对本地模型完全无效）；
    // 请求未设置时才回落到 store 默认，最后才是 0.95。
    const topP = resolveLocalTopP(request, store);
    return store.infer({
      modelId: this.modelId,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })) as Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }>,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      topP,
    });
  }

  async *chatStream(request: ChatRequest): ChatStream {
    // T-04: 引擎 infer 的 onDelta 是同步回调,async generator 无法在回调内 yield。
    // 用「队列 + 唤醒」异步通道:回调实时入队,generator 消费队列逐 token 产出。
    let resolveWait: (() => void) | null = null;
    const queue: ChatStreamEvent[] = [];
    let done = false;
    const wake = () => {
      resolveWait?.();
      resolveWait = null;
    };

    // 用户中止:入队 error 事件,唤醒等待
    const abortHandler = () => {
      queue.push({ type: 'error', error: t('core.stoppedGenerating') });
      wake();
    };
    if (request.signal?.aborted) {
      abortHandler();
    } else {
      request.signal?.addEventListener('abort', abortHandler);
    }

    const run = (async () => {
      try {
        const store = await this.ensureModel();
        let full = '';
        await store.infer(
          {
            modelId: this.modelId,
            messages: request.messages.map((m) => ({ role: m.role, content: m.content })) as Array<{
              role: 'system' | 'user' | 'assistant';
              content: string;
            }>,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            topP: resolveLocalTopP(request, store),
          },
          (delta) => {
            full += delta;
            queue.push({ type: 'delta', delta });
            wake();
          }
        );
        queue.push({ type: 'done', fullContent: full, finishReason: 'stop' });
        wake();
      } catch (err) {
        queue.push({
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        wake();
      } finally {
        done = true;
        wake();
      }
    })();

    try {
      while (true) {
        while (queue.length === 0) {
          if (done) return;
          await new Promise<void>((r) => {
            resolveWait = r;
          });
        }
        const ev = queue.shift()!;
        yield ev;
      }
    } finally {
      request.signal?.removeEventListener('abort', abortHandler);
      // 让后台 run 收尾(失败时避免未处理 rejection)
      run.catch(() => {});
    }
  }

  async ping(): Promise<boolean> {
    try {
      const store = await this.ensureModel();
      return store.isAvailable;
    } catch {
      return false;
    }
  }
}
