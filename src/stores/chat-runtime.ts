/**
 * chat-runtime — Virtual Character OS Runtime 集成（单聊）子 store
 * （第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2）
 *
 * 职责（优化项 7 · S4）：
 * - runtimeStatus / activePresetInfo 状态
 * - resolveRuntimeTenantId / getRuntimeApi / runtimeInputForCard
 * - ensureRuntimeIntegration / createRuntimeCharactersBatch
 * - inspectRuntimeState / reviewRuntimeMemory / verifyRuntimeReplay
 * - reportRuntimeError（跨域错误上报出口：memory 域经接缝、group 域经 store 引用）
 * - 自持 runtimeApi / runtimeTenantId / runtimeIntegrations 单例
 *
 * 依赖：session 域的 activeChatId（ensureRuntimeIntegration 默认会话键）；
 * isRuntimeNotFound / isRuntimeAlreadyExists 为纯函数，模块级导出供 group 域复用。
 */
import { defineStore, storeToRefs } from 'pinia';
import { ref } from 'vue';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';
import type { CharacterCard } from '@/core/character-card';
import { uiCharToCard } from '../services/type-adapters';
import {
  createProjectRuntime,
  stableChatCharacterId,
  stableChatTargetId,
  type ChatRuntimeIntegration,
  type RuntimeApi,
  type CharacterCompileInput,
  type RuntimeBatchCreateResult,
  type MemoryReviewAction,
  type MemoryRecord,
} from '@/runtime';
import { RuntimeApiError } from '@/runtime/runtime-http';
import { createRuntimeReplayBaseline, replayRuntimeEvents } from '@/runtime/runtime-core';
import { logger } from '@/utils/logger';
import type { PresetId } from '@/core/creation-preset';
import { getStorageAdapter, getActiveProfileId } from '../storage/storage-factory';
import { useChatSessionStore } from './chat-session';

// i18n-ignore-start  // 服务端错误码与文案匹配规则，非 UI 文案
/** 判定 Runtime 错误是否为"角色不存在"（纯函数，group 域复用） */
export function isRuntimeNotFound(error: unknown): boolean {
  return error instanceof RuntimeApiError
    ? error.status === 404
    : error instanceof Error && /不存在|NOT_FOUND|404/.test(error.message);
}

/** 判定 Runtime 错误是否为"角色已存在"（纯函数，group 域复用） */
export function isRuntimeAlreadyExists(error: unknown): boolean {
  return error instanceof RuntimeApiError
    ? error.status === 409 || /已存在|ALREADY_EXISTS/.test(error.message)
    : error instanceof Error && /已存在|already exists|ALREADY_EXISTS/.test(error.message);
}
// i18n-ignore-end

