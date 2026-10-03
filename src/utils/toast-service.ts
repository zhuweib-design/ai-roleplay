/**
 * 全局 Toast 通知服务（第三轮优化项 8 · S1，ROUND_3_HIGH_RISK_SPLIT_DESIGN §3.2）
 *
 * 设计：
 * - 单条显示、先进先出排队：连续通知不重叠、不丢失
 * - 显示容器只在 App.vue 挂载一个（复用现有 Toast.vue 的关闭行为与默认时长）
 * - 队列从空变为有消息时 modelValue false→true 触发现有 Toast 自动计时；
   关闭/自动消失后 dismissToast 移除首项，再显示下一条
 *
 * 类型与现有 Toast.vue 一致；warning 需先扩展组件类型与样式后再纳入。
 */
import { computed, ref } from 'vue';

export type ToastType = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const toastQueue = ref<ToastItem[]>([]);
let toastIdCounter = 0;

/** 全局入口：任何组件 `showToast(type, message)` 触发通知 */
export function showToast(type: ToastType, message: string): void {
  if (!message) return;
  toastQueue.value.push({ id: toastIdCounter++, type, message });
}

/** 当前应显示的通知（队列首项；无通知时 null） */
export function useActiveToast() {
  return computed(() => toastQueue.value[0] ?? null);
}

/** 关闭当前通知（自动消失或手动关闭），显示下一条 */
export function dismissToast(): void {
  toastQueue.value.shift();
}
