import {
  applyEmotionDeltas,
  applyMoodDelta,
  clamp,
  computeSalience,
  decayAttitudes,
  decayEmotions,
  decayMood,
  decayRelationships,
  maxEmotionIntensity,
  nowIso,
  residualInfluence,
  sameEpisode,
  shouldStartEpisode,
  updateEpisodeStatus,
} from './emotion-engine';
import { deriveAppraisalEffects, evaluateAppraisal } from './appraisal-engine';
import { planBehavior } from './behavior-planner';
import { compileCharacter } from './character-compiler';
import { createRuntimeSnapshot, OptimisticLockError, RuntimeAlreadyExistsError, RuntimeConflictError } from './store';
import { buildRuntimeContext } from './context-builder';
import { stableChatConversationTurnIds } from './runtime-id';
import { RUNTIME_EVENT_SCHEMA_VERSION, RUNTIME_REDUCER_VERSION } from './types';
import type {
  AttitudeState,
  AppraisalResult,
  BehaviorPlan,
  CharacterCompileInput,
  CharacterDefinition,
  DomainEvent,
  Episode,
  EventEffects,
  MemoryRecord,
  MemoryReviewAction,
  RelationshipState,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeEventInput,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeConversationTurnEventInput,
  RuntimeConversationTurnCommitResult,
  RuntimeReduceResult,
  RuntimeSnapshot,
  RuntimeCharacterListRequest,
  RuntimeCharacterListResult,
  RuntimeSnapshotStore,
  StateChange,
} from './types';

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 为 Replay 产生跨运行稳定的 UUID-like ID。
 * 运行时 Event 本身仍使用随机 ID；由 Event 派生的 Episode、Memory、StateChange
 * 使用稳定 ID，避免同一事件流重放时产生不同的审计主键。
 */
