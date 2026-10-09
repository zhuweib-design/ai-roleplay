/**
 * 随机事件注入痕迹（E11，L 层）
 *
 * 与 `promptTrace` 同一套纪律：**只留标识，不留正文**。
 * 事件的 `description` 是模型生成的整段文本，既会撑大持久化体积，也可能把
 * 未公开设定原文显示在会话里；界面上要回答的是"这轮带进了哪条事件"，
 * 一句名字加一个去处就够。
 *
 * 为什么必须在组装提示词那一刻抓：事件表**不落盘**（`stores/events.ts` 注明
 * 事件仅在内存中维护），刷新后当初注入的那条就不存在了；而随机事件的历史记录
 * （`results`）是"生成"历史、全局环形缓冲、没有 chatId/messageId，事后无从回推
 * "这条回复当时带了哪条事件"。
 */
import type { StoryEvent } from '@core/event-types';

export interface EventTraceItem {
  eventId: string;
  /** 事件名（注入行里显示的就是它） */
  name: string;
  /** 场景标签；随机事件生成出来的这条固定为 null，故为可选 */
  sceneName?: string;
}

/**
 * 事件列表 → 可持久化、可渲染的裁剪视图。
 *
 * 传空或全非激活时返回空数组（调用方据此不写字段，旧数据零迁移）。
 * 上限与 `promptTrace` 同口径地保守：一次注入的事件数本来就少
 * （`MAX_ACTIVE_RANDOM_EVENTS = 1`），这里只兜住手工塞入的极端情况。
 */
export function toEventTraceItems(events: StoryEvent[] | undefined): EventTraceItem[] {
  return (events ?? [])
    .filter((e) => e.state === 'active')
    .slice(0, 8)
    .map((e) => {
      const item: EventTraceItem = { eventId: e.id, name: e.name };
      if (e.sceneName) item.sceneName = e.sceneName;
      return item;
    });
}
