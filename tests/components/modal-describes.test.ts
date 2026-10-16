/**
 * Modal 的对话框级说明关联（M6-f）
 *
 * 有些弹窗开头那句话说的是**整个对话框在干什么**（群聊"添加成员"的"从已创建的角色里挑"、
 * "生成随机 NPC"的产物说明），不是某个输入框的填法。此前 `Modal` 只有
 * `aria-labelledby`（标题）没有 `aria-describedby`，这类句子在无障碍树里就是孤儿——
 * 读屏用户进对话框只听到标题。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Modal from '@/components/common/Modal.vue';

// Modal 走 Teleport，对话框挂在 body 上：不清干净的话第二条用例会查到上一条留下的 dialog
beforeEach(() => {
  document.body.innerHTML = '';
});

function mountModal(props: Record<string, unknown>) {
  return mount(Modal, {
    props: { modelValue: true, title: '添加成员', ...props },
    slots: { default: '<p id="the-hint">从已创建的角色里挑。</p>' },
    attachTo: document.body,
  });
}

describe('Modal describedBy', () => {
  it('describedBy 落到对话框元素的 aria-describedby', () => {
    const wrapper = mountModal({ describedBy: 'the-hint' });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-describedby')).toBe('the-hint');
    // 指向的 id 必须真的在这个对话框里，否则等于写了个空引用
    expect(dialog?.contains(document.getElementById('the-hint'))).toBe(true);
    wrapper.unmount();
  });

  it('不传时不留空属性（与 aria-labelledby 的取舍一致）', () => {
    mountModal({});
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.hasAttribute('aria-describedby')).toBe(false);
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });
});
