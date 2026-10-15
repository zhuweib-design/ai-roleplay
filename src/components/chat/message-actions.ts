import type { IconName } from '@/components/common/icons';
import { t } from '@/i18n';

export interface MsgAction {
  key: string;
  icon: IconName;
  label: string;
  danger?: boolean;
}

/**
 * AI 消息的操作清单——桌面 hover 工具条与触屏长按动作条共用这一份。
 * 两处各写一遍迟早会长成两个不一样的清单，所以只留一个出口。
 */
export function assistantMsgActions(): MsgAction[] {
  return [
    { key: 'edit', icon: 'pencil', label: t('bubble.edit') },
    { key: 'copy', icon: 'copy', label: t('bubble.copy') },
    { key: 'speak', icon: 'volume-2', label: t('bubble.speak') },
    { key: 'translate', icon: 'globe', label: t('bubble.translate') },
    { key: 'regenerate', icon: 'refresh-cw', label: t('bubble.regenerate') },
    // 注：原「分支」操作为未实现占位（点击弹出"演示"），已移除入口
    { key: 'delete', icon: 'trash-2', label: t('bubble.delete'), danger: true },
  ];
}
