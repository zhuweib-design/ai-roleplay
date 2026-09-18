import { watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * 滚动锁 composable（跨端评审 I-8，与 Modal.vue:86 同源）。
 * 抽屉 / 弹窗打开时锁定 body 滚动，避免背景穿透滚动。
 * 采用计数器，兼容多个锁持有者（如 Modal 与抽屉同时打开）互不误释放。
 */
let lockCount = 0;

function applyLock() {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = 'hidden';
}

function releaseLock() {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = '';
}

export function useScrollLock(active: Ref<boolean>) {
  let locked = false;

  watch(
    active,
    (v) => {
      if (v && !locked) {
        locked = true;
        lockCount += 1;
        applyLock();
      } else if (!v && locked) {
        locked = false;
        releaseLock();
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (locked) {
      locked = false;
      releaseLock();
    }
  });
}
