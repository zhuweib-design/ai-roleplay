/**
 * chat-memory — 本地长期记忆存储（L0）子 store（第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2）
 *
 * 职责（优化项 7 · S2）：
 * - l0Store / l0l2Deps（MemoryStore + CharacterRegistry + EmotionTracker）
 * - loadLocalMemoryStore / persistLocalMemoryStore（MIG-01 版本信封快照）
 * - buildLocalMemoryContext / recordLocalConversationMemory / seedStandingFacts
 * - listScopedFacts（供生成域动态向量检索取记忆事实）
 * - 自持 storageAdapter（由兼容层 setStorageAdapter 扇出注入）
 *
 * 错误上报：memory 域无 UI 状态，经 `setChatMemoryErrorReporter` 接缝上报到
 * runtime 域（S2 由兼容层接线 chat.ts 的 reportRuntimeError；S4 后改接
 * chat-runtime store；接缝避免模块级循环依赖）。
 */
import { defineStore } from 'pinia';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';
import type { CharacterCard } from '@/core/character-card';
import { MemoryStore, CharacterRegistry, EmotionTracker, type MemoryFact } from '@/core/memory-store';
import type { L0L2Deps } from '@/core/l0-l2-runtime';
import { migrateSnapshot, wrapSnapshot } from '../storage/snapshot-migration';
import { LOCAL_MEMORY_MIGRATION_PLAN } from '../storage/snapshot-plans';
import { getActiveProfileId } from '../storage/storage-factory';
import type { StorageAdapter } from '../storage/storage-adapter';
import { logger } from '@/utils/logger';

const LOCAL_MEMORY_SNAPSHOT_KEY = 'runtime:local-memory-store:v1';

