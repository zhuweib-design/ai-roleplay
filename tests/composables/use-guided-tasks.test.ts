/**
 * guided-tasks 判据与状态单元测试（G 层）
 *
 * 核心不变式：完成态永远来自真实数据；持久化的只有"用户意图"（跳过 / 收起）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useGuidedTasks,
  guideProgress,
  toggleSkip,
  setCollapsed,
  loadTaskIntent,
} from '@/composables/useGuidedTasks';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useLorebookStore } from '@/stores/lorebook';
import { useDataBankStore } from '@/stores/data-bank';

const STATE_KEY = 'ai-roleplay:guided-tasks.v1';

function task(id: string) {
  return useGuidedTasks().value.find((t) => t.id === id);
}

describe('任务结构', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('六个主任务 + 三个进阶任务，顺序稳定', () => {
    const ids = useGuidedTasks().value.map((t) => t.id);
    expect(ids).toEqual([
      't1-model',
      't2-character',
      't3-first-reply',
      't4-worldbook',
      't5-documents',
      't6-voice',
      'a1-group',
      'a2-story',
      'a3-local-model',
    ]);
  });

  it('每个步骤要么给出跳转目标，要么显式标为"可稍后再做"', () => {
    for (const t of useGuidedTasks().value) {
      for (const step of t.steps) {
        expect(step.jump !== null || step.actionKey === 'guide.actionOrSkip').toBe(true);
      }
    }
  });
});

describe('判据读真实数据', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(STATE_KEY);
  });

  it('新增 Profile 只点亮第一步，设为当前并解锁后才点亮第二步', () => {
    const settings = useSettingsStore();
    expect(task('t1-model')?.doneCount).toBe(0);

    settings.apiProfiles.push({ id: 'p1', name: 'p', provider: 'openai', baseUrl: 'http://x', apiKey: '', models: ['m'], enabled: true } as never);
    expect(task('t1-model')?.doneCount).toBe(1);
    expect(task('t1-model')?.complete).toBe(false);

    settings.activeApiProfileId = 'p1';
    expect(task('t1-model')?.doneCount).toBe(2);
    expect(task('t1-model')?.complete).toBe(true);
  });

  it('删掉全部角色后，"已有角色"的任务自动退回未完成（不是"看过就算"）', () => {
    const characterStore = useCharacterStore();
    expect(task('t2-character')?.complete).toBe(true);

    characterStore.characters.splice(0, characterStore.characters.length);
    expect(task('t2-character')?.complete).toBe(false);
    expect(task('t2-character')?.doneCount).toBe(0);
  });

  it('世界书任务：建一本全局书会同时点亮"已有书"和"已生效"（全局书自动激活），再加条目才三步齐', () => {
    const lorebook = useLorebookStore();
    lorebook.lorebooks.splice(0, lorebook.lorebooks.length);
    expect(task('t4-worldbook')?.doneCount).toBe(0);

    lorebook.lorebooks.push({ id: 'lb1', name: '世界', scope: 'global', entries: [] } as never);
    // 第 1 步（有书）与第 3 步（芯片就绪）同时满足：这正是 chat-context.ts:63 的真实语义
    expect(task('t4-worldbook')?.doneCount).toBe(2);
    expect(task('t4-worldbook')?.complete).toBe(false);

    lorebook.lorebooks[0]!.entries.push({ id: 'e1', keys: [], content: 'x', enabled: true } as never);
    expect(task('t4-worldbook')?.doneCount).toBe(3);
    expect(task('t4-worldbook')?.complete).toBe(true);
  });

  it('文档任务把"检索通道是否可用"算进判据，而不只是上传成功', () => {
    const dataBank = useDataBankStore();
    dataBank.documents.splice(0, dataBank.documents.length);
    const lorebook = useLorebookStore();
    lorebook.lorebooks.push({ id: 'lb1', name: '世界', scope: 'global', entries: [] } as never);

    expect(task('t5-documents')?.doneCount).toBe(0);
    dataBank.documents.push({ id: 'd1', name: 'a.md', scope: 'global', chunks: [] } as never);
    const step2 = task('t5-documents')?.steps[1];
    expect(task('t5-documents')?.doneCount).toBeGreaterThanOrEqual(1);
    expect(step2?.hintKey).toBe('guide.t5.stepRetrieval');
  });

  it('进度只统计未跳过的主任务', () => {
    const before = guideProgress(useGuidedTasks().value);
    expect(before.total).toBe(6);

    toggleSkip('t6-voice');
    const after = guideProgress(useGuidedTasks().value);
    expect(after.total).toBe(5);
    expect(task('t6-voice')?.skipped).toBe(true);

    toggleSkip('t6-voice');
    expect(guideProgress(useGuidedTasks().value).total).toBe(6);
  });
});

describe('持久化的只有意图', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(STATE_KEY);
  });

  it('skipped 与 collapsed 落盘且形状正确；完成态不落盘', () => {
    toggleSkip('t1-model');
    setCollapsed(true);

    const stored = loadTaskIntent();
    expect(stored.skipped).toEqual(['t1-model']);
    expect(stored.collapsed).toBe(true);
    expect(typeof stored.updatedAt).toBe('string');
    expect(JSON.parse(String(localStorage.getItem(STATE_KEY)))).not.toHaveProperty('completed');

    toggleSkip('t1-model');
    setCollapsed(false);
  });

  it('存储被污染时退回空意图而不是抛错', () => {
    localStorage.setItem(STATE_KEY, '{not json');
    expect(loadTaskIntent()).toEqual({ skipped: [], collapsed: false, updatedAt: null });
  });
});