export const useChatRuntimeStore = defineStore('chat-runtime', () => {
  const { activeChatId } = storeToRefs(useChatSessionStore());

  // Virtual Character OS Runtime：默认使用本地快照，配置 VITE_RUNTIME_BASE_URL 后切换为服务端 HTTP。
  // 单聊 Runtime 允许降级；远程群聊初始化和成员限定上下文失败时必须中止生成。
  let runtimeApi: RuntimeApi | null = null;
  let runtimeTenantId: string | null = null;
  const runtimeIntegrations = new Map<string, Promise<ChatRuntimeIntegration | null>>();
  /** 兼容层扇出注入的适配器持有（null = 未注入，getRuntimeApi 需自举全局适配器） */
  const storageAdapterHolder: { current: import('../storage/storage-adapter').StorageAdapter | null } = { current: null };
  const runtimeStatus = ref<{ phase: 'initialize' | 'context' | 'event'; message: string; at: number } | null>(null);
  /**
   * MODEL-03：最近一轮实际生效的创作模式与版本。
   * 记录 Preset 变更，满足计划验收"Preset 变更可追溯"；UI 可据此展示。
   * （写入方为生成域 applyRuntimeLlmControls，经 storeToRefs 共享）
   */
  const activePresetInfo = ref<{ presetId: PresetId; presetVersion: number; at: number } | null>(null);

  function runtimeTenantStorageKey(): string {
    return `ai-roleplay:runtime-tenant-id:${getActiveProfileId()}`;
  }

  function reportRuntimeError(error: unknown, phase: 'initialize' | 'context' | 'event'): void {
    const message = error instanceof Error ? error.message : String(error);
    runtimeStatus.value = { phase, message, at: Date.now() };
    // OBS-01：失败时打印关联 ID，便于用同一 ID 与服务端日志对齐排障。
    const traceId = error instanceof RuntimeApiError ? error.traceId : undefined;
    if (traceId) {
      logger.warn('runtime', `${phase} 失败 code=${error instanceof RuntimeApiError ? error.code : 'unknown'} trace=${traceId}: ${message}`);
    } else {
      logger.warn('runtime', `${phase} 失败: ${message}`);
    }
  }

  function resolveRuntimeTenantId(): string {
    if (runtimeTenantId) return runtimeTenantId;
    try {
      const saved = localStorage.getItem(runtimeTenantStorageKey());
      if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
        runtimeTenantId = saved;
        return saved;
      }
    } catch {
      // 存储不可用时使用当前进程内的租户标识。
    }
    const generated = globalThis.crypto?.randomUUID?.() ?? stableChatCharacterId('local-runtime', `${Date.now()}-${Math.random()}`);
    runtimeTenantId = generated;
    try {
      localStorage.setItem(runtimeTenantStorageKey(), generated);
    } catch {
      // 隐私模式或 Tauri 环境存储不可用时忽略。
    }
    return generated;
  }

  async function getRuntimeApi(): Promise<RuntimeApi> {
    if (runtimeApi) return runtimeApi;
    const baseUrl = import.meta.env.VITE_RUNTIME_BASE_URL;
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      // 服务端 Runtime 不依赖浏览器本地存储，避免远程模式被 IndexedDB 初始化阻断。
      runtimeApi = createProjectRuntime({ server: { baseUrl: baseUrl.trim() } });
      return runtimeApi;
    }
    // App.vue 通常会提前初始化并注入适配器；直接调用 store 的测试/嵌入场景也应自举完成初始化。
    if (!storageAdapterHolder.current) {
      const adapter = getStorageAdapter();
      await adapter.init();
    }
    runtimeApi = createProjectRuntime();
    return runtimeApi;
  }

  /** 注入存储适配器（由兼容层扇出调用；语义与原 chat.ts setStorageAdapter 一致） */
  function setStorageAdapter(adapter: import('../storage/storage-adapter').StorageAdapter | null): void {
    storageAdapterHolder.current = adapter;
  }

  function runtimeInputForCard(tenantId: string, character: UICharacter, card: CharacterCard): CharacterCompileInput {
    return {
      tenantId,
      id: stableChatCharacterId(tenantId, character.id),
      profile: {
        displayName: card.name.trim() || character.id,
        description: card.description,
        speakingStyle: card.personality,
      },
      // i18n-ignore-start  // 写入 Runtime 的种子记忆内容属模型面文本，非 UI 文案
      seedMemories: [
        ...(card.description.trim()
          ? [{ type: 'semantic' as const, content: card.description.trim(), importance: 0.5 }]
          : []),
        ...(card.scenario.trim()
          ? [{ type: 'episodic' as const, content: `场景：${card.scenario.trim()}`, importance: 0.4 }]
          : []),
      ],
      // i18n-ignore-end
    };
  }

  async function createRuntimeCharactersBatch(characters: UICharacter[]): Promise<RuntimeBatchCreateResult | null> {
    if (characters.length === 0) return { items: [] };
    if (characters.length > 50) {
      reportRuntimeError(new Error(t('group.runtimeBatchLimit')), 'initialize');
      return null;
    }
    try {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      return await api.createCharacters(characters.map((character) =>
        runtimeInputForCard(tenantId, character, uiCharToCard(character))
      ));
    } catch (error) {
      reportRuntimeError(error, 'initialize');
      return null;
    }
  }

  async function ensureRuntimeIntegration(
    character: UICharacter,
    card: CharacterCard,
    conversationKey = activeChatId.value ?? `chat-${character.id}`
  ): Promise<ChatRuntimeIntegration | null> {
    const integrationKey = `${character.id}\u0000${conversationKey}`;
    const existing = runtimeIntegrations.get(integrationKey);
    if (existing) return existing;
    const pending = (async (): Promise<ChatRuntimeIntegration | null> => {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      const runtimeCharacterId = stableChatCharacterId(tenantId, character.id);
      try {
        try {
          await api.getCharacter(runtimeCharacterId);
        } catch (error) {
          if (!isRuntimeNotFound(error)) throw error;
          try {
            await api.createCharacter(runtimeInputForCard(tenantId, character, card));
          } catch (createError) {
            // 并发初始化时可能由另一请求先创建，重新读取即可继续。
            if (!isRuntimeAlreadyExists(createError)) throw createError;
            await api.getCharacter(runtimeCharacterId);
          }
        }
        return {
          api,
          tenantId,
          characterId: runtimeCharacterId,
          conversationKey,
          sessionKey: conversationKey,
          // UI 角色 ID 未必是 UUID；远程 PostgreSQL 需要稳定的 Target UUID。
          targetId: stableChatTargetId(tenantId, character.id),
          contextRequest: { maxEvents: 12, maxMemories: 8, maxEpisodes: 5 },
          onError: reportRuntimeError,
        };
      } catch (error) {
        reportRuntimeError(error, 'initialize');
        return null;
      }
    })();
    runtimeIntegrations.set(integrationKey, pending);
    const resolved = await pending;
    // 初始化失败不缓存 null，允许临时网络/存储故障在下一轮自动恢复。
    if (!resolved && runtimeIntegrations.get(integrationKey) === pending) {
      runtimeIntegrations.delete(integrationKey);
    }
    return resolved;
  }

  /**
   * 载入角色的 Runtime 最小状态摘要，供界面检查。
   * 只读：不推进状态、不写事件。角色尚未初始化时返回 enabled=false。
   */
  async function inspectRuntimeState(character: UICharacter): Promise<
    | { enabled: false }
    | {
        enabled: true;
        version: number;
        updatedAt: string;
        displayName: string;
        eventCount: number;
        memoryCount: number;
        episodeCount: number;
        stateChangeCount: number;
        memories: Array<Pick<MemoryRecord, 'id' | 'type' | 'content' | 'confidence' | 'sourceEventId' | 'occurredAt' | 'reviewStatus'>>;
        emotions: Array<{ emotion: string; intensity: number }>;
        mood: { valence: number; arousal: number; dominance: number } | null;
        recentEvents: Array<{ id: string; eventType: string; occurredAt: string; importance: number }>;
      }
  > {
    try {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      const snapshot = await api.getCharacter(stableChatCharacterId(tenantId, character.id));
      const emotions = (snapshot.character.emotions ?? [])
        .slice()
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, 5)
        .map((item) => ({ emotion: String(item.emotion), intensity: item.intensity }));
      const mood = snapshot.character.mood
        ? {
            valence: snapshot.character.mood.valence,
            arousal: snapshot.character.mood.arousal,
            dominance: snapshot.character.mood.dominance,
          }
        : null;
      const recentEvents = (snapshot.events ?? [])
        .slice()
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          importance: event.importance,
        }));
      return {
        enabled: true,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
        displayName: snapshot.character.profile?.displayName ?? character.name,
        eventCount: snapshot.events?.length ?? 0,
        memoryCount: (snapshot.memories ?? []).filter((memory) =>
          memory.reviewStatus !== 'rejected' && memory.reviewStatus !== 'forgotten'
        ).length,
        episodeCount: snapshot.episodes?.length ?? 0,
        stateChangeCount: snapshot.stateChanges?.length ?? 0,
        memories: (snapshot.memories ?? [])
          .filter((memory) => memory.reviewStatus !== 'forgotten')
          .slice()
          .sort((a, b) => Number(a.reviewStatus !== 'candidate') - Number(b.reviewStatus !== 'candidate') ||
            Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
          .slice(0, 20)
          .map((memory) => ({
            id: memory.id,
            type: memory.type,
            content: memory.content,
            confidence: memory.confidence,
            sourceEventId: memory.sourceEventId,
            occurredAt: memory.occurredAt,
            reviewStatus: memory.reviewStatus,
          })),
        emotions,
        mood,
        recentEvents,
      };
    } catch (error) {
      if (isRuntimeNotFound(error)) return { enabled: false };
      reportRuntimeError(error, 'context');
      return { enabled: false };
    }
  }

  async function reviewRuntimeMemory(
    character: UICharacter,
    memoryId: string,
    action: MemoryReviewAction
  ): Promise<boolean> {
    try {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      await api.reviewMemory(stableChatCharacterId(tenantId, character.id), { tenantId, memoryId, action });
      return true;
    } catch (error) {
      reportRuntimeError(error, 'event');
      return false;
    }
  }

  /**
   * Runtime 回放自检：以初始快照重放事件流，比较重放结果与已存快照。
   * 用于确认 Reducer 与历史事件的确定性一致（不写库）。
   */
  async function verifyRuntimeReplay(character: UICharacter): Promise<
    | { enabled: false }
    | { enabled: true; consistent: boolean; storedVersion: number; replayedVersion: number; eventCount: number }
  > {
    try {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      const snapshot = await api.getCharacter(stableChatCharacterId(tenantId, character.id));
      const baseline = createRuntimeReplayBaseline(snapshot);
      const replayed = replayRuntimeEvents(baseline, snapshot.events ?? []);
      return {
        enabled: true,
        consistent: replayed.version === snapshot.version,
        storedVersion: snapshot.version,
        replayedVersion: replayed.version,
        eventCount: snapshot.events?.length ?? 0,
      };
    } catch (error) {
      if (isRuntimeNotFound(error)) return { enabled: false };
      reportRuntimeError(error, 'context');
      return { enabled: false };
    }
  }

  return {
    setStorageAdapter,
    reportRuntimeError,
    resolveRuntimeTenantId,
    getRuntimeApi,
    ensureRuntimeIntegration,
    createRuntimeCharactersBatch,
    inspectRuntimeState,
    reviewRuntimeMemory,
    verifyRuntimeReplay,
    runtimeStatus,
    activePresetInfo,
  };
});