function clipContextText(value: string, maxChars: number): string {
  const text = value.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** runtime 域错误上报接缝（见文件头注释） */
type RuntimeErrorReporter = (error: unknown, phase: 'initialize' | 'context' | 'event') => void;
let runtimeErrorReporter: RuntimeErrorReporter = (error, phase) => {
  logger.warn('chat-memory', `${phase} 失败: ${error instanceof Error ? error.message : String(error)}`);
};
export function setChatMemoryErrorReporter(fn: RuntimeErrorReporter): void {
  runtimeErrorReporter = fn;
}

export const useChatMemoryStore = defineStore('chat-memory', () => {
  // E-01/E-02: L0/L2 运行时依赖(内存实现;持久化接线待续 ponytail)
  const l0Store = new MemoryStore();
  const l0l2Deps: L0L2Deps = {
    store: l0Store,
    registry: new CharacterRegistry(l0Store),
    tracker: new EmotionTracker(),
  };
  let storageAdapter: StorageAdapter | null = null;
  let localMemoryLoaded = false;
  let localMemoryLoadPromise: Promise<void> | null = null;

  function localMemorySnapshotKey(): string {
    return `${LOCAL_MEMORY_SNAPSHOT_KEY}:${getActiveProfileId()}`;
  }

  /**
   * 注入存储适配器（应用启动时由兼容层扇出调用）
   * 适配器变更后记忆快照需重新加载（与原 chat.ts setStorageAdapter 语义一致）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
    localMemoryLoaded = false;
    localMemoryLoadPromise = null;
  }

  /** 加载本地长期记忆；重复调用共享同一个 Promise，避免启动和首轮发送并发读写。 */
  async function loadLocalMemoryStore(): Promise<void> {
    if (localMemoryLoaded) return;
    if (localMemoryLoadPromise) return localMemoryLoadPromise;
    localMemoryLoadPromise = (async () => {
      if (!storageAdapter) return;
      try {
        const raw = await storageAdapter.loadSnapshot<unknown>(localMemorySnapshotKey());
        if (raw !== null) {
          // MIG-01：旧裸 MemoryStore JSON 由迁移链升级为三段式，不丢事实。
          const { data, report } = migrateSnapshot<{ memory?: unknown; emotions?: unknown }>(
            raw,
            LOCAL_MEMORY_MIGRATION_PLAN,
          );
          if (report.changed) {
            logger.info('chat', `本地记忆快照已迁移：${report.fromVersion} → ${report.toVersion}`);
          }
          if (data && typeof data === 'object') {
            if (data.memory) l0Store.fromJSON(data.memory);
            if (data.emotions) l0l2Deps.tracker.fromJSON(data.emotions);
          }
        }
      } catch (error) {
        runtimeErrorReporter(error, 'initialize');
      } finally {
        localMemoryLoaded = true;
        localMemoryLoadPromise = null;
      }
    })();
    return localMemoryLoadPromise;
  }

  async function persistLocalMemoryStore(): Promise<void> {
    if (!storageAdapter || !localMemoryLoaded) return;
    try {
      // MIG-01：写入带版本信封，后续结构变更可由迁移链识别并升级。
      await storageAdapter.saveSnapshot(localMemorySnapshotKey(), wrapSnapshot({
        version: 1,
        memory: l0Store.toJSON(),
        emotions: l0l2Deps.tracker.toJSON(),
      }, LOCAL_MEMORY_MIGRATION_PLAN.currentVersion));
    } catch (error) {
      runtimeErrorReporter(error, 'event');
    }
  }

  async function buildLocalMemoryContext(query: string): Promise<string | undefined> {
    await loadLocalMemoryStore();
    const results = await l0Store.search(query, { scope: 'scoped', kind: 'session', limit: 5 });
    if (results.length === 0) return undefined;
    const lines = results.map(({ fact }) => `- ${clipContextText(fact.body, 900)}`);
    return clipContextText(`${t('memory.promptTitle')}\n${lines.join('\n')}`, 5_000);
  }

  async function recordLocalConversationMemory(
    character: UICharacter,
    userMessage: string,
    assistantMessage: string,
    turnId?: string,
  ): Promise<void> {
    await loadLocalMemoryStore();
    const normalizedTurnId = turnId?.trim() || `${Date.now()}`;
    const id = `session-${character.id}-${normalizedTurnId}`;
    const body = clipContextText(
      `${t('memory.userLabel')}：${userMessage}\n${t('memory.characterLabel')}：${assistantMessage}`,
      4_000,
    );
    const existing = await l0Store.get(id);
    if (!existing || existing.body !== body) {
      await l0Store.put({ id, scope: 'scoped', kind: 'session', body }, 'human');
      await persistLocalMemoryStore();
    }
  }

  /**
   * E-01: 将角色卡 standing 事实种入 MemoryStore(仅首次)
   * 以角色 ID 为稳定键,写 standing 角色事实(人工 author,触发写保护语义)
   * 幂等:已存在该 ID 事实则跳过(避免每轮重复写、破坏前缀稳定)
   */
  async function seedStandingFacts(card: CharacterCard, characterId: string): Promise<void> {
    try {
      const existing = await l0l2Deps.store.get(`char-${characterId}`);
      if (existing) return; // 已种入,保持前缀稳定
      const body = [
        card.name && t('chat.cardName', { value: card.name }),
        card.description && t('chat.cardDesc', { value: card.description }),
        card.personality && t('chat.cardPersonality', { value: card.personality }),
        card.scenario && t('chat.cardScenario', { value: card.scenario }),
      ]
        .filter(Boolean)
        .join('\n');
      await l0l2Deps.store.put(
        { id: `char-${characterId}`, scope: 'standing', kind: 'character', body },
        'human'
      );
      await persistLocalMemoryStore();
    } catch {
      /* fail-open:种入失败不影响主链路 */
    }
  }

  /** 动态通道向量检索的候选事实（原 chat.ts 内 `l0Store.listFacts({ scope: 'scoped' })`） */
  async function listScopedFacts(): Promise<MemoryFact[]> {
    return l0Store.listFacts({ scope: 'scoped' });
  }

  /**
   * L0/L2 运行时依赖（ChatManager 装配用，与 memory 域共享同一实例）。
   * 以函数暴露避免 Pinia 把类实例包装成 reactive 代理。
   */
  function getL0L2Deps(): L0L2Deps {
    return l0l2Deps;
  }

  return {
    setStorageAdapter,
    loadLocalMemoryStore,
    persistLocalMemoryStore,
    buildLocalMemoryContext,
    recordLocalConversationMemory,
    seedStandingFacts,
    listScopedFacts,
    getL0L2Deps,
  };
});
