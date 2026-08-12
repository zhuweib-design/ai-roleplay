import type { CharacterCard } from '@core/character-card';
import type { Lorebook } from '@core/lorebook';
import type { GroupChat } from '@core/group-chat';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import type { StoryAnalysisResult } from '@core/story-types';
import type { Chat } from './types';
import type { AppSettings, Persona } from '@/types';

/**
 * 存储适配器接口 (F05 / F14)
 *
 * 前端代码通过此统一接口操作数据，运行时根据环境自动选择实现：
 * - Tauri 环境（window.__TAURI__ 存在）→ TauriFSAdapter（本地文件系统）
 * - 浏览器环境 → IndexedDBAdapter（浏览器 IndexedDB）
 *
 * 两种实现共用同一套前端代码，仅存储后端不同。
 *
 * W2 扩展：新增 Lorebook（F06）和 GroupChat（F10）的 CRUD 接口
 */
export interface StorageAdapter {
  /**
   * 初始化存储（创建数据库/目录结构等）
   * 应用启动时调用一次
   */
  init(): Promise<void>;

  /**
   * 关闭存储连接
   * 应用退出或切换存储后端时调用
   */
  close(): Promise<void>;

  // ── 角色卡 CRUD ──

  /** 保存或更新角色卡（以 id 为主键） */
  saveCharacter(card: CharacterCard): Promise<void>;

  /** 加载单个角色卡，不存在时返回 null */
  loadCharacter(id: string): Promise<CharacterCard | null>;

  /** 加载全部角色卡 */
  loadCharacters(): Promise<CharacterCard[]>;

  /** 删除角色卡 */
  deleteCharacter(id: string): Promise<void>;

  // ── 对话 CRUD ──

  /** 保存或更新对话（以 id 为主键） */
  saveChat(chat: Chat): Promise<void>;

  /** 加载单个对话，不存在时返回 null */
  loadChat(id: string): Promise<Chat | null>;

  /** 加载指定角色的全部对话 */
  loadChats(characterId: string): Promise<Chat[]>;

  /** 删除对话 */
  deleteChat(id: string): Promise<void>;

  // ── 设置 ──

  /** 保存全局设置（整体覆盖） */
  saveSettings(settings: AppSettings): Promise<void>;

  /** 加载全局设置，不存在时返回空对象（调用方自行判断） */
  loadSettings(): Promise<Partial<AppSettings>>;

  // ── Lorebook（世界书）CRUD (F06) ──

  /** 保存或更新 Lorebook */
  saveLorebook(lorebook: Lorebook): Promise<void>;

  /** 加载单个 Lorebook，不存在时返回 null */
  loadLorebook(id: string): Promise<Lorebook | null>;

  /** 加载全部 Lorebook（按更新时间降序） */
  loadLorebooks(): Promise<Lorebook[]>;

  /** 删除 Lorebook */
  deleteLorebook(id: string): Promise<void>;

  // ── GroupChat（群聊）CRUD (F10) ──

  /** 保存或更新群聊 */
  saveGroupChat(group: GroupChat): Promise<void>;

  /** 加载单个群聊，不存在时返回 null */
  loadGroupChat(id: string): Promise<GroupChat | null>;

  /** 加载全部群聊（按更新时间降序） */
  loadGroupChats(): Promise<GroupChat[]>;

  /** 删除群聊 */
  deleteGroupChat(id: string): Promise<void>;

  // ── Persona CRUD (F07) ──

  /** 保存或更新 Persona */
  savePersona(persona: Persona): Promise<void>;

  /** 加载单个 Persona，不存在时返回 null */
  loadPersona(id: string): Promise<Persona | null>;

  /** 加载全部 Persona（按更新时间降序） */
  loadPersonas(): Promise<Persona[]>;

  /** 删除 Persona */
  deletePersona(id: string): Promise<void>;

  // ── DataBank 文档 CRUD (F09) ──

  /** 保存或更新数据银行文档 */
  saveDocument(doc: DataBankDocument): Promise<void>;

  /** 加载单个文档，不存在时返回 null */
  loadDocument(id: string): Promise<DataBankDocument | null>;

  /** 加载全部文档（按更新时间降序） */
  loadDocuments(): Promise<DataBankDocument[]>;

  /**
   * 加载指定作用域的文档
   * scope='global' 返回全部全局文档
   * scope='character' 返回该角色绑定 + 全局文档
   * scope='chat' 返回该对话绑定 + 全局文档
   */
  loadDocumentsByScope(
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): Promise<DataBankDocument[]>;

  /** 删除文档 */
  deleteDocument(id: string): Promise<void>;

  // ── Story（故事引擎）CRUD (F16) ──

  /** 保存或更新故事分析结果 */
  saveStory(story: StoryAnalysisResult): Promise<void>;

  /** 加载单个故事分析结果，不存在时返回 null */
  loadStory(id: string): Promise<StoryAnalysisResult | null>;

  /** 加载全部故事分析结果（按创建时间降序） */
  loadStories(): Promise<StoryAnalysisResult[]>;

  /** 删除故事分析结果 */
  deleteStory(id: string): Promise<void>;

  // ── 整块快照（非实体集合数据：社区市场 / 角色版本等）──

  /**
   * 保存整块快照（key-value 覆盖写）
   *
   * 用于不适合实体 CRUD 的整块序列化数据（如社区市场全量数据、
   * 角色版本仓库数组、收藏列表等）。键名由调用方约定。
   */
  saveSnapshot(key: string, value: unknown): Promise<void>;

  /** 加载整块快照，不存在时返回 null */
  loadSnapshot<T>(key: string): Promise<T | null>;
}
