/**
 * Persona Store 单元测试 (迭代22 · W10)
 *
 * 覆盖 F07 功能：
 * - 默认 Persona 自动创建
 * - CRUD：createPersona / updatePersona / deletePersona
 * - activePersona / activeUserName 计算属性（{{user}} 宏替换值来源）
 * - 至少保留 1 个 Persona 约束
 * - validatePersona 校验函数
 * - loadFromStorage 首次启动自动初始化默认 Persona
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePersonaStore, validatePersona, MAX_PERSONA_NAME_LENGTH } from '../../src/stores/persona';
import { useSettingsStore } from '../../src/stores/settings';
import type { Persona } from '@/types';
import type { StorageAdapter } from '@/storage/storage-adapter';

// ── Mock 存储适配器 ──

class MockStorageAdapter implements Partial<StorageAdapter> {
  public personas: Persona[] = [];
  public saveCalls: Persona[] = [];
  public deleteCalls: string[] = [];

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async loadPersonas(): Promise<Persona[]> {
    return [...this.personas];
  }
  async savePersona(persona: Persona): Promise<void> {
    this.saveCalls.push({ ...persona });
    const idx = this.personas.findIndex((p) => p.id === persona.id);
    if (idx >= 0) this.personas[idx] = { ...persona };
    else this.personas.push({ ...persona });
  }
  async loadPersona(id: string): Promise<Persona | null> {
    return this.personas.find((p) => p.id === id) ?? null;
  }
  async deletePersona(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.personas = this.personas.filter((p) => p.id !== id);
  }
}

// ── 测试夹具 ──

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: `p-${Math.random().toString(36).slice(2, 9)}`,
    name: 'TestUser',
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── 测试用例 ──

describe('usePersonaStore — F07 单元测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始状态', () => {
    it('personas 列表初始为空', () => {
      const store = usePersonaStore();
      expect(store.personas).toHaveLength(0);
    });

    it('activePersona 在无激活时为 null', () => {
      const store = usePersonaStore();
      expect(store.activePersona).toBeNull();
    });

    it('activeUserName 无激活时回退到 "User"', () => {
      const store = usePersonaStore();
      expect(store.activeUserName).toBe('User');
    });
  });

  describe('createPersona', () => {
    it('创建 Persona 并加入列表', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '勇者', description: '冒险者' });
      expect(id).toBeTruthy();
      expect(store.personas).toHaveLength(1);
      expect(store.personas[0].name).toBe('勇者');
      expect(store.personas[0].description).toBe('冒险者');
    });

    it('未提供 name 时使用默认值 "新身份"', () => {
      const store = usePersonaStore();
      const id = store.createPersona();
      expect(id).toBeTruthy();
      expect(store.personas[0].name).toBe('新身份');
    });

    it('name 为空字符串时验证失败返回空字符串', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '   ' });
      expect(id).toBe('');
      expect(store.personas).toHaveLength(0);
      expect(store.lastError).toContain('名称不能为空');
    });

    it('name 超过最大长度时验证失败', () => {
      const store = usePersonaStore();
      const longName = 'a'.repeat(MAX_PERSONA_NAME_LENGTH + 1);
      const id = store.createPersona({ name: longName });
      expect(id).toBe('');
      expect(store.lastError).toContain('名称不能超过');
    });

    it('创建后 lastInfo 提示成功', () => {
      const store = usePersonaStore();
      store.createPersona({ name: '魔法师' });
      expect(store.lastInfo).toContain('已创建 Persona');
      expect(store.lastInfo).toContain('魔法师');
    });
  });

  describe('updatePersona', () => {
    it('更新名称成功', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '原名' });
      const ok = store.updatePersona(id, { name: '新名' });
      expect(ok).toBe(true);
      expect(store.personas[0].name).toBe('新名');
    });

    it('更新描述成功', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: 'Test' });
      const ok = store.updatePersona(id, { description: '新描述' });
      expect(ok).toBe(true);
      expect(store.personas[0].description).toBe('新描述');
    });

    it('id 不存在返回 false', () => {
      const store = usePersonaStore();
      const ok = store.updatePersona('nonexistent', { name: 'X' });
      expect(ok).toBe(false);
    });

    it('更新为空名称验证失败', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '原名' });
      const ok = store.updatePersona(id, { name: '   ' });
      expect(ok).toBe(false);
      expect(store.lastError).toContain('名称不能为空');
    });
  });

  describe('deletePersona', () => {
    it('删除 Persona 后从列表移除', () => {
      const store = usePersonaStore();
      const id1 = store.createPersona({ name: 'A' });
      store.createPersona({ name: 'B' });
      expect(store.personas).toHaveLength(2);

      store.deletePersona(id1);
      expect(store.personas).toHaveLength(1);
      expect(store.personas.find((p) => p.id === id1)).toBeUndefined();
    });

    it('至少保留 1 个 Persona — 仅剩 1 个时拒绝删除', () => {
      const store = usePersonaStore();
      store.createPersona({ name: '唯一' });
      expect(store.personas).toHaveLength(1);

      store.deletePersona(store.personas[0].id);
      expect(store.personas).toHaveLength(1);
      expect(store.lastError).toContain('至少保留 1 个 Persona');
    });

    it('删除当前激活的 Persona 时自动切换到第一个', () => {
      const settings = useSettingsStore();
      const store = usePersonaStore();
      const id1 = store.createPersona({ name: 'A' });
      const id2 = store.createPersona({ name: 'B' });
      settings.setActivePersona(id2);

      store.deletePersona(id2);
      expect(settings.activePersonaId).toBe(id1);
    });

    it('删除后 lastInfo 提示', () => {
      const store = usePersonaStore();
      const id1 = store.createPersona({ name: 'A' });
      store.createPersona({ name: 'B' });
      store.deletePersona(id1);
      expect(store.lastInfo).toContain('已删除 Persona');
      expect(store.lastInfo).toContain('A');
    });
  });

  describe('setActivePersona / activeUserName', () => {
    it('激活后 activePersona 返回该 Persona', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '英雄' });
      store.setActivePersona(id);
      expect(store.activePersona).not.toBeNull();
      expect(store.activePersona?.id).toBe(id);
    });

    it('activeUserName 反映激活的 Persona 名称', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '勇者' });
      store.setActivePersona(id);
      expect(store.activeUserName).toBe('勇者');
    });

    it('setActivePersona(null) 后 activeUserName 回退到 "User"', () => {
      const store = usePersonaStore();
      const id = store.createPersona({ name: '勇者' });
      store.setActivePersona(id);
      store.setActivePersona(null);
      expect(store.activePersona).toBeNull();
      expect(store.activeUserName).toBe('User');
    });
  });

  describe('loadFromStorage', () => {
    it('存储有 Persona 时加载到列表', async () => {
      const mock = new MockStorageAdapter();
      mock.personas = [makePersona({ id: 'p1', name: '加载1' })];
      const store = usePersonaStore();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await store.loadFromStorage();
      expect(store.personas).toHaveLength(1);
      expect(store.personas[0].name).toBe('加载1');
    });

    it('存储为空时自动创建默认 "User" Persona 并激活', async () => {
      const mock = new MockStorageAdapter();
      const settings = useSettingsStore();
      const store = usePersonaStore();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await store.loadFromStorage();
      expect(store.personas).toHaveLength(1);
      expect(store.personas[0].name).toBe('User');
      expect(settings.activePersonaId).toBe(store.personas[0].id);
    });
  });

  describe('searchQuery / filteredPersonas', () => {
    it('按名称过滤', () => {
      const store = usePersonaStore();
      store.createPersona({ name: '魔法师' });
      store.createPersona({ name: '战士' });
      store.setSearchQuery('魔法');
      expect(store.filteredPersonas).toHaveLength(1);
      expect(store.filteredPersonas[0].name).toBe('魔法师');
    });

    it('按描述过滤', () => {
      const store = usePersonaStore();
      store.createPersona({ name: 'A', description: '勇敢的战士' });
      store.createPersona({ name: 'B', description: '聪明的法师' });
      store.setSearchQuery('法师');
      expect(store.filteredPersonas).toHaveLength(1);
      expect(store.filteredPersonas[0].name).toBe('B');
    });

    it('空搜索词返回全部', () => {
      const store = usePersonaStore();
      store.createPersona({ name: 'A' });
      store.createPersona({ name: 'B' });
      store.setSearchQuery('');
      expect(store.filteredPersonas).toHaveLength(2);
    });
  });

  describe('clearLastError', () => {
    it('清空 lastError 和 lastInfo', () => {
      const store = usePersonaStore();
      store.createPersona({ name: '' }); // 触发错误
      expect(store.lastError).not.toBeNull();
      store.clearLastError();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });
  });
});

// ── validatePersona 纯函数测试 ──

describe('validatePersona — 校验函数', () => {
  it('合法 Persona 通过', () => {
    const errors = validatePersona({ name: '勇者' });
    expect(errors).toHaveLength(0);
  });

  it('name 为空字符串失败', () => {
    const errors = validatePersona({ name: '' });
    expect(errors).toContain('Persona 名称不能为空');
  });

  it('name 仅空格失败', () => {
    const errors = validatePersona({ name: '   ' });
    expect(errors).toContain('Persona 名称不能为空');
  });

  it('name 超长失败', () => {
    const errors = validatePersona({ name: 'a'.repeat(MAX_PERSONA_NAME_LENGTH + 1) });
    expect(errors.some((e) => e.includes('不能超过'))).toBe(true);
  });

  it('description 过长失败（软限制的 2 倍）', () => {
    const errors = validatePersona({
      name: 'Test',
      description: 'a'.repeat(1001),
    });
    expect(errors.some((e) => e.includes('描述不应过长'))).toBe(true);
  });
});
