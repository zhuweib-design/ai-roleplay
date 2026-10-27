/**
 * 角色卡版本管理 Store (模块4)
 *
 * 职责：
 * - 管理 VersionControlEngine 单例（含多角色仓库映射）
 * - 当前选中的角色 ID 与当前分支
 * - 提交、差异对比、回滚、仓库管理
 * - 操作锁管理（模拟本地多人协作）
 * - 存储层快照持久化（全量序列化，经 StorageAdapter 注入）
 *
 * 本文件是**装配层**：状态 + 依赖引擎的派生值 + 仓库/提交/差异/回滚动作。
 * 四个内聚域各自成文件（工厂收实例状态、执行体不 import store，与
 * `community-market` 同一形状）：
 * - `character-version/persistence.ts` 快照键与迁移信封、commitTick、开机读回
 * - `character-version/branching.ts`   建/切/删分支与分支锁
 * - `character-version/merging.ts`     pendingConflicts 状态机与合并三动作
 * - `character-version/locks.ts`       字段级操作锁的抢/放/清
 *
 * 设计说明：
 * 由于项目无后端，"多人实时协作" 以本地多用户模拟方式实现：
 * - 操作锁支持任意 VersionAuthor，模拟不同用户编辑同一角色
 * - 冲突解决 UI 由视图层提供，store 仅返回 conflicts 列表
 *
 * 持久化策略：
 * - 全量数据序列化为单个 JSON 快照存入 StorageAdapter
 * - 快照键: 'ai-roleplay:character-versions'（沿用旧 localStorage 键名）
 * - 每次 commit/branch/merge/rollback 等变更后自动保存
 */

import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  VersionControlEngine,
  type CharacterRepository,
  type CharacterVersion,
  type CharacterBranch,
  type VersionDiff,
  type VersionAuthor,
  type VersionId,
  type RepositoryInfo,
} from '@/core/character-version-control';
import type { CharacterCard } from '@/core/character-card';
import { uiCharToCard } from '@/services/type-adapters';
import { useCharacterStore } from './character';
import { createVersionBranching } from './character-version/branching';
import { createVersionLocks } from './character-version/locks';
import { createVersionMerging } from './character-version/merging';
import { createVersionPersistence } from './character-version/persistence';

// ── 常量 ──

const DEFAULT_AUTHOR: VersionAuthor = { name: t('store.localUser') };

// ── 单例引擎 ──

const engine = new VersionControlEngine(DEFAULT_AUTHOR);

// ── Store ──

