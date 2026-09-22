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

function id(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function asEffects(event: DomainEvent): EventEffects {
  return event.effects ?? {};
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
    id: id('episode'),
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
    id: id('memory'),
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

export function reduceRuntimeState(snapshot: RuntimeSnapshot, event: DomainEvent): RuntimeReduceResult {
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
    id: id('state_change'),
    eventId: event.id,
    characterId: event.characterId,
    occurredAt: now,
    stateVersion: next.version,
    changes: diffSummary(before, next),
  };
  next.stateChanges = [...snapshot.stateChanges, stateChange];
  const changedEpisode = episodes.find((episode) => episode.eventIds.includes(event.id));
  return { snapshot: next, event, stateChange, createdMemory: memory, changedEpisode };
}

export class RuntimeCore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly store: RuntimeSnapshotStore) {}

  async createCharacter(input: CharacterCompileInput): Promise<CharacterDefinition> {
    const character = compileCharacter(input);
    if (await this.store.load(character.id)) {
      throw new Error(`角色已存在：${character.id}`);
    }
    const snapshot = createRuntimeSnapshot(character);
    await this.store.commit(snapshot, 0);
    return character;
  }

  async getSnapshot(characterId: string): Promise<RuntimeSnapshot | null> {
    return this.store.load(characterId);
  }

  async ingestEvent(input: RuntimeEventInput): Promise<RuntimeReduceResult> {
    const event: DomainEvent = {
      id: id('event'),
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
      const snapshot = await this.store.load(input.characterId);
      if (!snapshot) throw new Error(`角色不存在：${input.characterId}`);
      if (snapshot.character.tenantId !== input.tenantId) throw new Error('租户隔离校验失败');
      const result = reduceRuntimeState(snapshot, event);
      await this.store.commit(result.snapshot, snapshot.version);
      return result;
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




