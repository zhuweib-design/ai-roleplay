import type { CharacterCard } from '@core/character-card';
import type { Lorebook } from '@core/lorebook';
import type { GroupChat } from '@core/group-chat';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import type { StoryAnalysisResult } from '@core/story-types';
import type { Chat } from './types';
import type { AppSettings, Persona } from '@/types';
import type { StorageAdapter } from './storage-adapter';
import { t } from '@/i18n';

/**
 * Tauri 文件系统存储适配器 (Phase H3)
 *
 * 在 Tauri 桌面应用环境中使用本地文件系统持久化数据：
 * - characters/ 目录：每张角色卡一个 .json 文件
 * - chats/ 目录：每个对话一个 .json 文件
 * - settings/app.json：全局设置单条记录
 * - lorebooks/ 目录：每个世界书一个 .json 文件
 * - groups/ 目录：每个群聊一个 .json 文件
 * - personas/ 目录：每个 Persona 一个 .json 文件 (F07 迭代22 新增)
 *
 * 通过 @tauri-apps/api 的 invoke 调用 Rust 端命令（见 src-tauri/src/commands/fs_commands.rs）：
 *   save_character_file / load_character_file / list_character_files / delete_character_file
 *   save_chat_file / load_chat_file / list_chat_files / delete_chat_file
 *   save_settings_file / load_settings_file
 *   save_lorebook_file / load_lorebook_file / list_lorebook_files / delete_lorebook_file
 *   save_group_chat_file / load_group_chat_file / list_group_chat_files / delete_group_chat_file
 *   save_persona_file / load_persona_file / list_persona_files / delete_persona_file (迭代22)
 *
 * 运行时检测：window.__TAURI_INTERNALS__ 存在表示处于 Tauri 环境
 *
 * Web 降级：当非 Tauri 环境时由 storage-factory 切换为 IndexedDBAdapter
 */
export class TauriFSAdapter implements StorageAdapter {
  /**
   * 检测是否运行在 Tauri 环境中
   * Tauri 2.0 通过 window.__TAURI_INTERNALS__ 注入 IPC
   */
  static isTauriEnv(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
  }

  /**
   * 尚未实现的 Tauri 持久化能力清单（候选5）
   * 目前全部能力已实现（M1 已补 DataBank/Story），保留机制供未来扩展。
   */
  static readonly unimplementedFeatures: ReadonlyArray<{ key: string; label: string }> = [];

  /** 返回未实现功能的中文名列表（空数组 = 全部已实现） */
  static getUnimplementedFeatureNames(): string[] {
    return TauriFSAdapter.unimplementedFeatures.map((f) => f.label);
  }

