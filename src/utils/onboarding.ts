// P2-7 新手引导状态管理(pre-launch 全检 P2 建议)
// 使用独立 localStorage 标志, 不依赖 settings store 的加密持久化链路(最小侵入)。
const ONBOARDING_KEY = 'ai-roleplay:onboarding-done';

/** 是否应展示新手引导(首次启动/未标记完成) */
export function shouldShowOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== '1';
  } catch {
    return true; // 存储不可用: 默认展示, 避免新用户错过引导
  }
}

/** 标记新手引导已完成(仅记录, 不删除其他数据) */
export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* 存储异常时静默, 下次启动会再次展示 */
  }
}
