/**
 * i18n 轻量国际化模块 (T-13)
 *
 * 设计原则：
 * - 零第三方依赖，契合项目「低门槛离线」定位
 * - 类型安全：MessageKey 由 zh 文案的 key 推导，en 缺 key 编译期报错
 * - 响应式：t() 在模板中使用时读取 localeRef，语言切换自动重渲染
 * - 单一事实源：语言偏好由 settings store 持久化，此处维护运行时 ref
 *
 * 用法：
 *   import { t } from '@/i18n';
 *   // 模板：{{ t('nav.chat') }} / {{ t('common.confirm') }}
 *   // 插值：{{ t('common.imported', { count: n }) }}  ← 文案含 {count}
 */
import { ref } from 'vue';
import zh from './locales/zh';
import en from './locales/en';

export type Locale = 'zh' | 'en';

/** 由 zh 文案 key 推导出的消息 key 类型（en 必须与之对齐） */
export type MessageKey = keyof typeof zh;

const messages: Record<Locale, Record<string, string>> = { zh, en };

/**
 * 语言偏好的同步镜像（localStorage 里的一个字符串）
 *
 * 存在的唯一理由：设置的真值在 IndexedDB，读它必须等异步；首帧因此没有语言可问。
 * 这里让首帧能同步问到一个值，避免"先渲染一屏错语言、异步加载完再翻回去"。
 *
 * - 只在「用户显式选择」和「加载到持久化语言」时写入，**不由探测写入**：
 *   探测值每次启动都会重算，钉进镜像会让浏览器语言变更后仍然错。
 * - 真值始终是持久化的 AppSettings.locale；镜像只是缓存，每次加载都会被它刷新。
 */
const LOCALE_MIRROR_KEY = 'aijiuguan.locale';

/** 读镜像；没有、非法、或存储不可用（隐私模式）都返回 null */
function readLocaleMirror(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_MIRROR_KEY);
    return v === 'zh' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** 写镜像（由 settings store 调用；失败不影响功能，下次探测兜底） */
export function writeLocaleMirror(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_MIRROR_KEY, locale);
  } catch {
    /* 存储不可用：镜像本就只是加速首帧，缺了它退化成原来的异步路径 */
  }
}

/** 把当前语言写进 `<html lang>`（屏幕阅读器与翻译提示都读它） */
function applyHtmlLang(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en');
  }
}

/**
 * 当前语言（响应式，切换后所有 t() 调用自动更新）
 *
 * 初值同步求得：用户选过的语言（镜像）优先，其次浏览器语言，最后中文。
 * 三个来源都不需要等 IndexedDB，所以首帧就是终帧
 * （异步加载只会用真值再覆盖一次，见 settings store 的 loadFromStorage）。
 */
export const localeRef = ref<Locale>(readLocaleMirror() ?? detectLocale());

// index.html 里那句静态 `<html lang="zh-CN">` 得在这里改掉：加载路径发现"语言已经
// 是探测值"就不会再调 setLocale，不补这一下，英文首访的文档语言会永久停在 zh-CN。
applyHtmlLang(localeRef.value);

/** 切换语言（不写镜像：写它的是"用户显式选择"与"读到持久化值"两处，探测不算） */
export function setLocale(locale: Locale): void {
  localeRef.value = locale;
  applyHtmlLang(locale);
}

/**
 * 取翻译文本
 * @param key 消息 key（类型安全，编译期校验）
 * @param params 插值参数，如 { count: 3 } 对应文案中的 {count}
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const dict = messages[localeRef.value] ?? messages.zh;
  let text = dict[key] ?? messages.zh[key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** 获取当前语言（非响应式读取，适合事件处理器内使用） */
export function getLocale(): Locale {
  return localeRef.value;
}

/** 从持久化值恢复语言（启动时由 settings store 调用） */
export function initLocale(locale: Locale): void {
  setLocale(locale);
}

/**
 * 按浏览器语言推断界面语言（P2-3，**仅作首访兜底**）
 *
 * - 取值顺序：`navigator.languages[0]` → `navigator.language`
 * - `zh*` → zh；`en*` → en；其余一律回退 zh（当前仅提供这两种语言）
 * - **不得覆盖用户的持久化选择**：调用方须先探测，再让持久化值覆盖它
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh';
  const raw = navigator.languages?.[0] ?? navigator.language ?? '';
  const lang = raw.toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('en')) return 'en';
  return 'zh';
}
