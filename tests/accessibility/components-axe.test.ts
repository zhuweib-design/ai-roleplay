/**
 * 基础组件 axe-core 无障碍审计测试（Phase G4）
 *
 * 覆盖：Icon、Avatar、Modal、Toast、MessageBubble
 *
 * 说明：
 * - axe 在 jsdom 中无法验证颜色对比度（已通过 scripts/check-contrast.mjs 单独验证）
 * - 这里主要验证 ARIA 属性、语义化 HTML、键盘可达性
 * - Modal/Toast 使用 <Teleport>，需审计 document.body
 */
import { describe, it, expect } from 'vitest';
import { mountAndAudit, mountAndAuditBody, formatViolations } from './axe-helper';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import NavRail from '@/components/layout/NavRail.vue';
import CharacterList from '@/components/layout/CharacterList.vue';
import ContextPanel from '@/components/layout/ContextPanel.vue';
import ChatMain from '@/components/chat/ChatMain.vue';
import SettingsView from '@/views/SettingsView.vue';
import CharactersView from '@/views/CharactersView.vue';
import CharacterEditorView from '@/views/CharacterEditorView.vue';

import type { UICharacter, UIMessage } from '@/types';

// ── 测试夹具 ──

const gradientCharacter: UICharacter = {
  id: 'char-1',
  name: '艾莉娅',
  avatarType: 'gradient',
  gradientFrom: 'var(--tk-cyan-500)',
  gradientTo: 'var(--tk-cyan-700)',
  initial: '艾',
  lastActive: '刚刚',
  favorite: false,
  tags: ['奇幻', '法师'],
  description: '来自北方森林的精灵法师',
  model: 'GPT-4o',
  conversations: [],
  messages: [],
  authorNote: '',
  authorDepth: 4,
  temperature: 1.0,
  maxTokens: 4096,
  worldEntries: [],
  tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
};

const userMessage: UIMessage = {
  id: 'msg-1',
  role: 'user',
  content: '你好，今天天气怎么样？',
  timestamp: Date.now(),
};

const assistantMessage: UIMessage = {
  id: 'msg-2',
  role: 'assistant',
  narration: '微笑',
  content: '你好！今天天气晴朗。',
  narrationAfter: '鞠躬',
  timestamp: Date.now(),
};

const generatingMessage: UIMessage = {
  id: 'msg-3',
  role: 'assistant',
  content: '',
  generating: true,
  timestamp: Date.now(),
};

// ── Router + Pinia 全局插件夹具 ──

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

function withPlugins() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createTestRouter();
  return {
    global: {
      plugins: [pinia, router],
    },
  };
}

// ── 测试 ──

describe('axe-core 基础组件无障碍审计', () => {
  it('Icon 图标组件应通过 axe 审计', async () => {
    const results = await mountAndAudit(Icon, {
      props: { name: 'house', size: 24 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Avatar（渐变模式）应通过 axe 审计', async () => {
    const results = await mountAndAudit(Avatar, {
      props: { character: gradientCharacter, size: 48 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Avatar（图像模式）应通过 axe 审计', async () => {
    const imageChar = { ...gradientCharacter, avatarType: 'image' as const, avatar: 'data:image/svg+xml;base64,PHN2Zy8+' };
    const results = await mountAndAudit(Avatar, {
      props: { character: imageChar, size: 48 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Modal（带标题）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Modal, {
      props: { modelValue: true, title: '确认操作', dismissible: true },
      slots: {
        default: '<p>确定要执行此操作吗？</p>',
        footer: '<button type="button">确认</button><button type="button">取消</button>',
      },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Modal（无标题，用 aria-label）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Modal, {
      props: { modelValue: true, ariaLabel: '操作确认对话框', dismissible: true },
      slots: {
        default: '<p>内容</p>',
      },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Modal（关闭状态）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Modal, {
      props: { modelValue: false, title: '隐藏的对话框' },
      slots: { default: '<p>不可见</p>' },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Toast（info）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Toast, {
      props: { modelValue: true, type: 'info', message: '操作已完成', duration: 0 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Toast（error）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Toast, {
      props: { modelValue: true, type: 'error', message: '操作失败，请重试', duration: 0 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('Toast（success）应通过 axe 审计', async () => {
    const results = await mountAndAuditBody(Toast, {
      props: { modelValue: true, type: 'success', message: '保存成功', duration: 0 },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('MessageBubble（用户消息）应通过 axe 审计', async () => {
    const results = await mountAndAudit(MessageBubble, {
      props: { msg: userMessage },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('MessageBubble（助手消息含 narration）应通过 axe 审计', async () => {
    const results = await mountAndAudit(MessageBubble, {
      props: { msg: assistantMessage },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('MessageBubble（生成中状态）应通过 axe 审计', async () => {
    const results = await mountAndAudit(MessageBubble, {
      props: { msg: generatingMessage },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('NavRail 导航栏应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(NavRail, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('CharacterList 角色列表应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(CharacterList, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('ContextPanel 上下文面板应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(ContextPanel, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('ChatMain 聊天主区应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(ChatMain, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('SettingsView 系统设置页应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(SettingsView, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('CharactersView 角色管理页应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(CharactersView, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('CharacterEditorView（新建模式）应通过 axe 审计', async () => {
    const opts = withPlugins();
    const results = await mountAndAudit(CharacterEditorView, opts);
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });

  it('CharacterEditorView（编辑模式）应通过 axe 审计', async () => {
    const opts = withPlugins();
    // 使用 character store 默认加载的 seraphina 角色 id
    const results = await mountAndAudit(CharacterEditorView, {
      ...opts,
      props: { id: 'seraphina' },
    });
    if (results.violations.length > 0) {
      console.error(formatViolations(results));
    }
    expect(results.violations).toHaveLength(0);
  });
});
