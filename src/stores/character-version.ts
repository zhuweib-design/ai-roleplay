/**
 * 角色卡版本管理 Store (模块4)
 *
 * 职责：
 * - 管理 VersionControlEngine 单例（含多角色仓库映射）
 * - 当前选中的角色 ID 与当前分支
 * - 提交、分支、合并、回滚、差异对比等动作
 * - 操作锁管理（模拟本地多人协作）
 * - 存储层快照持久化（全量序列化，经 StorageAdapter 注入）
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
  CharacterRepository,
  isValidBranchName,
  type CharacterVersion,
  type CharacterBranch,
  type VersionDiff,
  type VersionAuthor,
  type BranchName,
  type VersionId,
  type MergeResult,
  type MergeConflict,
  type RepositoryInfo,
  type SerializedRepository,
} from '@/core/character-version-control';
import type { CharacterCard } from '@/core/character-card';
import { useCharacterStore } from './character';
import type { StorageAdapter } from '@storage/storage-adapter';
import { migrateLegacyLocalStorage } from '@storage/legacy-migration';

// ── 常量 ──

/** 快照键（沿用旧 localStorage 键名，便于一次性迁移存量数据） */
const SNAPSHOT_KEY = 'ai-roleplay:character-versions';
const DEFAULT_AUTHOR: VersionAuthor = { name: t('store.localUser') };

// ── 单例引擎 ──

const engine = new VersionControlEngine(DEFAULT_AUTHOR);

// ── 依赖注入 ──

