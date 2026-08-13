import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream, ChatStreamEvent } from './types';
import { t } from '@/i18n';

/** local-model store 实例类型（动态导入避免运行时拉取 WebLLM 链） */
type LocalStore = ReturnType<typeof import('@/stores/local-model').useLocalModelStore>;

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
    // T-05: 透传 top-p（store 层用 settings.defaultTopP 兜底）
    const store2 = store as { settings?: { defaultTopP?: number } };
    const topP = (store2.settings?.defaultTopP as number | undefined) ?? 0.95;
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
            topP: (store as { settings?: { defaultTopP?: number } }).settings?.defaultTopP ?? 0.95,
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