export const useCharacterVersionStore = defineStore('characterVersion', () => {
  // ── 状态 ──

  /** 当前选中的角色 ID（用于 UI 列表过滤） */
  const currentCharacterId = ref<string | null>(null);

  /** 当前操作者（可被切换以模拟多用户） */
  const author = ref<VersionAuthor>(DEFAULT_AUTHOR);

  /** 响应式触发器（非数据用途，仅用于让 computed 重新计算） */
  const versionTick = ref(0);

  /** 最近一次错误（UI 提示） */
  const lastError = ref<string | null>(null);

  /** 最近一次信息（UI 提示） */
  const lastInfo = ref<string | null>(null);

  /** 是否已从持久化加载 */
  const loaded = ref(false);

  // ── 计算属性 ──

  /** 全部仓库信息列表 */
  const repositories = computed<RepositoryInfo[]>(() => {
    void versionTick.value; // 依赖触发
    return engine.listRepositories();
  });

  /**
   * 已纳入版本跟踪的角色 id 集合（E19）。
   * 仓库是"选中某角色时才懒创建"的，所以此前界面上没有任何地方能看出
   * 哪些角色真的被跟踪着——入口只在侧栏，点进去才知道。
   */
  const trackedCharacterIds = computed<Set<string>>(() => {
    void versionTick.value;
    return new Set(engine.listRepositories().map((r) => r.characterId));
  });

  function hasRepository(characterId: string): boolean {
    void versionTick.value;
    return engine.getRepository(characterId) !== null;
  }

  /** 当前选中的仓库 */
  const currentRepository = computed<CharacterRepository | null>(() => {
    void versionTick.value;
    if (!currentCharacterId.value) return null;
    return engine.getRepository(currentCharacterId.value);
  });

  /** 当前仓库信息 */
  const currentRepoInfo = computed<RepositoryInfo | null>(() => {
    void versionTick.value;
    if (!currentCharacterId.value) return null;
    return engine.getRepository(currentCharacterId.value)?.getInfo() ?? null;
  });

  /** 当前仓库的分支列表 */
  const branches = computed<CharacterBranch[]>(() => {
    // 必须订阅 tick：仓库是自己实现的命令式对象（增分支不会改任何 ref），
    // 少了这一行 createBranch 后 toast 说"已创建"、列表却还停在旧内容，要刷新页面才看到
    void versionTick.value;
    return currentRepository.value?.listBranches() ?? [];
  });

  /** 当前仓库的提交历史（当前分支） */
  const history = computed<CharacterVersion[]>(() => {
    const repo = currentRepository.value;
    if (!repo) return [];
    void versionTick.value;
    return repo.getBranchHistory(repo.currentBranch);
  });

  /** 当前 HEAD 提交 */
  const headVersion = computed<CharacterVersion | null>(() => {
    void versionTick.value;
    return currentRepository.value?.getHead() ?? null;
  });

  // ── 子域装配（传的是同一份 ref 与 computed，不改变响应式边界）──

  const persistence = createVersionPersistence({
    engine,
    author,
    loaded,
    versionTick,
  });
  const { commitTick } = persistence;

  const branching = createVersionBranching({
    currentRepository,
    author,
    lastError,
    lastInfo,
    commitTick,
  });

  const merging = createVersionMerging({
    currentRepository,
    author,
    lastError,
    lastInfo,
    commitTick,
  });

  const locks = createVersionLocks({
    currentRepository,
    author,
    lastError,
    lastInfo,
    commitTick,
  });

  // ── 内部辅助 ──

  /** 设置当前角色并确保仓库存在 */
  function ensureRepositoryForCharacter(
    characterId: string
  ): CharacterRepository | null {
    const charStore = useCharacterStore();
    const character = charStore.characters.find((c) => c.id === characterId);
    if (!character) {
      lastError.value = t('cv2.charNotExist', { id: characterId });
      return null;
    }
    // 转换为 CharacterCard 快照
    const card: CharacterCard = {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      description: character.description,
      personality: '',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: character.tags,
      favorite: character.favorite,
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attributes: character.attributes,
    };
    const repo = engine.ensureRepository(characterId, card);
    return repo;
  }

  // ── 动作：仓库管理 ──

  /**
   * 选择当前管理的角色
   *
   * 若该角色尚无仓库，将基于当前 UICharacter 自动创建初始仓库。
   */
  function selectCharacter(characterId: string): boolean {
    const repo = ensureRepositoryForCharacter(characterId);
    if (!repo) return false;
    currentCharacterId.value = characterId;
    commitTick();
    return true;
  }

  /**
   * 删除某角色的全部版本仓库
   */
  function deleteRepository(characterId: string): boolean {
    const ok = engine.deleteRepository(characterId);
    if (ok && currentCharacterId.value === characterId) {
      currentCharacterId.value = null;
    }
    commitTick();
    return ok;
  }

  // ── 动作：提交 ──

  /**
   * 在当前分支提交新版本
   *
   * @param card 角色卡快照
   * @param message 提交信息
   * @returns 是否成功
   */
  function commit(card: CharacterCard, message: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      repo.commit(card, author.value, message);
      lastInfo.value = t('store.committed', { message });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 基于当前角色 UICharacter 提交一个新版本
   *
   * 自动从 character store 拉取最新状态并转换为 CharacterCard 快照。
   */
  function commitCurrentCharacter(message: string): boolean {
    if (!currentCharacterId.value) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    const charStore = useCharacterStore();
    const character = charStore.characters.find(
      (c) => c.id === currentCharacterId.value
    );
    if (!character) {
      lastError.value = t('cv.charDeleted');
      return false;
    }
    // D-3（REAL_DEVICE_TEST_2026-10-03）：原手写投影丢 personality / scenario /
    // firstMessage / ext 等字段，导致版本 diff 恒 0 差异、回滚清空性格与场景。
    // 改经 uiCharToCard 完整映射；createdAt 保持角色时间锚点避免每次提交产生伪差异。
    const card: CharacterCard = {
      ...uiCharToCard(character),
      createdAt: character.lastActive,
      updatedAt: new Date().toISOString(),
    };
    return commit(card, message);
  }

  // ── 动作：差异对比 ──

  /**
   * 计算两个版本的差异
   */
  function diff(fromId: VersionId, toId: VersionId): VersionDiff | null {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return null;
    }
    try {
      return repo.diffVersions(fromId, toId);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /**
   * 计算某版本与当前 HEAD 的差异
   */
  function diffWithHead(versionId: VersionId): VersionDiff | null {
    const head = headVersion.value;
    if (!head) {
      lastError.value = t('cv2.noHeadCommit');
      return null;
    }
    return diff(versionId, head.id);
  }

  // ── 动作：回滚 ──

  /**
   * 回滚当前分支到指定历史版本
   */
  function rollbackTo(
    versionId: string,
    message?: string
  ): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      const version = repo.rollbackTo(versionId, author.value, message);
      lastInfo.value = t('cv2.rolledBack2', { id: version.id });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  // ── 动作：作者切换（模拟多用户） ──

  /**
   * 切换当前操作者（用于模拟多用户协作）
   */
  function setAuthor(newAuthor: VersionAuthor): void {
    author.value = newAuthor;
    engine.setAuthor(newAuthor);
    lastInfo.value = t('cv2.authorSwitched', { name: newAuthor.name });
    versionTick.value++;
  }

  // ── 动作：错误清理 ──

  function clearLastError(): void {
    lastError.value = null;
  }

  function clearLastInfo(): void {
    lastInfo.value = null;
  }

  // ── 测试专用：重置全部状态 ──

  /**
   * 重置引擎内存与响应式状态（不清空存储）
   *
   * 仅用于单元测试，确保测试间隔离。
   */
  function _resetForTesting(): void {
    engine.loadFromJSON([]);
    currentCharacterId.value = null;
    merging.pendingConflicts.value = null;
    lastError.value = null;
    lastInfo.value = null;
    loaded.value = false;
    versionTick.value++;
  }

  return {
    // 状态
    currentCharacterId,
    author,
    loaded,
    lastError,
    lastInfo,
    // 计算属性
    repositories,
    trackedCharacterIds,
    hasRepository,
    currentRepository,
    currentRepoInfo,
    branches,
    history,
    headVersion,
    // 加载/持久化
    loadFromDisk: persistence.loadFromDisk,
    persistNow: persistence.persistNow,
    // 依赖注入
    setStorageAdapter: persistence.setStorageAdapter,
    // 仓库管理
    selectCharacter,
    deleteRepository,
    // 提交
    commit,
    commitCurrentCharacter,
    // 分支
    createBranch: branching.createBranch,
    switchBranch: branching.switchBranch,
    deleteBranch: branching.deleteBranch,
    toggleBranchLock: branching.toggleBranchLock,
    // 差异
    diff,
    diffWithHead,
    // 合并
    pendingConflicts: merging.pendingConflicts,
    hasPendingConflicts: merging.hasPendingConflicts,
    mergeBranch: merging.mergeBranch,
    resolveConflicts: merging.resolveConflicts,
    cancelMerge: merging.cancelMerge,
    // 回滚
    rollbackTo,
    // 操作锁
    acquireLock: locks.acquireLock,
    releaseLock: locks.releaseLock,
    releaseAllLocks: locks.releaseAllLocks,
    purgeExpiredLocks: locks.purgeExpiredLocks,
    // 作者
    setAuthor,
    // 错误清理
    clearLastError,
    clearLastInfo,
    // 测试用：重置全部状态（生产代码不应调用）
    _resetForTesting,
  };
});
