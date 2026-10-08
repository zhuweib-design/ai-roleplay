/**
 * 任务式分步引导（G 层，UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.5）
 *
 * 与旧的"首启静态弹窗"的区别只有一条，但那条是全部：
 * 完成与否**读真实数据**（store / 消息 / 开关），不读"用户是否看过某个页面"。
 * 因此删掉角色后任务会自动退回未完成，导入备份后会自动勾选——
 * 界面永远不会宣称一件没有发生的事。
 *
 * 只持久化用户意图（跳过 / 收起），不持久化判定结果；见决策 D-I。
 */
import { computed, ref, type ComputedRef } from 'vue';
import type { MessageKey } from '@/i18n';
import type { ReadinessJump } from '@/core/readiness';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useDataBankStore } from '@/stores/data-bank';
import { useLorebookStore } from '@/stores/lorebook';
import { useGroupChatStore } from '@/stores/group-chat';
import { useStoryStore } from '@/stores/story';
import { useLocalModelStore } from '@/stores/local-model';
import { useReadinessChips, useDataBankPrereqs } from '@/core/readiness';

const STATE_KEY = 'ai-roleplay:guided-tasks.v1';

export interface TaskIntent {
  skipped: string[];
  collapsed: boolean;
  updatedAt: string | null;
}

function emptyIntent(): TaskIntent {
  return { skipped: [], collapsed: false, updatedAt: null };
}

export function loadTaskIntent(): TaskIntent {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyIntent();
    const parsed = JSON.parse(raw) as Partial<TaskIntent>;
    return {
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((s) => typeof s === 'string') : [],
      collapsed: parsed.collapsed === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return emptyIntent();
  }
}

function persist(intent: TaskIntent): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...intent, updatedAt: new Date().toISOString() }));
  } catch {
    /* 存储不可用时引导仍可用，只是记住不了跳过状态 */
  }
  intentRef.value = intent;
}

const intentRef = ref<TaskIntent>(loadTaskIntent());

export function toggleSkip(taskId: string): void {
  const skipped = intentRef.value.skipped.includes(taskId)
    ? intentRef.value.skipped.filter((id) => id !== taskId)
    : [...intentRef.value.skipped, taskId];
  persist({ ...intentRef.value, skipped });
}

export function setCollapsed(collapsed: boolean): void {
  persist({ ...intentRef.value, collapsed });
}

export function taskIntent(): ComputedRef<TaskIntent> {
  return computed(() => intentRef.value);
}

export interface StepView {
  id: string;
  hintKey: MessageKey;
  actionKey: MessageKey;
  jump: ReadinessJump | null;
  done: boolean;
}

export interface TaskView {
  id: string;
  titleKey: MessageKey;
  whyKey: MessageKey;
  advanced: boolean;
  doneCount: number;
  totalCount: number;
  complete: boolean;
  skipped: boolean;
  steps: StepView[];
}

/**
 * 六个主任务 + 三个进阶任务的判定表。
 * 每条判据都注明它读的是哪个真实数据源，避免退化成"看没看过页面"。
 */