let storageAdapter: StorageAdapter | null = null;

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

  /** 当前是否在合并冲突待解决状态 */
  const pendingConflicts = ref<{
    sourceBranch: BranchName;
    conflicts: MergeConflict[];
  } | null>(null);

  /** 是否已从持久化加载 */
  const loaded = ref(false);

  // ── 计算属性 ──

  /** 全部仓库信息列表 */
  const repositories = computed<RepositoryInfo[]>(() => {
    void versionTick.value; // 依赖触发
    return engine.listRepositories();
  });

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

  /** 是否有未解决的合并冲突 */
  const hasPendingConflicts = computed(() => pendingConflicts.value !== null);

  // ── 内部辅助 ──

  /** 触发响应式更新并持久化 */
  function commitTick(): void {
    versionTick.value++;
    void persist();
  }

  /**
   * 保存全部版本数据到存储层（fire-and-forget）
   * 失败仅记录日志，不阻塞主流程。
   */
  async function persist(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(SNAPSHOT_KEY, engine.toJSON());
    } catch (err) {
      console.error('[character-version] 持久化失败：', err);
    }
  }

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

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  // ── 动作：加载/持久化 ──

  /**
   * 从存储层加载版本数据（含旧 localStorage 数据一次性迁移）
   *
   * 应用启动时调用一次。
   */
  async function loadFromDisk(): Promise<void> {
    if (!storageAdapter) {
      loaded.value = true;
      return;
    }
    await migrateLegacyLocalStorage(storageAdapter, SNAPSHOT_KEY);
    try {
      const data = await storageAdapter.loadSnapshot<SerializedRepository[]>(
        SNAPSHOT_KEY
      );
      if (data && data.length > 0) {
        engine.loadFromJSON(data);
      }
    } catch (err) {
      console.error('[character-version] 加载失败：', err);
    }
    engine.setAuthor(author.value);
    loaded.value = true;
    versionTick.value++;
  }

  /**
   * 强制保存到存储层
   */
  async function persistNow(): Promise<void> {
    await persist();
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
      createdAt: character.lastActive,
      updatedAt: new Date().toISOString(),
      attributes: character.attributes,
    };
    return commit(card, message);
  }

  // ── 动作：分支 ──

  /**
   * 创建新分支
   */
  function createBranch(name: string, fromBranch?: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    if (!isValidBranchName(name)) {
      lastError.value = t('cv2.branchNameInvalid');
      return false;
    }
    try {
      repo.createBranch(name, author.value, fromBranch);
      lastInfo.value = t('cv2.branchCreated', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 切换分支
   */
  function switchBranch(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      repo.switchBranch(name);
      lastInfo.value = t('cv2.branchSwitched', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 删除分支
   */
  function deleteBranch(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      repo.deleteBranch(name);
      lastInfo.value = t('cv2.branchDeleted', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 锁定/解锁分支
   */
  function toggleBranchLock(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) return false;
    const branch = repo.branches.get(name);
    if (!branch) {
      lastError.value = t('cv2.branchNotExist', { name });
      return false;
    }
    branch.locked = !branch.locked;
    lastInfo.value = branch.locked
      ? t('cv2.branchLocked', { name })
      : t('cv2.branchUnlocked', { name });
    commitTick();
    return true;
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

  // ── 动作：合并 ──

  /**
   * 尝试合并指定分支到当前分支
   *
   * 自动合并成功时直接提交新版本；
   * 冲突时存储到 pendingConflicts，由 resolveConflicts 解决。
   *
   * @param sourceBranch 待合并分支
   * @param message 提交信息（成功时使用）
   * @returns 是否无冲突自动合并成功
   */
  function mergeBranch(
    sourceBranch: string,
    message?: string
  ): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    if (sourceBranch === repo.currentBranch) {
      lastError.value = t('cv2.cannotMergeSelf');
      return false;
    }
    try {
      const result: MergeResult = repo.mergeBranch(sourceBranch);
      if (result.success) {
        // 自动合并成功 → 直接提交
        const commitMessage = message ?? t('cv2.mergeCommitMsg', { branch: sourceBranch });
        repo.commit(
          result.mergedSnapshot!,
          author.value,
          commitMessage
        );
        lastInfo.value = t('cv2.merged', { branch: sourceBranch, count: result.autoResolvedCount });
        commitTick();
        return true;
      } else {
        // 冲突 → 暂存待解决
        pendingConflicts.value = {
          sourceBranch,
          conflicts: result.conflicts,
        };
        lastError.value = t('cv2.mergeConflict', { count: result.conflicts.length, auto: result.autoResolvedCount });
        commitTick();
        return false;
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 解决合并冲突
   *
   * @param resolutions 字段路径 → 'current' | 'source'
   * @param message 提交信息
   */
  function resolveConflicts(
    resolutions: Record<string, 'current' | 'source'>,
    message?: string
  ): boolean {
    const repo = currentRepository.value;
    if (!repo || !pendingConflicts.value) {
      lastError.value = t('cv2.noPendingConflicts');
      return false;
    }
    try {
      const merged = repo.resolveConflicts(
        pendingConflicts.value.sourceBranch,
        resolutions
      );
      const commitMessage =
        message ?? t('cv2.mergeResolvedMsg', { branch: pendingConflicts.value.sourceBranch });
      repo.commit(merged, author.value, commitMessage);
      lastInfo.value = t('cv2.conflictsResolved2');
      pendingConflicts.value = null;
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 取消合并（清除 pendingConflicts）
   */
  function cancelMerge(): void {
    pendingConflicts.value = null;
    lastInfo.value = t('cv2.mergeCancelled2');
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

  // ── 动作：操作锁 ──

  /**
   * 获取操作锁
   *
   * @param fieldPath 锁定字段（'*' 表示全字段）
   * @param durationMs 持续时长（默认 30 分钟）
   */
  function acquireLock(
    fieldPath: string,
    durationMs?: number
  ): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    const ok = repo.acquireLock(fieldPath, author.value, durationMs);
    if (!ok) {
      lastError.value = t('cv2.fieldLockedByOther', { field: fieldPath });
    } else {
      lastInfo.value = t('cv2.fieldLocked', { field: fieldPath });
    }
    commitTick();
    return ok;
  }

  /**
   * 释放操作锁
   */
  function releaseLock(fieldPath: string): void {
    const repo = currentRepository.value;
    if (!repo) return;
    repo.releaseLock(fieldPath, author.value);
    lastInfo.value = t('cv2.fieldUnlocked', { field: fieldPath });
    commitTick();
  }

  /**
   * 释放当前作者持有的全部锁
   */
  function releaseAllLocks(): void {
    const repo = currentRepository.value;
    if (!repo) return;
    repo.releaseAllLocks(author.value);
    lastInfo.value = t('cv2.allLocksReleased');
    commitTick();
  }

  /**
   * 清理过期锁
   */
  function purgeExpiredLocks(): number {
    const repo = currentRepository.value;
    if (!repo) return 0;
    const n = repo.purgeExpiredLocks();
    if (n > 0) commitTick();
    return n;
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
    pendingConflicts.value = null;
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
    pendingConflicts,
    // 计算属性
    repositories,
    currentRepository,
    currentRepoInfo,
    branches,
    history,
    headVersion,
    hasPendingConflicts,
    // 加载/持久化
    loadFromDisk,
    persistNow,
    // 依赖注入
    setStorageAdapter,
    // 仓库管理
    selectCharacter,
    deleteRepository,
    // 提交
    commit,
    commitCurrentCharacter,
    // 分支
    createBranch,
    switchBranch,
    deleteBranch,
    toggleBranchLock,
    // 差异
    diff,
    diffWithHead,
    // 合并
    mergeBranch,
    resolveConflicts,
    cancelMerge,
    // 回滚
    rollbackTo,
    // 操作锁
    acquireLock,
    releaseLock,
    releaseAllLocks,
    purgeExpiredLocks,
    // 作者
    setAuthor,
    // 错误清理
    clearLastError,
    clearLastInfo,
    // 测试用：重置全部状态（生产代码不应调用）
    _resetForTesting,
  };
});
