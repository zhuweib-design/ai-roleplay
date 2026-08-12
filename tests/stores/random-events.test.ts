/**
 * random-events store 单元测试 (F17.3)
 *
 * 覆盖：
 * - 模板 CRUD（createTemplate/updateTemplate/deleteTemplate/getTemplate/toggleTemplate）
 * - 场景配置（getOrCreateSceneConfig/updateSceneConfig/toggleScene/deleteSceneConfig）
 * - 生成器配置（updateGeneratorConfig/toggleGenerator）
 * - 生成决策（decide）
 * - 结果记录与反馈（recordResult/applyFeedback）
 * - 统计（stats 计算属性）
 * - resetAll / clearResults
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRandomEventsStore } from '../../src/stores/random-events';
import {
  createDefaultGeneratorConfig,
  createRandomEventResult,
} from '@core/random-event-generator';

// ── 测试夹具 ──

function tplInput(overrides: Partial<Parameters<ReturnType<typeof useRandomEventsStore>['createTemplate']>[0]> = {}) {
  return {
    name: '神秘访客',
    description: '一位披着斗篷的访客出现',
    category: 'encounter' as const,
    severity: 'minor' as const,
    probability: 50,
    ...overrides,
  };
}

function makeGenerated() {
  return { name: '神秘访客', description: '描述', isOneShot: true as const };
}

// ── 测试套件 ──

describe('random-events store', () => {
  let store: ReturnType<typeof useRandomEventsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useRandomEventsStore();
  });

  // ── 模板 CRUD ──

  describe('模板 CRUD', () => {
    it('createTemplate 创建成功返回 id', () => {
      const id = store.createTemplate(tplInput());
      expect(id).toBeTruthy();
      expect(id).toMatch(/^tpl-/);
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].name).toBe('神秘访客');
    });

    it('createTemplate 名称校验失败返回 null', () => {
      const id = store.createTemplate(tplInput({ name: '' }));
      expect(id).toBeNull();
      expect(store.templates).toHaveLength(0);
      expect(store.lastError).toContain('名称');
    });

    it('createTemplate 概率超范围失败', () => {
      const id = store.createTemplate(tplInput({ probability: 200 }));
      expect(id).toBeNull();
      expect(store.lastError).toContain('概率');
    });

    it('updateTemplate 更新成功', () => {
      const id = store.createTemplate(tplInput());
      const ok = store.updateTemplate(id!, { probability: 80 });
      expect(ok).toBe(true);
      expect(store.getTemplate(id!)?.probability).toBe(80);
    });

    it('updateTemplate 不存在返回 false', () => {
      const ok = store.updateTemplate('nonexistent', { probability: 80 });
      expect(ok).toBe(false);
      expect(store.lastError).toBe('模板不存在');
    });

    it('updateTemplate 校验失败返回 false', () => {
      const id = store.createTemplate(tplInput());
      const ok = store.updateTemplate(id!, { name: '' });
      expect(ok).toBe(false);
      expect(store.lastError).toContain('名称');
    });

    it('deleteTemplate 删除成功', () => {
      const id = store.createTemplate(tplInput());
      const ok = store.deleteTemplate(id!);
      expect(ok).toBe(true);
      expect(store.templates).toHaveLength(0);
    });

    it('deleteTemplate 不存在返回 false', () => {
      const ok = store.deleteTemplate('nonexistent');
      expect(ok).toBe(false);
    });

    it('getTemplate 按 ID 查找', () => {
      const id = store.createTemplate(tplInput({ name: '查找我' }));
      const tpl = store.getTemplate(id!);
      expect(tpl?.name).toBe('查找我');
    });

    it('toggleTemplate 启用/禁用切换', () => {
      const id = store.createTemplate(tplInput());
      expect(store.getTemplate(id!)?.enabled).toBe(true);
      store.toggleTemplate(id!);
      expect(store.getTemplate(id!)?.enabled).toBe(false);
      store.toggleTemplate(id!);
      expect(store.getTemplate(id!)?.enabled).toBe(true);
    });

    it('toggleTemplate 指定 enabled 值', () => {
      const id = store.createTemplate(tplInput());
      store.toggleTemplate(id!, false);
      expect(store.getTemplate(id!)?.enabled).toBe(false);
    });

    it('enabledTemplates 计算属性只返回启用的模板', () => {
      store.createTemplate(tplInput({ name: 'A' }));
      const id2 = store.createTemplate(tplInput({ name: 'B' }));
      store.toggleTemplate(id2!, false);
      expect(store.enabledTemplates).toHaveLength(1);
      expect(store.enabledTemplates[0].name).toBe('A');
    });
  });

  // ── 场景配置 ──

  describe('场景配置', () => {
    it('getSceneConfig 未配置返回 null', () => {
      expect(store.getSceneConfig('森林')).toBeNull();
    });

    it('getOrCreateSceneConfig 不存在时创建默认配置', () => {
      const cfg = store.getOrCreateSceneConfig('森林');
      expect(cfg.sceneName).toBe('森林');
      expect(cfg.enabled).toBe(true);
      expect(cfg.probabilityOverride).toBeNull();
      expect(store.sceneConfigList).toHaveLength(1);
    });

    it('getOrCreateSceneConfig 已存在时返回已有配置', () => {
      store.getOrCreateSceneConfig('森林');
      // 再次获取应返回已存在的（map 中已存在）
      store.getOrCreateSceneConfig('森林');
      expect(store.sceneConfigList).toHaveLength(1);
    });

    it('updateSceneConfig 创建新场景配置', () => {
      const ok = store.updateSceneConfig('森林', {
        enabled: true,
        probabilityOverride: 30,
      });
      expect(ok).toBe(true);
      expect(store.getSceneConfig('森林')?.probabilityOverride).toBe(30);
    });

    it('updateSceneConfig 更新已有场景配置', () => {
      store.updateSceneConfig('森林', { probabilityOverride: 30 });
      const ok = store.updateSceneConfig('森林', { probabilityOverride: 60 });
      expect(ok).toBe(true);
      expect(store.getSceneConfig('森林')?.probabilityOverride).toBe(60);
    });

    it('updateSceneConfig 类别冲突校验失败', () => {
      const ok = store.updateSceneConfig('森林', {
        allowedCategories: ['combat'],
        excludedCategories: ['combat'],
      });
      expect(ok).toBe(false);
      expect(store.lastError).toContain('combat');
    });

    it('toggleScene 切换启用状态', () => {
      store.updateSceneConfig('森林', { enabled: true });
      store.toggleScene('森林');
      expect(store.getSceneConfig('森林')?.enabled).toBe(false);
      store.toggleScene('森林');
      expect(store.getSceneConfig('森林')?.enabled).toBe(true);
    });

    it('toggleScene 指定 enabled 值', () => {
      store.updateSceneConfig('森林', { enabled: true });
      store.toggleScene('森林', false);
      expect(store.getSceneConfig('森林')?.enabled).toBe(false);
    });

    it('deleteSceneConfig 删除成功', () => {
      store.updateSceneConfig('森林', {});
      const ok = store.deleteSceneConfig('森林');
      expect(ok).toBe(true);
      expect(store.getSceneConfig('森林')).toBeNull();
    });

    it('deleteSceneConfig 不存在返回 false', () => {
      const ok = store.deleteSceneConfig('不存在');
      expect(ok).toBe(false);
    });

    it('sceneConfigList 计算属性返回数组形式', () => {
      store.updateSceneConfig('森林', {});
      store.updateSceneConfig('酒馆', {});
      expect(store.sceneConfigList).toHaveLength(2);
      expect(store.sceneConfigList.map((c) => c.sceneName)).toContain('森林');
    });
  });

  // ── 生成器配置 ──

  describe('生成器配置', () => {
    it('初始默认配置', () => {
      const def = createDefaultGeneratorConfig();
      expect(store.generatorConfig.defaultProbability).toBe(def.defaultProbability);
      expect(store.generatorConfig.enabled).toBe(false);
    });

    it('updateGeneratorConfig 更新配置', () => {
      store.updateGeneratorConfig({
        enabled: true,
        defaultProbability: 25,
        maxPerTurn: 2,
      });
      expect(store.generatorConfig.enabled).toBe(true);
      expect(store.generatorConfig.defaultProbability).toBe(25);
      expect(store.generatorConfig.maxPerTurn).toBe(2);
    });

    it('toggleGenerator 切换启用', () => {
      expect(store.generatorConfig.enabled).toBe(false);
      store.toggleGenerator();
      expect(store.generatorConfig.enabled).toBe(true);
      store.toggleGenerator();
      expect(store.generatorConfig.enabled).toBe(false);
    });

    it('toggleGenerator 指定 enabled 值', () => {
      store.toggleGenerator(true);
      expect(store.generatorConfig.enabled).toBe(true);
    });
  });

  // ── 生成决策 ──

  describe('decide', () => {
    it('生成器未启用不触发', () => {
      const decision = store.decide('森林', []);
      expect(decision.shouldTrigger).toBe(false);
      expect(decision.reason).toContain('未启用');
    });

    it('生成器启用且概率 100 触发', () => {
      store.updateGeneratorConfig({ enabled: true, defaultProbability: 100 });
      const decision = store.decide('森林', []);
      expect(decision.shouldTrigger).toBe(true);
    });

    it('场景禁用时不触发', () => {
      store.updateGeneratorConfig({ enabled: true, defaultProbability: 100 });
      store.updateSceneConfig('森林', { enabled: false });
      const decision = store.decide('森林', []);
      expect(decision.shouldTrigger).toBe(false);
      expect(decision.reason).toContain('场景未启用');
    });

    it('有模板且概率 100 触发并选中模板', () => {
      store.updateGeneratorConfig({ enabled: true });
      store.createTemplate(tplInput({ name: 'T', probability: 100 }));
      const decision = store.decide('森林', []);
      expect(decision.shouldTrigger).toBe(true);
      expect(decision.template?.name).toBe('T');
    });
  });

  // ── 结果记录与反馈 ──

  describe('recordResult', () => {
    it('记录结果到历史', () => {
      const result = createRandomEventResult({
        template: null,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 10,
      });
      store.recordResult(result);
      expect(store.results).toHaveLength(1);
      expect(store.results[0].id).toBe(result.id);
    });

    it('记录结果更新模板 triggerCount 与 lastTriggeredAt', () => {
      const tplId = store.createTemplate(tplInput({ name: 'T' }));
      const tpl = store.getTemplate(tplId!)!;
      expect(tpl.triggerCount).toBe(0);
      expect(tpl.lastTriggeredAt).toBeNull();

      const result = createRandomEventResult({
        template: tpl,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 50,
      });
      store.recordResult(result);

      const updated = store.getTemplate(tplId!)!;
      expect(updated.triggerCount).toBe(1);
      expect(updated.lastTriggeredAt).toBe(result.generatedAt);
    });

    it('记录结果更新生成器 lastGeneratedAt', () => {
      const result = createRandomEventResult({
        template: null,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 10,
      });
      store.recordResult(result);
      expect(store.generatorConfig.lastGeneratedAt).toBe(result.generatedAt);
    });

    it('历史超过上限时裁剪旧记录', () => {
      // 默认上限 200
      for (let i = 0; i < 250; i++) {
        const result = createRandomEventResult({
          template: null,
          sceneName: '森林',
          generated: { name: `事件${i}`, description: '描述', isOneShot: true },
          effectiveProbability: 10,
        });
        store.recordResult(result);
      }
      expect(store.results).toHaveLength(200);
    });
  });

  describe('applyFeedback', () => {
    it('应用反馈到结果', () => {
      const result = createRandomEventResult({
        template: null,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 10,
      });
      store.recordResult(result);
      const ok = store.applyFeedback(result.id, 'positive');
      expect(ok).toBe(true);
      expect(store.results[0].feedback).toBe('positive');
    });

    it('应用反馈后调整模板概率', () => {
      const tplId = store.createTemplate(tplInput({ probability: 50 }));
      const tpl = store.getTemplate(tplId!)!;
      const result = createRandomEventResult({
        template: tpl,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 50,
      });
      store.recordResult(result);

      // 应用 positive 反馈，步长默认 5，应增加到 55
      store.applyFeedback(result.id, 'positive');
      expect(store.getTemplate(tplId!)?.probability).toBe(55);

      // 应用 negative 反馈，应减少到 50
      store.applyFeedback(result.id, 'negative');
      expect(store.getTemplate(tplId!)?.probability).toBe(50);
    });

    it('结果不存在返回 false', () => {
      const ok = store.applyFeedback('nonexistent', 'positive');
      expect(ok).toBe(false);
      expect(store.lastError).toBe('结果记录不存在');
    });

    it('应用反馈时添加备注', () => {
      const result = createRandomEventResult({
        template: null,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 10,
      });
      store.recordResult(result);
      store.applyFeedback(result.id, 'negative', '太频繁');
      expect(store.results[0].feedback).toBe('negative');
      expect(store.results[0].note).toBe('太频繁');
    });
  });

  describe('clearResults', () => {
    it('清空所有结果', () => {
      const result = createRandomEventResult({
        template: null,
        sceneName: '森林',
        generated: makeGenerated(),
        effectiveProbability: 10,
      });
      store.recordResult(result);
      expect(store.results).toHaveLength(1);
      store.clearResults();
      expect(store.results).toHaveLength(0);
    });
  });

  // ── 统计 ──

  describe('stats 计算属性', () => {
    it('无结果时返回零统计', () => {
      const stats = store.stats;
      expect(stats.totalGenerated).toBe(0);
      expect(stats.averageProbability).toBe(0);
    });

    it('正确统计多个结果', () => {
      const tpl = store.createTemplate(tplInput({ category: 'encounter', severity: 'minor' }));
      const tplObj = store.getTemplate(tpl!)!;
      for (let i = 0; i < 3; i++) {
        store.recordResult(
          createRandomEventResult({
            template: tplObj,
            sceneName: '森林',
            generated: makeGenerated(),
            effectiveProbability: 50,
          })
        );
      }
      const stats = store.stats;
      expect(stats.totalGenerated).toBe(3);
      expect(stats.byCategory.encounter).toBe(3);
      expect(stats.byFeedback.neutral).toBe(3);
      expect(stats.averageProbability).toBe(50);
    });
  });

  // ── 重置 ──

  describe('resetAll', () => {
    it('重置所有状态', () => {
      store.createTemplate(tplInput());
      store.updateSceneConfig('森林', {});
      store.updateGeneratorConfig({ enabled: true });
      store.recordResult(
        createRandomEventResult({
          template: null,
          sceneName: '森林',
          generated: makeGenerated(),
          effectiveProbability: 10,
        })
      );

      store.resetAll();
      expect(store.templates).toHaveLength(0);
      expect(store.sceneConfigList).toHaveLength(0);
      expect(store.results).toHaveLength(0);
      expect(store.generatorConfig.enabled).toBe(false);
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });
  });

  // ── 常量 ──

  describe('常量', () => {
    it('CATEGORY_OPTIONS 包含 7 个类别', () => {
      expect(store.CATEGORY_OPTIONS).toHaveLength(7);
      expect(store.CATEGORY_OPTIONS.map((c) => c.value)).toContain('encounter');
      expect(store.CATEGORY_OPTIONS.map((c) => c.value)).toContain('custom');
    });

    it('SEVERITY_OPTIONS 包含 5 个严重度', () => {
      expect(store.SEVERITY_OPTIONS).toHaveLength(5);
      expect(store.SEVERITY_OPTIONS.map((s) => s.value)).toContain('trivial');
      expect(store.SEVERITY_OPTIONS.map((s) => s.value)).toContain('critical');
    });
  });
});