export function useGuidedTasks(): ComputedRef<TaskView[]> {
  const characterStore = useCharacterStore();
  const settings = useSettingsStore();
  const dataBank = useDataBankStore();
  const lorebook = useLorebookStore();
  const groupChat = useGroupChatStore();
  const story = useStoryStore();
  const localModel = useLocalModelStore();
  const chips = useReadinessChips();
  const dataBankPrereqs = useDataBankPrereqs();

  return computed(() => {
    const char = characterStore.currentCharacter;
    const worldbookChip = chips.value.find((c) => c.id === 'worldbook');
    const modelChip = chips.value.find((c) => c.id === 'model');
    const voiceChip = chips.value.find((c) => c.id === 'voice');

    const definitions: Array<{
      id: string;
      titleKey: MessageKey;
      whyKey: MessageKey;
      advanced: boolean;
      steps: StepView[];
    }> = [
      {
        id: 't1-model',
        titleKey: 'guide.t1Title',
        whyKey: 'guide.t1Why',
        advanced: false,
        steps: [
          {
            id: 'profile',
            hintKey: 'guide.t1.stepProfile',
            actionKey: 'guide.actionAddProfile',
            jump: { name: 'settings', query: { cat: 'model' } },
            done: settings.apiProfiles.length > 0,
          },
          {
            id: 'active',
            hintKey: 'guide.t1.stepActive',
            actionKey: 'guide.actionSetCurrent',
            jump: { name: 'settings', query: { cat: 'model' } },
            done: !!settings.activeProfile && modelChip?.state === 'ready',
          },
        ],
      },
      {
        id: 't2-character',
        titleKey: 'guide.t2Title',
        whyKey: 'guide.t2Why',
        advanced: false,
        steps: [
          {
            id: 'create',
            hintKey: 'guide.t2.stepCreate',
            actionKey: 'guide.actionGoCharacters',
            jump: { name: 'character-list' },
            done: characterStore.characters.length > 0,
          },
          {
            id: 'import',
            hintKey: 'guide.t2.stepImport',
            actionKey: 'guide.actionOrSkip',
            jump: null,
            done: characterStore.characters.length > 1,
          },
        ],
      },
      {
        id: 't3-first-reply',
        titleKey: 'guide.t3Title',
        whyKey: 'guide.t3Why',
        advanced: false,
        steps: [
          {
            id: 'open-chat',
            hintKey: 'guide.t3.stepOpen',
            actionKey: 'guide.actionGoChat',
            jump: { name: 'chat' },
            done: !!char,
          },
          {
            id: 'assistant-message',
            hintKey: 'guide.t3.stepReply',
            actionKey: 'guide.actionGoChat',
            jump: { name: 'chat' },
            // 现状没有 per-message 错误旗标（错误文本写进 content），
            // 因此只判"收到回复"，不宣称"回复成功"（见 §七 #15）。
            done: (char?.messages ?? []).some((m) => m.role === 'assistant'),
          },
        ],
      },
      {
        id: 't4-worldbook',
        titleKey: 'guide.t4Title',
        whyKey: 'guide.t4Why',
        advanced: false,
        steps: [
          {
            id: 'book',
            hintKey: 'guide.t4.stepBook',
            actionKey: 'guide.actionGoWorldbook',
            jump: { name: 'worldbook' },
            done: lorebook.lorebooks.length > 0,
          },
          {
            id: 'entry',
            hintKey: 'guide.t4.stepEntry',
            actionKey: 'guide.actionGoWorldbook',
            jump: { name: 'worldbook' },
            done: lorebook.lorebooks.some((lb) => lb.entries.length > 0),
          },
          {
            id: 'effective',
            hintKey: 'guide.t4.stepEffective',
            actionKey: 'guide.actionGoWorldbook',
            jump: { name: 'worldbook' },
            done: worldbookChip?.state === 'ready',
          },
        ],
      },
      {
        id: 't5-documents',
        titleKey: 'guide.t5Title',
        whyKey: 'guide.t5Why',
        advanced: false,
        steps: [
          {
            id: 'upload',
            hintKey: 'guide.t5.stepUpload',
            actionKey: 'guide.actionGoDatabank',
            jump: { name: 'databank' },
            done: dataBank.documents.length > 0,
          },
          {
            id: 'retrieval',
            hintKey: 'guide.t5.stepRetrieval',
            actionKey: 'guide.actionGoDatabank',
            jump: { name: 'databank' },
            done: dataBankPrereqs.value.filter((r) => r.done).length >= 2,
          },
        ],
      },
      {
        id: 't6-voice',
        titleKey: 'guide.t6Title',
        whyKey: 'guide.t6Why',
        advanced: false,
        steps: [
          {
            id: 'enable',
            hintKey: 'guide.t6.stepEnable',
            actionKey: 'guide.actionGoVoice',
            jump: { name: 'settings', query: { cat: 'extension' } },
            done: voiceChip?.state === 'ready',
          },
        ],
      },
      {
        id: 'a1-group',
        titleKey: 'guide.a1Title',
        whyKey: 'guide.a1Why',
        advanced: true,
        steps: [
          {
            id: 'group',
            hintKey: 'guide.a1.stepCreate',
            actionKey: 'guide.actionGoGroup',
            jump: { name: 'group' },
            // 判据不能是“有角色”——那是 t2 的判据，抄过来会让这条进阶任务
            // 在用户从没打开过群聊页的情况下就已经打勾。读真实产物：建过群。
            done: groupChat.groups.length > 0,
          },
        ],
      },
      {
        id: 'a2-story',
        titleKey: 'guide.a2Title',
        whyKey: 'guide.a2Why',
        advanced: true,
        steps: [
          {
            id: 'story',
            hintKey: 'guide.a2.stepImport',
            actionKey: 'guide.actionGoStory',
            jump: { name: 'story' },
            // 原先写死 done: false —— 一条永远打不上勾的任务，
            // 违反本文件开头“完成与否读真实数据”的唯一规则。
            done: story.stories.length > 0,
          },
        ],
      },
      {
        id: 'a3-local-model',
        titleKey: 'guide.a3Title',
        whyKey: 'guide.a3Why',
        advanced: true,
        steps: [
          {
            id: 'local',
            hintKey: 'guide.a3.stepLoad',
            actionKey: 'guide.actionGoLocalModel',
            jump: { name: 'local-model' },
            // 步骤写的是“加载一个模型”，判据就按加载态读；
            // 卸载或重启后退回未完成，与 t2 删角色会退勾是同一套语义。
            done: localModel.loadedModelId !== null,
          },
        ],
      },
    ];

    const skipped = intentRef.value.skipped;
    return definitions.map((def) => {
      const doneCount = def.steps.filter((s) => s.done).length;
      return {
        id: def.id,
        titleKey: def.titleKey,
        whyKey: def.whyKey,
        advanced: def.advanced,
        doneCount,
        totalCount: def.steps.length,
        complete: doneCount === def.steps.length,
        skipped: skipped.includes(def.id),
        steps: def.steps,
      };
    });
  });
}

/**
 * 当前该做的那一条任务：主清单里第一个"未完成且未跳过"的。
 * 任务卡的默认展开、完成后的"下一步"都读它——两处必须指同一条，
 * 否则会出现"展开的是 A、提示下一步去做 B"。
 */
export function nextIncompleteTask(tasks: TaskView[]): TaskView | null {
  return tasks.find((t) => !t.advanced && !t.skipped && !t.complete) ?? null;
}

/** 供"返回后再看进度"使用的汇总（不做任何遥测，不上传） */
export function guideProgress(tasks: TaskView[]): { done: number; total: number } {
  const base = tasks.filter((t) => !t.advanced && !t.skipped);
  return { done: base.filter((t) => t.complete).length, total: base.length };
}