function stableId(namespace: string, ...parts: string[]): string {
  const input = [namespace, ...parts].join('\u0000');
  const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];
  const hashes = seeds.map((seed, lane) => {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= (input.charCodeAt(index) + lane * 31 + index) & 0xff;
      hash = Math.imul(hash, 0x01000193 + lane * 2) >>> 0;
      hash ^= hash >>> 13;
    }
    return hash >>> 0;
  });
  const hex = hashes.map((hash) => hash.toString(16).padStart(8, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '5' + hex.slice(13, 16),
    '8' + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

function sameEvent(left: DomainEvent, right: DomainEvent): boolean {
  // sourceTurnIds 是可重建的规范化证据关联，不属于 Event 事实本身；忽略它可以
  // 兼容升级前已经落库、但尚未带有多 Turn 关联的同一幂等 Event。
  const comparable = (event: DomainEvent) => {
    const { sourceTurnIds: _sourceTurnIds, ...fact } = event;
    return {
      ...fact,
      schemaVersion: event.schemaVersion ?? RUNTIME_EVENT_SCHEMA_VERSION,
      reducerVersion: event.reducerVersion ?? RUNTIME_REDUCER_VERSION,
    };
  };
  return JSON.stringify(canonicalize(comparable(left))) === JSON.stringify(canonicalize(comparable(right)));
}

export function validateRuntimeEventVersion(event: Pick<DomainEvent, 'schemaVersion' | 'reducerVersion'>): void {
  const schemaVersion = event.schemaVersion ?? RUNTIME_EVENT_SCHEMA_VERSION;
  const reducerVersion = event.reducerVersion ?? RUNTIME_REDUCER_VERSION;
  if (schemaVersion !== RUNTIME_EVENT_SCHEMA_VERSION) {
    throw new Error(`不支持的 Runtime Event Schema 版本：${schemaVersion}`);
  }
  if (reducerVersion !== RUNTIME_REDUCER_VERSION) {
    throw new Error(`不支持的 Runtime Reducer 版本：${reducerVersion}`);
  }
}


function nowOr(value?: string): string {
  return value ?? nowIso();
}

function eventEmotionIntensity(snapshot: RuntimeSnapshot, effects: EventEffects, now: string): number {
  const emotions = applyEmotionDeltas(snapshot.character.emotions, effects.emotionDeltas ?? {}, now);
  return maxEmotionIntensity(emotions);
}

function updateAttitude(
  attitudes: AttitudeState[],
  effects: EventEffects,
  event: DomainEvent,
  now: string
): AttitudeState[] {
  const input = effects.attitudeDelta;
  if (!input && !event.targetId) return attitudes;
  const targetId = input?.targetId ?? event.targetId;
  if (!targetId) return attitudes;
  const previous = attitudes.find((item) => item.targetId === targetId);
  const next: AttitudeState = {
    targetId,
    liking: clamp((previous?.liking ?? 0) + (input?.liking ?? 0)),
    salience: clamp((previous?.salience ?? 0) + (input?.salience ?? 0)),
    confidence: clamp((previous?.confidence ?? 0) + (input?.confidence ?? 0)),
    evidenceCount: (previous?.evidenceCount ?? 0) + 1,
    ...(input?.halfLifeSeconds !== undefined || previous?.halfLifeSeconds !== undefined
      ? { halfLifeSeconds: Math.max(0, input?.halfLifeSeconds ?? previous?.halfLifeSeconds ?? 0) }
      : {}),
    ...(input?.baselineLiking !== undefined || previous?.baselineLiking !== undefined
      ? { baselineLiking: clamp(input?.baselineLiking ?? previous?.baselineLiking ?? 0) }
      : {}),
    ...(input?.baselineSalience !== undefined || previous?.baselineSalience !== undefined
      ? { baselineSalience: clamp(input?.baselineSalience ?? previous?.baselineSalience ?? 0) }
      : {}),
    ...(input?.baselineConfidence !== undefined || previous?.baselineConfidence !== undefined
      ? { baselineConfidence: clamp(input?.baselineConfidence ?? previous?.baselineConfidence ?? 0) }
      : {}),
    updatedAt: now,
  };
  return [...attitudes.filter((item) => item.targetId !== targetId), next];
}

function updateRelationship(
  relationships: RelationshipState[],
  effects: EventEffects,
  event: DomainEvent,
  now: string
): RelationshipState[] {
  const input = effects.relationshipDelta;
  if (!input && !event.targetId) return relationships;
  const targetId = input?.targetId ?? event.targetId;
  if (!targetId) return relationships;
  const previous = relationships.find((item) => item.targetId === targetId);
  const dimensions = { ...(previous?.dimensions ?? {}) };
  for (const [key, value] of Object.entries(input?.dimensions ?? {})) {
    dimensions[key] = clamp((dimensions[key] ?? 0) + value);
  }
  const baselineDimensions = {
    ...(previous?.baselineDimensions ?? {}),
    ...(input?.baselineDimensions ?? {}),
  };
  return [
    ...relationships.filter((item) => item.targetId !== targetId),
    {
      targetId,
      dimensions,
      closeness: clamp((previous?.closeness ?? 0) + (input?.closeness ?? 0)),
      ...(input?.halfLifeSeconds !== undefined || previous?.halfLifeSeconds !== undefined
        ? { halfLifeSeconds: Math.max(0, input?.halfLifeSeconds ?? previous?.halfLifeSeconds ?? 0) }
        : {}),
      ...(input?.baselineCloseness !== undefined || previous?.baselineCloseness !== undefined
        ? { baselineCloseness: clamp(input?.baselineCloseness ?? previous?.baselineCloseness ?? 0) }
        : {}),
      ...(Object.keys(baselineDimensions).length > 0 ? { baselineDimensions } : {}),
      updatedAt: now,
    },
  ];
}

function findEpisode(snapshot: RuntimeSnapshot, event: DomainEvent, intensity: number): Episode | undefined {
  return [...snapshot.episodes]
    .reverse()
    .find((episode) =>
      sameEpisode(episode, {
        eventImportance: event.importance,
        emotionIntensity: intensity,
        targetId: event.targetId,
        topic: event.topic,
        now: event.occurredAt,
      }) && episode.status !== 'resolved'
    );
}

function updateEpisodes(snapshot: RuntimeSnapshot, event: DomainEvent, effects: EventEffects, now: string, salience: number): Episode[] {
  const intensity = eventEmotionIntensity(snapshot, effects, now);
  const current = findEpisode(snapshot, event, intensity);
  const explicitResolution = Boolean(effects.resolveEpisodeId);
  if (effects.resolveEpisodeId) {
    return snapshot.episodes.map((episode) =>
      episode.id === effects.resolveEpisodeId
        ? { ...episode, status: 'resolved', unresolved: false, resolvedAt: now, lastEventAt: now }
        : episode
    );
  }
  if (!current && !shouldStartEpisode({ eventImportance: event.importance, emotionIntensity: intensity, now })) {
    return snapshot.episodes.map((episode) => ({
      ...episode,
      residualInfluence: residualInfluence(episode, now),
    }));
  }
  if (current) {
    const status = updateEpisodeStatus(current, {
      eventImportance: event.importance,
      emotionIntensity: intensity,
      targetId: event.targetId,
      topic: event.topic,
      explicitResolution,
      now,
    });
    const updated: Episode = {
      ...current,
      status,
      lastEventAt: now,
      currentIntensity: intensity,
      peakIntensity: Math.max(current.peakIntensity, intensity),
      salience: Math.max(current.salience, salience),
      residualInfluence: intensity,
      unresolved: status !== 'resolved',
      eventIds: current.eventIds.includes(event.id) ? current.eventIds : [...current.eventIds, event.id],
      ...(status === 'resolved' ? { resolvedAt: now } : {}),
    };
    return [...snapshot.episodes.filter((episode) => episode.id !== current.id), updated];
  }
  const created: Episode = {
    id: stableId('episode', snapshot.character.id, event.id),
    targetId: event.targetId,
    topic: event.topic,
    status: 'active',
    startedAt: now,
    lastEventAt: now,
    currentIntensity: intensity,
    peakIntensity: intensity,
    salience,
    residualInfluence: intensity,
    unresolved: true,
    eventIds: [event.id],
  };
  return [...snapshot.episodes, created];
}

function createMemoryIfRequested(
  snapshot: RuntimeSnapshot,
  event: DomainEvent,
  effects: EventEffects,
  now: string
): MemoryRecord | undefined {
  if (!effects.memory?.content?.trim()) return undefined;
  return {
    id: stableId('memory', snapshot.character.id, event.id),
    characterId: snapshot.character.id,
    type: effects.memory.type,
    content: effects.memory.content.trim(),
    importance: clamp(effects.memory.importance ?? event.importance),
    confidence: clamp(effects.memory.confidence ?? 1),
    salience: clamp(effects.memory.importance ?? event.importance),
    targetId: effects.memory.targetId ?? event.targetId,
    sourceEventId: event.id,
    occurredAt: now,
    reviewStatus: 'candidate',
    ...(effects.memory.validFrom ? { validFrom: effects.memory.validFrom } : {}),
    ...(effects.memory.validUntil ? { validUntil: effects.memory.validUntil } : {}),
  };
}

function diffSummary(before: RuntimeSnapshot, after: RuntimeSnapshot, appraisal: AppraisalResult): Record<string, unknown> {
  return {
    emotionCount: after.character.emotions.length,
    attitudeCount: after.character.attitudes.length,
    relationshipCount: after.character.relationships.length,
    episodeCount: after.episodes.length,
    memoryCount: after.memories.length,
    previousVersion: before.version,
    nextVersion: after.version,
    appraisal,
  };
}

function storedAppraisal(change: StateChange | undefined): AppraisalResult | undefined {
  const candidate = change?.changes.appraisal;
  if (!candidate || typeof candidate !== 'object') return undefined;
  return candidate as AppraisalResult;
}

function duplicateEventResult(snapshot: RuntimeSnapshot, event: DomainEvent): RuntimeReduceResult | null {
  const existing = snapshot.events.find((item) => item.id === event.id);
  if (!existing) return null;
  if (!sameEvent(existing, event)) {
    throw new RuntimeConflictError('事件 ID 已存在但内容不一致：' + event.id);
  }
  const stateChange = [...snapshot.stateChanges].reverse().find((item) => item.eventId === event.id);
  if (!stateChange) throw new Error('事件 ' + event.id + ' 已存在但缺少 StateChange');
  return {
    snapshot,
    event: existing,
    stateChange,
    createdMemory: snapshot.memories.find((item) => item.sourceEventId === event.id),
    changedEpisode: snapshot.episodes.find((item) => item.eventIds.includes(event.id)),
    appraisal: storedAppraisal(stateChange),
  };
}

export function reduceRuntimeState(snapshot: RuntimeSnapshot, event: DomainEvent): RuntimeReduceResult {
  validateRuntimeEventVersion(event);
  const duplicate = duplicateEventResult(snapshot, event);
  if (duplicate) return duplicate;
  const now = event.occurredAt;
  const appraisal = evaluateAppraisal({ snapshot, event });
  if (event.effects?.memoryReview) {
    const { memoryId, action } = event.effects.memoryReview;
    const memory = snapshot.memories.find((item) => item.id === memoryId);
    if (!memory) throw new Error(`记忆不存在：${memoryId}`);
    if (action !== 'forget' && memory.reviewStatus !== undefined && memory.reviewStatus !== 'candidate') {
      throw new RuntimeConflictError('只有待确认记忆可以确认或拒绝');
    }
    const reviewStatus = action === 'confirm'
      ? 'confirmed'
      : action === 'reject'
        ? 'rejected'
        : 'forgotten';
    const next: RuntimeSnapshot = {
      ...snapshot,
      character: { ...snapshot.character, version: snapshot.version + 1, updatedAt: now },
      events: [...snapshot.events, event],
      memories: snapshot.memories.map((item) => item.id === memoryId
        ? { ...item, reviewStatus, reviewedAt: now }
        : item),
      version: snapshot.version + 1,
      updatedAt: now,
    };
    const stateChange: StateChange = {
      id: stableId('state-change', event.id, String(next.version)),
      eventId: event.id,
      characterId: event.characterId,
      occurredAt: now,
      stateVersion: next.version,
      stateType: 'runtime',
      dimension: 'memory_review',
      delta: 0,
      changes: {
        previousVersion: snapshot.version,
        nextVersion: next.version,
        memoryReview: { memoryId, action, reviewStatus },
      },
    };
    next.stateChanges = [...snapshot.stateChanges, stateChange];
    return { snapshot: next, event, stateChange, appraisal, behaviorPlan: planBehavior({ snapshot: next, event, appraisal }) };
  }
  const effects = deriveAppraisalEffects(event, appraisal);
  const before = snapshot;
  const emotions = applyEmotionDeltas(snapshot.character.emotions, effects.emotionDeltas ?? {}, now);
  const mood = applyMoodDelta(snapshot.character.mood, effects.moodDelta ?? {}, now);
  const attitudes = updateAttitude(decayAttitudes(snapshot.character.attitudes, now), effects, event, now);
  const relationships = updateRelationship(decayRelationships(snapshot.character.relationships, now), effects, event, now);
  const emotionalImpact = Math.max(maxEmotionIntensity(emotions), appraisal.impact);
  const attitude = event.targetId ? attitudes.find((item) => item.targetId === event.targetId) : undefined;
  const relationship = event.targetId ? relationships.find((item) => item.targetId === event.targetId) : undefined;
  const salience = computeSalience({
    interaction: attitude ? Math.min(1, attitude.evidenceCount / 10) : 0,
    emotionalImpact,
    eventImportance: Math.max(event.importance, appraisal.importance),
    relationshipRelevance: Math.max(relationship?.closeness ?? 0, appraisal.socialSignificance),
    recency: 1,
  });
  const provisional: RuntimeSnapshot = {
    ...snapshot,
    character: {
      ...snapshot.character,
      emotions: decayEmotions(emotions, now),
      mood: decayMood(mood, now),
      attitudes,
      relationships,
      version: snapshot.version + 1,
      updatedAt: now,
    },
    events: [...snapshot.events, event],
    version: snapshot.version + 1,
    updatedAt: now,
  };
  const episodes = updateEpisodes(provisional, event, effects, now, salience);
  const memory = createMemoryIfRequested(provisional, event, effects, now);
  const next: RuntimeSnapshot = {
    ...provisional,
    episodes,
    memories: memory ? [...provisional.memories, memory] : provisional.memories,
  };
  const stateChange: StateChange = {
    id: stableId('state-change', event.id, String(next.version)),
    eventId: event.id,
    characterId: event.characterId,
    occurredAt: now,
    stateVersion: next.version,
    stateType: 'runtime',
    dimension: 'projection',
    delta: 0,
    changes: diffSummary(before, next, appraisal),
  };
  next.stateChanges = [...snapshot.stateChanges, stateChange];
  const changedEpisode = episodes.find((episode) => episode.eventIds.includes(event.id));
  const behaviorPlan: BehaviorPlan = planBehavior({ snapshot: next, event, appraisal });
  return { snapshot: next, event, stateChange, createdMemory: memory, changedEpisode, appraisal, behaviorPlan };
}

/**
 * 从一个已知快照重放追加事件，供数据修复、版本升级和离线审计使用。
 * 不访问存储，也不调用 LLM。
 */
export function replayRuntimeEvents(
  initial: RuntimeSnapshot,
  events: readonly DomainEvent[]
): RuntimeSnapshot {
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((left, right) =>
      left.event.occurredAt.localeCompare(right.event.occurredAt) ||
      left.event.id.localeCompare(right.event.id) ||
      left.index - right.index
    );
  let snapshot = initial;
  for (const { event } of ordered) {
    if (event.characterId !== initial.character.id || event.tenantId !== initial.character.tenantId) {
      throw new Error('Replay 事件与初始角色的租户或角色不一致');
    }
    snapshot = reduceRuntimeState(snapshot, event).snapshot;
  }
  return snapshot;
}

export function createRuntimeReplayBaseline(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  const createdAt = snapshot.character.createdAt;
  const character: CharacterDefinition = {
    ...snapshot.character,
    version: 0,
    updatedAt: createdAt,
    emotions: snapshot.character.emotions.map((emotion) => ({
      ...emotion,
      intensity: emotion.baseline,
      updatedAt: createdAt,
    })),
    mood: {
      ...snapshot.character.mood,
      valence: snapshot.character.mood.baselineValence,
      arousal: snapshot.character.mood.baselineArousal,
      dominance: snapshot.character.mood.baselineDominance,
      updatedAt: createdAt,
    },
    attitudes: [],
    relationships: [],
  };
  return {
    character,
    events: [],
    stateChanges: [],
    memories: [],
    episodes: [],
    version: 0,
    updatedAt: createdAt,
  };
}

function toDomainEvent(input: RuntimeEventInput): DomainEvent {
  return {
    id: input.eventId?.trim() || id(),
    tenantId: input.tenantId,
    characterId: input.characterId,
    actorId: input.actorId,
    targetId: input.targetId,
    eventType: input.eventType,
    schemaVersion: input.schemaVersion ?? RUNTIME_EVENT_SCHEMA_VERSION,
    reducerVersion: input.reducerVersion ?? RUNTIME_REDUCER_VERSION,
    topic: input.topic,
    importance: clamp(input.importance ?? 0.5),
    payload: input.payload ?? {},
    effects: input.effects,
    occurredAt: nowOr(input.occurredAt),
    sourceTurnId: input.sourceTurnId,
    sourceTurnIds: input.sourceTurnIds,
  };
}

function fallbackConversationTurnResult(input: RuntimeConversationTurnInput): RuntimeConversationTurnResult {
  return stableChatConversationTurnIds(
    input.tenantId,
    input.characterId,
    input.conversationKey,
    input.sessionKey,
    input.turnId.trim()
  );
}

export interface RuntimeCoreOptions {
  /** PostgreSQL 多实例并发冲突后的自动重试次数。 */
  maxCommitRetries?: number;
}

export class RuntimeCore {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly maxCommitRetries: number;

  constructor(private readonly store: RuntimeSnapshotStore, options: RuntimeCoreOptions = {}) {
    this.maxCommitRetries = Math.max(0, Math.floor(options.maxCommitRetries ?? 2));
  }

  async createCharacter(input: CharacterCompileInput): Promise<CharacterDefinition> {
    const character = compileCharacter(input);
    return this.enqueue(character.id, async () => {
      if (await this.store.load(character.id)) {
        throw new RuntimeAlreadyExistsError(character.id);
      }
      const snapshot = createRuntimeSnapshot(character);
      try {
        if (this.store.initialize) await this.store.initialize(snapshot);
        else await this.store.commit(snapshot, 0);
      } catch (error) {
        // 跨实例同时初始化：唯一键或乐观锁冲突后重新读取已提交的角色。
        if (await this.store.load(character.id)) throw new RuntimeAlreadyExistsError(character.id);
        throw error;
      }
      return character;
    });
  }

  async listCharacters(request: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    if (!this.store.listCharacters) throw new Error('Runtime Store 不支持角色列表');
    return this.store.listCharacters(request);
  }

  async getSnapshot(characterId: string): Promise<RuntimeSnapshot | null> {
    return this.store.load(characterId);
  }

  async ingestEvent(input: RuntimeEventInput): Promise<RuntimeReduceResult> {
    let event: DomainEvent = toDomainEvent(input);
    return this.enqueue(input.characterId, async () => {
      let attempt = 0;
      while (true) {
        const snapshot = await this.store.load(input.characterId);
        if (!snapshot) throw new Error(`角色不存在：${input.characterId}`);
        if (snapshot.character.tenantId !== input.tenantId) throw new Error('租户隔离校验失败');
        const existing = input.eventId
          ? snapshot.events.find((item) => item.id === input.eventId)
          : undefined;
        if (existing && input.occurredAt === undefined) {
          event = { ...event, occurredAt: existing.occurredAt };
        }
        const result = reduceRuntimeState(snapshot, event);
        if (result.snapshot === snapshot) return result;
        try {
          await this.store.commit(result.snapshot, snapshot.version);
          return result;
        } catch (error) {
          if (!(error instanceof OptimisticLockError) || attempt >= this.maxCommitRetries) throw error;
          attempt += 1;
        }
      }
    });
  }

  async reviewMemory(input: {
    tenantId: string;
    characterId: string;
    memoryId: string;
    action: MemoryReviewAction;
    occurredAt?: string;
  }): Promise<RuntimeReduceResult> {
    return this.ingestEvent({
      tenantId: input.tenantId,
      characterId: input.characterId,
      eventId: stableId('memory-review', input.characterId, input.memoryId, input.action),
      eventType: 'memory.review',
      importance: 0,
      payload: { memoryId: input.memoryId, action: input.action },
      occurredAt: input.occurredAt,
      effects: { memoryReview: { memoryId: input.memoryId, action: input.action } },
    });
  }

  async recordConversationTurn(
    input: RuntimeConversationTurnInput
  ): Promise<RuntimeConversationTurnResult> {
    return this.enqueue(input.characterId, async () => {
      const snapshot = await this.store.load(input.characterId);
      if (!snapshot) throw new Error(`角色不存在：${input.characterId}`);
      if (snapshot.character.tenantId !== input.tenantId) throw new Error('租户隔离校验失败');
      if (this.store.recordConversationTurn) {
        return this.store.recordConversationTurn(input);
      }
      // 本地快照不保存规范化 Turn，但返回与服务端一致的稳定证据 ID。
      return fallbackConversationTurnResult(input);
    });
  }

  async ingestConversationTurn(
    input: RuntimeConversationTurnEventInput & { characterId: string }
  ): Promise<RuntimeConversationTurnCommitResult> {
    const turnInput: RuntimeConversationTurnInput = {
      ...input.turn,
      turnId: input.turn.turnId.trim(),
      tenantId: input.tenantId,
      characterId: input.characterId,
    };
    if (!turnInput.turnId) throw new Error('conversation turn 缺少稳定 turnId');
    const stableTurnIds = stableChatConversationTurnIds(
      input.tenantId,
      input.characterId,
      turnInput.conversationKey,
      turnInput.sessionKey,
      turnInput.turnId
    );
    const eventInput: RuntimeEventInput = {
      ...input.event,
      tenantId: input.tenantId,
      characterId: turnInput.characterId,
      // 原子提交的证据由 Turn 键推导，不能信任客户端传入的其他 Turn UUID。
      sourceTurnId: turnInput.turnId,
      sourceTurnIds: [stableTurnIds.userTurnId, stableTurnIds.assistantTurnId],
    };
    let event: DomainEvent = toDomainEvent(eventInput);
    return this.enqueue(turnInput.characterId, async () => {
      if (turnInput.tenantId !== input.tenantId) throw new Error('租户隔离校验失败');
      let attempt = 0;
      while (true) {
        const snapshot = await this.store.load(turnInput.characterId);
        if (!snapshot) throw new Error(`角色不存在：${turnInput.characterId}`);
        if (snapshot.character.tenantId !== input.tenantId) throw new Error('租户隔离校验失败');
        const existing = event.id
          ? snapshot.events.find((item) => item.id === event.id)
          : undefined;
        if (existing && eventInput.occurredAt === undefined) {
          event = { ...event, occurredAt: existing.occurredAt };
        }
        const reduced = reduceRuntimeState(snapshot, event);
        try {
          if (reduced.snapshot === snapshot) {
            const turn = this.store.commitConversationTurn
              ? await this.store.commitConversationTurn(snapshot, snapshot.version, turnInput)
              : (this.store.recordConversationTurn
                ? await this.store.recordConversationTurn(turnInput)
                : fallbackConversationTurnResult(turnInput));
            return { turn, result: reduced };
          }
          const turn = this.store.commitConversationTurn
            ? await this.store.commitConversationTurn(
              reduced.snapshot,
              snapshot.version,
              turnInput
            )
            : (this.store.recordConversationTurn
              ? await this.store.recordConversationTurn(turnInput)
              : fallbackConversationTurnResult(turnInput));
          if (!this.store.commitConversationTurn) {
            await this.store.commit(reduced.snapshot, snapshot.version);
          }
          return { turn, result: reduced };
        } catch (error) {
          if (!(error instanceof OptimisticLockError) || attempt >= this.maxCommitRetries) throw error;
          attempt += 1;
        }
      }
    });
  }

  async buildContext(characterId: string, request: RuntimeContextRequest = {}): Promise<RuntimeContext> {
    const snapshot = await this.store.load(characterId);
    if (!snapshot) throw new Error(`角色不存在：${characterId}`);
    const context = buildRuntimeContext(snapshot, request);
    if (context.contextBuild && this.store.recordContextBuild) {
      try {
        await this.store.recordContextBuild(context.contextBuild);
      } catch {
        // 上下文审计属于可观测性增强，不能阻塞正常对话。
      }
    }
    return context;
  }

  private enqueue<T>(characterId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(characterId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.queues.set(characterId, next.then(() => undefined, () => undefined));
    return next;
  }
}

export { OptimisticLockError };