  /**
   * 动态导入 invoke，避免在非 Tauri 环境下加载 @tauri-apps/api 时报错
   * 注：@tauri-apps/api/core 在 Web 环境下会抛出 'window.__TAURI_INTERNALS__ is undefined'
   */
  private static async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    // 动态 import 避免顶层加载
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }

  async init(): Promise<void> {
    // Rust 端在 setup 钩子中已自动创建目录结构（characters / chats / settings / backups）
    // 这里仅做存在性校验，避免 silent failure
    if (!TauriFSAdapter.isTauriEnv()) {
      throw new Error(t('storage.notTauriEnv'));
    }
  }

  async close(): Promise<void> {
    // 文件系统无需显式关闭连接
  }

  // ── 角色卡 CRUD ──

  async saveCharacter(card: CharacterCard): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_character_file', {
      id: card.id,
      card,
    });
  }

  async loadCharacter(id: string): Promise<CharacterCard | null> {
    const result = await TauriFSAdapter.invoke<CharacterCard | null>(
      'load_character_file',
      { id }
    );
    return result ?? null;
  }

  async loadCharacters(): Promise<CharacterCard[]> {
    const result = await TauriFSAdapter.invoke<CharacterCard[]>(
      'list_character_files'
    );
    return result ?? [];
  }

  async deleteCharacter(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_character_file', { id });
  }

  // ── 对话 CRUD ──

  async saveChat(chat: Chat): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_chat_file', {
      id: chat.id,
      chat,
    });
  }

  async loadChat(id: string): Promise<Chat | null> {
    const result = await TauriFSAdapter.invoke<Chat | null>(
      'load_chat_file',
      { id }
    );
    return result ?? null;
  }

  async loadChats(characterId: string): Promise<Chat[]> {
    const result = await TauriFSAdapter.invoke<Chat[]>('list_chat_files', {
      characterId,
    });
    return result ?? [];
  }

  async deleteChat(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_chat_file', { id });
  }

  // ── 设置 ──

  async saveSettings(settings: AppSettings): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_settings_file', { settings });
  }

  async loadSettings(): Promise<Partial<AppSettings>> {
    const result = await TauriFSAdapter.invoke<Partial<AppSettings> | null>(
      'load_settings_file'
    );
    return result ?? {};
  }

  // ── Lorebook CRUD (F06) ──

  async saveLorebook(lorebook: Lorebook): Promise<void> {
    // 修复: Vue 响应式 Proxy 不能 structured clone 跨 IPC, 需 JSON 解包(同 indexeddb saveLorebook)
    const plain = JSON.parse(JSON.stringify(lorebook)) as Lorebook;
    await TauriFSAdapter.invoke<void>('save_lorebook_file', {
      id: plain.id,
      lorebook: plain,
    });
  }

  async loadLorebook(id: string): Promise<Lorebook | null> {
    const result = await TauriFSAdapter.invoke<Lorebook | null>(
      'load_lorebook_file',
      { id }
    );
    return result ?? null;
  }

  async loadLorebooks(): Promise<Lorebook[]> {
    const result = await TauriFSAdapter.invoke<Lorebook[]>('list_lorebook_files');
    return result ?? [];
  }

  async deleteLorebook(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_lorebook_file', { id });
  }

  // ── 群聊 CRUD (F10) ──

  async saveGroupChat(group: GroupChat): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_group_chat_file', {
      id: group.id,
      group,
    });
  }

  async loadGroupChat(id: string): Promise<GroupChat | null> {
    const result = await TauriFSAdapter.invoke<GroupChat | null>(
      'load_group_chat_file',
      { id }
    );
    return result ?? null;
  }

  async loadGroupChats(): Promise<GroupChat[]> {
    const result = await TauriFSAdapter.invoke<GroupChat[]>('list_group_chat_files');
    return result ?? [];
  }

  async deleteGroupChat(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_group_chat_file', { id });
  }

  // ── Persona CRUD (F07 迭代22) ──

  async savePersona(persona: Persona): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_persona_file', {
      id: persona.id,
      persona,
    });
  }

  async loadPersona(id: string): Promise<Persona | null> {
    const result = await TauriFSAdapter.invoke<Persona | null>(
      'load_persona_file',
      { id }
    );
    return result ?? null;
  }

  async loadPersonas(): Promise<Persona[]> {
    const result = await TauriFSAdapter.invoke<Persona[]>('list_persona_files');
    return result ?? [];
  }

  async deletePersona(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_persona_file', { id });
  }

  // ── DataBank 文档 CRUD (F09 迭代26) ──
  // M1：Tauri 端命令已实现（save_document_file / load_document_file 等）

  async saveDocument(doc: DataBankDocument): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_document_file', {
      id: doc.id,
      document: doc,
    });
  }

  async loadDocument(id: string): Promise<DataBankDocument | null> {
    const result = await TauriFSAdapter.invoke<DataBankDocument | null>(
      'load_document_file',
      { id }
    );
    return result ?? null;
  }

  async loadDocuments(): Promise<DataBankDocument[]> {
    const result = await TauriFSAdapter.invoke<DataBankDocument[]>(
      'list_document_files'
    );
    return result ?? [];
  }

  async loadDocumentsByScope(
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): Promise<DataBankDocument[]> {
    const all = await this.loadDocuments();
    // 与 IndexedDB 端语义对齐（契约测试 R1）：global 文档在任意 scope 查询中恒包含
    return all.filter((doc) => {
      if (doc.scope === 'global') return true;
      if (
        scope === 'character' &&
        doc.scope === 'character' &&
        doc.characterId === characterId
      ) {
        return true;
      }
      if (scope === 'chat' && doc.scope === 'chat' && doc.chatId === chatId) {
        return true;
      }
      return false;
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_document_file', { id });
  }

  // ── Story CRUD (F16) — M1：Tauri 端命令已实现 ──

  async saveStory(story: StoryAnalysisResult): Promise<void> {
    await TauriFSAdapter.invoke<void>('save_story_file', {
      id: story.id,
      story,
    });
  }

  async loadStory(id: string): Promise<StoryAnalysisResult | null> {
    const result = await TauriFSAdapter.invoke<StoryAnalysisResult | null>(
      'load_story_file',
      { id }
    );
    return result ?? null;
  }

  async loadStories(): Promise<StoryAnalysisResult[]> {
    const result = await TauriFSAdapter.invoke<StoryAnalysisResult[]>(
      'list_story_files'
    );
    return result ?? [];
  }

  async deleteStory(id: string): Promise<void> {
    await TauriFSAdapter.invoke<void>('delete_story_file', { id });
  }

  // ── 整块快照（社区市场 / 角色版本等非实体集合数据）──

  async saveSnapshot(key: string, value: unknown): Promise<void> {
    // JSON 规范化（与 IndexedDB 端一致）：保证快照为纯 JSON 数据，
    // 兼容 Vue 响应式 proxy 等不可直接序列化的对象。
    const plain = JSON.parse(JSON.stringify(value));
    await TauriFSAdapter.invoke<void>('save_snapshot_file', { key, value: plain });
  }

  async loadSnapshot<T>(key: string): Promise<T | null> {
    const result = await TauriFSAdapter.invoke<T | null>('load_snapshot_file', {
      key,
    });
    return result ?? null;
  }
}
