import {
  applyEmotionDeltas,
  applyMoodDelta,
  clamp,
  computeSalience,
  decayEmotions,
  decayMood,
  maxEmotionIntensity,
  nowIso,
  residualInfluence,
  sameEpisode,
  shouldStartEpisode,
  updateEpisodeStatus,
} from './emotion-engine';
import { compileCharacter } from './character-compiler';
import { createRuntimeSnapshot, OptimisticLockError } from './store';
import { buildRuntimeContext } from './context-builder';
import type {
  AttitudeState,
  CharacterCompileInput,
  CharacterDefinition,
  DomainEvent,
  Episode,
  EventEffects,
  MemoryRecord,
  RelationshipState,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeEventInput,
  RuntimeReduceResult,
  RuntimeSnapshot,
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

function asEffects(event: DomainEvent): EventEffects {
  return event.effects ?? {};
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
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
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
  return [
    ...relationships.filter((item) => item.targetId !== targetId),
    {
      targetId,
      dimensions,
      closeness: clamp((previous?.closeness ?? 0) + (input?.closeness ?? 0)),
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
    salience: clamp(effects.memory.importance ?? event.importance),
    targetId: effects.memory.targetId ?? event.targetId,
    sourceEventId: event.id,
    occurredAt: now,
  };
}

function diffSummary(before: RuntimeSnapshot, after: RuntimeSnapshot): Record<string, unknown> {
  return {
    emotionCount: after.character.emotions.length,
    attitudeCount: after.character.attitudes.length,
    relationshipCount: after.character.relationships.length,
    episodeCount: after.episodes.length,
    memoryCount: after.memories.length,
    previousVersion: before.version,
    nextVersion: after.version,
  };
}

function duplicateEventResult(snapshot: RuntimeSnapshot, event: DomainEvent): RuntimeReduceResult | null {
  const existing = snapshot.events.find((item) => item.id === event.id);
  if (!existing) return null;
  if (!sameEvent(existing, event)) {
    throw new Error('事件 ID 已存在但内容不一致：' + event.id);
  }
  const stateChange = [...snapshot.stateChanges].reverse().find((item) => item.eventId === event.id);
  if (!stateChange) throw new Error('事件 ' + event.id + ' 已存在但缺少 StateChange');
  return {
    snapshot,
    event: existing,
    stateChange,
    createdMemory: snapshot.memories.find((item) => item.sourceEventId === event.id),
    changedEpisode: snapshot.episodes.find((item) => item.eventIds.includes(event.id)),
  };
}

export function reduceRuntimeState(snapshot: RuntimeSnapshot, event: DomainEvent): RuntimeReduceResult {
  const duplicate = duplicateEventResult(snapshot, event);
  if (duplicate) return duplicate;
  const now = event.occurredAt;
  const effects = asEffects(event);
  const before = snapshot;
  const emotions = applyEmotionDeltas(snapshot.character.emotions, effects.emotionDeltas ?? {}, now);
  const mood = applyMoodDelta(snapshot.character.mood, effects.moodDelta ?? {}, now);
  const attitudes = updateAttitude(snapshot.character.attitudes, effects, event, now);
  const relationships = updateRelationship(snapshot.character.relationships, effects, event, now);
  const emotionalImpact = maxEmotionIntensity(emotions);
  const attitude = event.targetId ? attitudes.find((item) => item.targetId === event.targetId) : undefined;
  const relationship = event.targetId ? relationships.find((item) => item.targetId === event.targetId) : undefined;
  const salience = computeSalience({
    interaction: attitude ? Math.min(1, attitude.evidenceCount / 10) : 0,
    emotionalImpact,
    eventImportance: event.importance,
    relationshipRelevance: relationship?.closeness ?? 0,
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
    changes: diffSummary(before, next),
  };
  next.stateChanges = [...snapshot.stateChanges, stateChange];
  const changedEpisode = episodes.find((episode) => episode.eventIds.includes(event.id));
  return { snapshot: next, event, stateChange, createdMemory: memory, changedEpisode };
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
    if (await this.store.load(character.id)) {
      throw new Error(`角色已存在：${character.id}`);
    }
    const snapshot = createRuntimeSnapshot(character);
    if (this.store.initialize) await this.store.initialize(snapshot);
    else await this.store.commit(snapshot, 0);
    return character;
  }

  async getSnapshot(characterId: string): Promise<RuntimeSnapshot | null> {
    return this.store.load(characterId);
  }

  async ingestEvent(input: RuntimeEventInput): Promise<RuntimeReduceResult> {
    let event: DomainEvent = {
      id: input.eventId?.trim() || id(),
      tenantId: input.tenantId,
      characterId: input.characterId,
      actorId: input.actorId,
      targetId: input.targetId,
      eventType: input.eventType,
      topic: input.topic,
      importance: clamp(input.importance ?? 0.5),
      payload: input.payload ?? {},
      effects: input.effects,
      occurredAt: nowOr(input.occurredAt),
      sourceTurnId: input.sourceTurnId,
    };
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

  async buildContext(characterId: string, request: RuntimeContextRequest = {}): Promise<RuntimeContext> {
    const snapshot = await this.store.load(characterId);
    if (!snapshot) throw new Error(`角色不存在：${characterId}`);
    return buildRuntimeContext(snapshot, request);
  }

  private enqueue<T>(characterId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(characterId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.queues.set(characterId, next.then(() => undefined, () => undefined));
    return next;
  }
}

export { OptimisticLockError };
