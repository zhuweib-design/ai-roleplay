/**
 * 全局 Toast 通知服务（第三轮优化项 8 · S1，ROUND_3_HIGH_RISK_SPLIT_DESIGN §3.2）
 *
 * 设计：
 * - 单条显示、先进先出排队：连续通知不重叠、不丢失
 * - 显示容器只在 App.vue 挂载一个（复用现有 Toast.vue 的关闭行为与分类型时长）
 * - 队列从空变为有消息时 modelValue false→true 触发现有 Toast 自动计时；
   关闭/自动消失后 dismissToast 移除首项，再显示下一条
 *
 * 类型与现有 Toast.vue 一致；warning 需先扩展组件类型与样式后再纳入。
 */
import { computed, ref } from 'vue';

export type ToastType = 'info' | 'success' | 'error';

/**
 * 分类型自动关闭时长（毫秒），Toast.vue 与队列共用这一份契约。
 * 原来一律 5s：确认型提示（"已保存"）也要占住屏幕 5 秒，读起来像"不会自己关"。
 * error 保留 5s —— 需要读完并决定下一步。
 */
export const TOAST_DURATIONS: Record<ToastType, number> = {
  info: 3000,
  success: 3200,
  error: 5000,
};

/** 待显示队列上限：连续点击时不让提示一条接一条刷上半分钟 */
export const TOAST_QUEUE_LIMIT = 5;

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const toastQueue = ref<ToastItem[]>([]);
let toastIdCounter = 0;

/**
 * 超出上限时淘汰最早的一条**非错误**待显示项；
 * 若待显示项全是错误，则丢弃新来的这条（已经在报错了，不必再堆）。
 * 首项正在屏幕上显示，不参与淘汰，所以正在读的那条不会被挤掉。
 */
function evictForCapacity(): void {
  if (toastQueue.value.length <= TOAST_QUEUE_LIMIT) return;
  const victim = toastQueue.value.findIndex((item, index) => index > 0 && item.type !== 'error');
  if (victim === -1) toastQueue.value.pop();
  else toastQueue.value.splice(victim, 1);
}

/** 全局入口：任何组件 `showToast(type, message)` 触发通知 */
export function showToast(type: ToastType, message: string): void {
  if (!message) return;
  // 同一条文字已经在排队就不再重复排队：连点报错时"5 秒 × N 条"最像弹窗粘着不放
  if (toastQueue.value.some((item) => item.type === type && item.message === message)) return;
  toastQueue.value.push({ id: toastIdCounter++, type, message });
  evictForCapacity();
}

/** 当前应显示的通知（队列首项；无通知时 null） */
export function useActiveToast() {
  return computed(() => toastQueue.value[0] ?? null);
}

/** 关闭当前通知（自动消失或手动关闭），显示下一条 */
export function dismissToast(): void {
  toastQueue.value.shift();
}

/** 清空队列（单测需要在用例之间复位模块级队列） */
export function clearToasts(): void {
  toastQueue.value = [];
}
