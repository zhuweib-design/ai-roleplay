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

/** 当前语言（响应式，切换后所有 t() 调用自动更新） */
export const localeRef = ref<Locale>('zh');

/** 切换语言 */
export function setLocale(locale: Locale): void {
  localeRef.value = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en');
  }
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
