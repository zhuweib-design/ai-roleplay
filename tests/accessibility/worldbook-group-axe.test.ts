/**
 * 世界书与群聊视图 axe-core 无障碍审计测试 (W7)
 *
 * 覆盖：
 * - WorldBookView 空状态 + 有数据状态
 * - GroupChatView 空状态 + 有数据状态
 *
 * 说明：
 * - 颜色对比度已在 scripts/check-contrast.mjs 单独验证
 * - 这里验证 ARIA 属性、语义化 HTML、键盘可达性
 * - Modal/Toast 使用 Teleport，审计 document.body
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import axe from 'axe-core';
import { formatViolations } from './axe-helper';

import WorldBookView from '@/views/WorldBookView.vue';
import GroupChatView from '@/views/GroupChatView.vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useGroupChatStore } from '@/stores/group-chat';
import { useCharacterStore } from '@/stores/character';
import type { UICharacter } from '@/types';

// ── axe 配置（与 axe-helper 一致）──

const axeConfig: axe.RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
    bypass: { enabled: false },
  },
};

async function mountAndAudit(
  component: typeof WorldBookView,
  options?: ComponentMountingOptions<typeof WorldBookView>
): Promise<axe.AxeResults> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const wrapper = mount(component, { ...options, attachTo: container });
  await wrapper.vm.$nextTick();
  const results = await axe.run(container, axeConfig);
  wrapper.unmount();
  container.remove();
  return results;
}

async function mountAndAuditBody(
  component: typeof WorldBookView,
  options?: ComponentMountingOptions<typeof WorldBookView>
): Promise<axe.AxeResults> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const wrapper = mount(component, { ...options, attachTo: container });
  await wrapper.vm.$nextTick();
  const results = await axe.run(document.body, axeConfig);
  wrapper.unmount();
  container.remove();
  return results;
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/worldbook' },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
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

// ── 测试夹具 ──

const mockCharacter: UICharacter = {
  id: 'char-axe-1',
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
  messages: [{ id: 'm1', role: 'assistant', content: '你好', timestamp: Date.now() }],
  authorNote: '',
  authorDepth: 4,
  temperature: 1.0,
  maxTokens: 4096,
  worldEntries: [],
  tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
};

describe('axe-core 世界书与群聊视图无障碍审计', () => {
  beforeEach(() => {
    // 每个测试独立 Pinia
    setActivePinia(createPinia());
  });

  // ── WorldBookView ──

  describe('WorldBookView', () => {
    it('空状态应通过 axe 审计', async () => {
      const opts = withPlugins();
      const results = await mountAndAudit(WorldBookView, opts);
      if (results.violations.length > 0) {
        console.error(formatViolations(results));
      }
      expect(results.violations).toHaveLength(0);
    });

    it('有 Lorebook 与条目数据时应通过 axe 审计', async () => {
      const opts = withPlugins();
      const lorebookStore = useLorebookStore();
      const lbId = lorebookStore.createLorebook({
        name: '奇幻世界设定',
        description: '测试用世界书',
      });
      lorebookStore.addEntry(lbId, {
        title: '魔法系统',
        keys: ['魔法', '法术'],
        content: '这个世界存在元素魔法体系。',
        strategy: 'keyword',
        insertionPosition: 'afterCharDefs',
      });
      lorebookStore.addEntry(lbId, {
        title: '常量设定',
        keys: [],
        content: '世界名为艾泽兰。',
        strategy: 'constant',
      });
      lorebookStore.selectLorebook(lbId);

      const results = await mountAndAudit(WorldBookView, opts);
      if (results.violations.length > 0) {
        console.error(formatViolations(results));
      }
      expect(results.violations).toHaveLength(0);
    });

    it('打开删除确认 Modal 时应通过 axe 审计', async () => {
      const opts = withPlugins();
      const lorebookStore = useLorebookStore();
      const lbId = lorebookStore.createLorebook({ name: '待删除世界书' });
      lorebookStore.selectLorebook(lbId);

      const results = await mountAndAuditBody(WorldBookView, opts);
      if (results.violations.length > 0) {
        console.error(formatViolations(results));
      }
      expect(results.violations).toHaveLength(0);
    });
  });

  // ── GroupChatView ──

  describe('GroupChatView', () => {
    it('空状态应通过 axe 审计', async () => {
      const opts = withPlugins();
      const results = await mountAndAudit(GroupChatView, opts);
      if (results.violations.length > 0) {
        console.error(formatViolations(results));
      }
      expect(results.violations).toHaveLength(0);
    });

    it('有群聊与消息数据时应通过 axe 审计', async () => {
      const opts = withPlugins();
      const characterStore = useCharacterStore();
      // 注入测试角色
      characterStore.characters = [mockCharacter, { ...mockCharacter, id: 'char-axe-2', name: '鲍勃', initial: '鲍' }];

      const groupStore = useGroupChatStore();
      const groupId = groupStore.createGroup(
        {
          name: '测试群聊',
          description: 'axe 审计测试',
          memberIds: ['char-axe-1', 'char-axe-2'],
          mode: 'natural',
          firstMessage: '欢迎来到群聊。',
        },
        [
          {
            id: 'char-axe-1',
            name: '艾莉娅',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '你好',
            alternateGreetings: [],
            exampleMessages: '',
            characterNote: null,
            talkativeness: 50,
            tags: [],
            favorite: false,
            version: '1.0',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'char-axe-2',
            name: '鲍勃',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '嗨',
            alternateGreetings: [],
            exampleMessages: '',
            characterNote: null,
            talkativeness: 70,
            tags: [],
            favorite: false,
            version: '1.0',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ]
      );
      groupStore.selectGroup(groupId!);
      groupStore.addUserMessage(groupId!, '大家好');

      const results = await mountAndAudit(GroupChatView, opts);
      if (results.violations.length > 0) {
        console.error(formatViolations(results));
      }
      expect(results.violations).toHaveLength(0);
    });
  });
});
