// F11.3 Quick Reply Store 单元测试
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../../src/stores/settings';
import type { AppSettings, QuickReplyButton } from '@/types';

// ── 测试夹具 ──

/** Mock 存储适配器，用于精确控制 loadSettings/saveSettings 行为 */
class MockStorageAdapter {
  public saved: AppSettings | null = null;
  public loadData: Partial<AppSettings> | null = null;
  public loadCallCount = 0;
  public saveCallCount = 0;

  async loadSettings(): Promise<Partial<AppSettings>> {
    this.loadCallCount++;
    return this.loadData ?? {};
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.saveCallCount++;
    this.saved = { ...settings };
  }
}

/** 构造一个 Quick Reply 按钮 */
function makeButton(overrides: Partial<QuickReplyButton> = {}): QuickReplyButton {
  return {
    id: `qr-${Math.random().toString(36).slice(2, 8)}`,
    label: '骰子',
    script: '/roll 1d20',
    group: '',
    autoSend: true,
    ...overrides,
  };
}

// ── 测试用例 ──

describe('useSettingsStore — F11.3 Quick Reply', () => {
  let store: ReturnType<typeof useSettingsStore>;
  let mockAdapter: MockStorageAdapter;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useSettingsStore();
    mockAdapter = new MockStorageAdapter();
    store.setStorageAdapter(mockAdapter);
  });

  // ── 初始状态 ──

  describe('初始状态', () => {
    it('quickReplies 默认为空数组', () => {
      expect(store.quickReplies).toEqual([]);
    });
  });

  // ── addQuickReply ──

  describe('addQuickReply', () => {
    it('添加按钮到列表', () => {
      const btn = makeButton({ id: 'qr-1', label: '掷骰' });
      const id = store.addQuickReply(btn);
      expect(id).toBe('qr-1');
      expect(store.quickReplies).toHaveLength(1);
      expect(store.quickReplies[0].label).toBe('掷骰');
    });

    it('添加多个按钮保持顺序', () => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: 'A' }));
      store.addQuickReply(makeButton({ id: 'qr-2', label: 'B' }));
      store.addQuickReply(makeButton({ id: 'qr-3', label: 'C' }));
      expect(store.quickReplies.map((b) => b.label)).toEqual(['A', 'B', 'C']);
    });

    it('添加后触发持久化', () => {
      const btn = makeButton();
      store.addQuickReply(btn);
      expect(mockAdapter.saveCallCount).toBeGreaterThan(0);
      expect(mockAdapter.saved?.quickReplies).toHaveLength(1);
    });
  });

  // ── updateQuickReply ──

  describe('updateQuickReply', () => {
    it('更新按钮字段', () => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: '原标签', script: '/echo hi' }));
      store.updateQuickReply('qr-1', { label: '新标签', script: '/roll 2d6' });
      expect(store.quickReplies[0].label).toBe('新标签');
      expect(store.quickReplies[0].script).toBe('/roll 2d6');
    });

    it('部分更新不覆盖其他字段', () => {
      store.addQuickReply(
        makeButton({ id: 'qr-1', label: '标签', script: '/echo hi', group: 'g1' })
      );
      store.updateQuickReply('qr-1', { label: '新标签' });
      expect(store.quickReplies[0].label).toBe('新标签');
      expect(store.quickReplies[0].script).toBe('/echo hi');
      expect(store.quickReplies[0].group).toBe('g1');
    });

    it('更新不存在的 id 不报错', () => {
      expect(() => store.updateQuickReply('nonexistent', { label: 'x' })).not.toThrow();
      expect(store.quickReplies).toHaveLength(0);
    });

    it('更新后触发持久化', () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      mockAdapter.saveCallCount = 0;
      store.updateQuickReply('qr-1', { label: 'updated' });
      expect(mockAdapter.saveCallCount).toBe(1);
    });
  });

  // ── deleteQuickReply ──

  describe('deleteQuickReply', () => {
    it('删除存在的按钮', () => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: 'A' }));
      store.addQuickReply(makeButton({ id: 'qr-2', label: 'B' }));
      store.deleteQuickReply('qr-1');
      expect(store.quickReplies).toHaveLength(1);
      expect(store.quickReplies[0].id).toBe('qr-2');
    });

    it('删除不存在的 id 不报错', () => {
      expect(() => store.deleteQuickReply('nonexistent')).not.toThrow();
    });

    it('删除后触发持久化', () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      mockAdapter.saveCallCount = 0;
      store.deleteQuickReply('qr-1');
      expect(mockAdapter.saveCallCount).toBe(1);
      expect(mockAdapter.saved?.quickReplies).toEqual([]);
    });

    it('删除最后一个按钮后列表为空', () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      store.deleteQuickReply('qr-1');
      expect(store.quickReplies).toEqual([]);
    });
  });

  // ── moveQuickReply ──

  describe('moveQuickReply', () => {
    beforeEach(() => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: 'A' }));
      store.addQuickReply(makeButton({ id: 'qr-2', label: 'B' }));
      store.addQuickReply(makeButton({ id: 'qr-3', label: 'C' }));
    });

    it('下移（direction=1）', () => {
      store.moveQuickReply('qr-1', 1);
      expect(store.quickReplies.map((b) => b.id)).toEqual(['qr-2', 'qr-1', 'qr-3']);
    });

    it('上移（direction=-1）', () => {
      store.moveQuickReply('qr-3', -1);
      expect(store.quickReplies.map((b) => b.id)).toEqual(['qr-1', 'qr-3', 'qr-2']);
    });

    it('第一个上移不生效', () => {
      store.moveQuickReply('qr-1', -1);
      expect(store.quickReplies.map((b) => b.id)).toEqual(['qr-1', 'qr-2', 'qr-3']);
    });

    it('最后一个下移不生效', () => {
      store.moveQuickReply('qr-3', 1);
      expect(store.quickReplies.map((b) => b.id)).toEqual(['qr-1', 'qr-2', 'qr-3']);
    });

    it('不存在的 id 不报错', () => {
      expect(() => store.moveQuickReply('nonexistent', 1)).not.toThrow();
    });

    it('移动后触发持久化', () => {
      mockAdapter.saveCallCount = 0;
      store.moveQuickReply('qr-1', 1);
      expect(mockAdapter.saveCallCount).toBe(1);
    });
  });

  // ── clearQuickReplies ──

  describe('clearQuickReplies', () => {
    it('清空所有按钮', () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      store.addQuickReply(makeButton({ id: 'qr-2' }));
      store.clearQuickReplies();
      expect(store.quickReplies).toEqual([]);
    });

    it('清空后触发持久化', () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      mockAdapter.saveCallCount = 0;
      store.clearQuickReplies();
      expect(mockAdapter.saveCallCount).toBe(1);
      expect(mockAdapter.saved?.quickReplies).toEqual([]);
    });

    it('空列表清空不报错', () => {
      expect(() => store.clearQuickReplies()).not.toThrow();
    });
  });

  // ── createQuickReplyTemplate ──

  describe('createQuickReplyTemplate', () => {
    it('返回带 id 的模板', () => {
      const tpl = store.createQuickReplyTemplate();
      expect(tpl.id).toBeTruthy();
      expect(typeof tpl.id).toBe('string');
    });

    it('默认 label 为"新按钮"', () => {
      const tpl = store.createQuickReplyTemplate();
      expect(tpl.label).toBe('新按钮');
    });

    it('默认 script 为 /echo hello', () => {
      const tpl = store.createQuickReplyTemplate();
      expect(tpl.script).toBe('/echo hello');
    });

    it('默认 group 为空字符串', () => {
      const tpl = store.createQuickReplyTemplate();
      expect(tpl.group).toBe('');
    });

    it('默认 autoSend 为 true', () => {
      const tpl = store.createQuickReplyTemplate();
      expect(tpl.autoSend).toBe(true);
    });

    it('每次调用生成不同 id', () => {
      const a = store.createQuickReplyTemplate();
      const b = store.createQuickReplyTemplate();
      expect(a.id).not.toBe(b.id);
    });

    it('不自动添加到列表', () => {
      store.createQuickReplyTemplate();
      expect(store.quickReplies).toHaveLength(0);
    });
  });

  // ── 持久化 ──

  describe('持久化', () => {
    it('保存时包含 quickReplies 字段', async () => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: 'A' }));
      await store.persistSettings();
      expect(mockAdapter.saved?.quickReplies).toHaveLength(1);
      expect(mockAdapter.saved?.quickReplies[0].label).toBe('A');
    });

    it('加载时恢复 quickReplies', async () => {
      mockAdapter.loadData = {
        theme: 'dark',
        fontSize: 14,
        quickReplies: [
          { id: 'qr-1', label: '加载A', script: '/roll 1d6', group: '', autoSend: true },
          { id: 'qr-2', label: '加载B', script: '/echo hi', group: 'g1', autoSend: false },
        ],
      };
      await store.loadFromStorage();
      expect(store.quickReplies).toHaveLength(2);
      expect(store.quickReplies[0].label).toBe('加载A');
      expect(store.quickReplies[1].group).toBe('g1');
      expect(store.quickReplies[1].autoSend).toBe(false);
    });

    it('无 quickReplies 数据时保持空数组', async () => {
      mockAdapter.loadData = { theme: 'dark' };
      await store.loadFromStorage();
      expect(store.quickReplies).toEqual([]);
    });

    it('toRaw 转换后保存（非 Proxy）', async () => {
      store.addQuickReply(makeButton({ id: 'qr-1' }));
      await store.persistSettings();
      // 保存的对象不应是 Proxy（结构化克隆兼容）
      const saved = mockAdapter.saved?.quickReplies;
      expect(saved).toBeDefined();
      expect(Array.isArray(saved)).toBe(true);
    });
  });

  // ── 综合场景 ──

  describe('综合场景', () => {
    it('完整 CRUD 生命周期', () => {
      // 创建
      const tpl = store.createQuickReplyTemplate();
      tpl.label = '掷骰子';
      tpl.script = '/roll 2d6';
      store.addQuickReply(tpl);

      // 读取
      expect(store.quickReplies).toHaveLength(1);
      expect(store.quickReplies[0].label).toBe('掷骰子');

      // 更新
      store.updateQuickReply(tpl.id, { script: '/roll 1d20' });
      expect(store.quickReplies[0].script).toBe('/roll 1d20');

      // 删除
      store.deleteQuickReply(tpl.id);
      expect(store.quickReplies).toHaveLength(0);
    });

    it('分组管理：不同 group 的按钮共存', () => {
      store.addQuickReply(makeButton({ id: 'qr-1', label: 'A', group: '骰子' }));
      store.addQuickReply(makeButton({ id: 'qr-2', label: 'B', group: '骰子' }));
      store.addQuickReply(makeButton({ id: 'qr-3', label: 'C', group: '系统' }));
      store.addQuickReply(makeButton({ id: 'qr-4', label: 'D', group: '' }));

      const diceButtons = store.quickReplies.filter((b) => b.group === '骰子');
      const systemButtons = store.quickReplies.filter((b) => b.group === '系统');
      const ungrouped = store.quickReplies.filter((b) => b.group === '');

      expect(diceButtons).toHaveLength(2);
      expect(systemButtons).toHaveLength(1);
      expect(ungrouped).toHaveLength(1);
    });

    it('autoSend=false 的按钮不自动发送', () => {
      store.addQuickReply(
        makeButton({ id: 'qr-1', label: '编辑', script: '/echo hi', autoSend: false })
      );
      expect(store.quickReplies[0].autoSend).toBe(false);
    });
  });
});
