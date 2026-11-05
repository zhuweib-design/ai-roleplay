// R3-4 拆分：随机事件页跨面板共享的格式化与消息冲刷（templates / scenes / generator / results 四面板共用）
import type { useRandomEventsStore } from '@/stores/random-events';
import type { RandomEventTemplate } from '@core/random-event-generator';

type RandomEventsStore = ReturnType<typeof useRandomEventsStore>;
export type NotifyFn = (type: 'info' | 'success' | 'error', message: string) => void;

// 原宿主 flushStoreMessages 的 store 消息冲刷：error 优先，两者互斥且都会清空
interface FlushableStore {
  lastError: string | null;
  lastInfo: string | null;
  clearLastError: () => void;
}

export function flushStoreMessages(store: FlushableStore, notify: NotifyFn): void {
  if (store.lastError) {
    notify('error', store.lastError);
    store.clearLastError();
  } else if (store.lastInfo) {
    notify('success', store.lastInfo);
    store.clearLastError();
  }
}

export function getCategoryLabel(
  store: RandomEventsStore,
  cat: RandomEventTemplate['category']
): string {
  return store.CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;
}

export function getSeverityLabel(
  store: RandomEventsStore,
  sev: RandomEventTemplate['severity']
): string {
  return store.SEVERITY_OPTIONS.find((s) => s.value === sev)?.label ?? sev;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
