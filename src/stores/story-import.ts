/**
 * 故事 store · 导入导出（F16.2，R4-5 自 stores/story.ts 切出）
 *
 * 把 character / lorebook / events 三个 store 适配成 ImportPort，再转调 core/story-importer。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StoryAnalysisResult, ImportConflictStrategy, ImportResult } from '@core/story-types';
import {
  importWorld as importWorldCore,
  importScenes as importScenesCore,
  importCharacters as importCharactersCore,
  importEvents as importEventsCore,
  importAll as importAllCore,
  downloadScripts,
  type ImportTargets,
  type CharacterImportPort,
  type LorebookImportPort,
  type EventsImportPort,
} from '@core/story-importer';
import { describeSaveResult } from '@/utils/save-blob';
import { useCharacterStore } from './character';
import { useLorebookStore } from './lorebook';
import { useEventsStore } from './events';

export interface StoryImportDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
}

export function createStoryImportOps(deps: StoryImportDeps) {
  const { stories, lastError, lastInfo } = deps;

  // ── F16.2 导入功能 ──

  /**
   * 创建导入目标适配器
   * 将 character/lorebook/events store 适配为 ImportPort 接口
   */
  function createImportTargets(): ImportTargets {
    const charStore = useCharacterStore();
    const lbStore = useLorebookStore();
    const evtStore = useEventsStore();

    const characterPort: CharacterImportPort = {
      createCharacter: () => charStore.createCharacter(),
      updateCharacter: (id, patch) => charStore.updateCharacter(id, patch),
      findCharacterByName: (name) => {
        const found = charStore.characters.find(
          (c) => c.name === name
        );
        return found ? { id: found.id, name: found.name } : null;
      },
    };

    const lorebookPort: LorebookImportPort = {
      getWorldDescription: (lbId) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        return lb?.worldDescription ?? null;
      },
      updateWorldDescription: (lbId, wd) =>
        lbStore.updateWorldDescription(lbId, wd),
      getEntries: (lbId) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        return lb?.entries ?? [];
      },
      findEntryByTitle: (lbId, title) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        if (!lb) return null;
        return lb.entries.find((e) => e.title === title) ?? null;
      },
      addEntry: (lbId, input) => lbStore.addEntry(lbId, input),
      updateEntry: (lbId, entryId, patch) =>
        lbStore.updateEntry(lbId, entryId, patch),
    };

    const eventsPort: EventsImportPort = {
      createEvent: (lbId, sceneEntryId, sceneName) =>
        evtStore.createEvent(lbId, sceneEntryId, sceneName),
      updateEvent: (id, patch) => evtStore.updateEvent(id, patch),
      findEventByName: (name) => {
        return evtStore.events.find((e) => e.name === name) ?? null;
      },
    };

    return { character: characterPort, lorebook: lorebookPort, events: eventsPort };
  }

  /**
   * 导入世界信息
   */
  function importWorld(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importWorldCore(story, lorebookId, targets.lorebook, strategy);
    summarizeImportResults(results, t('story.catWorld'));
    return results;
  }

  /**
   * 导入场景
   */
  function importScenes(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importScenesCore(story, lorebookId, targets.lorebook, strategy);
    summarizeImportResults(results, t('story.catScenes'));
    return results;
  }

  /**
   * 导入人物
   */
  function importCharacters(
    storyId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importCharactersCore(story, targets.character, strategy);
    summarizeImportResults(results, t('story.catChars'));
    return results;
  }

  /**
   * 导入事件
   */
  function importEvents(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importEventsCore(story, lorebookId, targets.events, strategy);
    summarizeImportResults(results, t('story.catEvents'));
    return results;
  }

  /**
   * 一键全部导入
   */
  function importAll(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importAllCore(story, lorebookId, targets, strategy);
    summarizeImportResults(results, t('story.catAll'));
    return results;
  }

  /**
   * 导出故事脚本为 JSON 文件存盘
   *
   * 用户在系统保存面板取消时不写 lastInfo（调用方不得报"已导出"）
   */
  async function exportScripts(storyId: string): Promise<void> {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story || story.scripts.length === 0) {
      lastError.value = t('story.noScripts');
      return;
    }
    const filename = `${story.sourceFileName.replace(/\.[^.]+$/, '')}-scripts.json`;
    const outcome = await downloadScripts(story.scripts, filename);
    const saved = describeSaveResult(outcome);
    if (!saved) return;
    lastInfo.value = saved.message;
  }

  /** 汇总导入结果到 lastInfo/lastError */
  function summarizeImportResults(results: ImportResult[], label: string): void {
    const success = results.filter((r) => r.success).length;
    const failed = results.length - success;
    if (failed === 0) {
      lastInfo.value = t('story.importOk', { label, success });
    } else {
      lastInfo.value = t('story.importPartial', { label, success, failed });
      const errors = results.filter((r) => !r.success).map((r) => r.error).filter(Boolean);
      if (errors.length > 0) {
        lastError.value = errors.slice(0, 3).join('；');
      }
    }
  }

  return { importWorld, importScenes, importCharacters, importEvents, importAll, exportScripts };
}
