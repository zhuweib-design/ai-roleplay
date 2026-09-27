import { decayAttitudes, decayEmotions, decayMood, decayRelationships, nowIso } from './emotion-engine';
import { evaluateAppraisal } from './appraisal-engine';
import { planBehavior } from './behavior-planner';
import { stableRuntimeUuid } from './runtime-id';
import type {
  AppraisalResult,
  BehaviorPlan,
  ContextBuildItem,
  ContextBuildRecord,
  DomainEvent,
  MemoryRecord,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeSnapshot,
} from './types';

function finiteLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function validAt(memory: MemoryRecord, now: string): boolean {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return false;
  if (memory.validFrom !== undefined) {
    const validFrom = Date.parse(memory.validFrom);
    if (!Number.isFinite(validFrom) || nowMs < validFrom) return false;
  }
  if (memory.validUntil !== undefined) {
    const validUntil = Date.parse(memory.validUntil);
    if (!Number.isFinite(validUntil) || nowMs > validUntil) return false;
  }
  return true;
}

function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.max(1, Math.ceil(text.length / 4));
}

function item(
  sourceType: ContextBuildItem['sourceType'],
  sourceId: string | undefined,
  rank: number,
  value: unknown,
  relevanceScore?: number
): ContextBuildItem {
  return {
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    rank,
    ...(relevanceScore === undefined ? {} : { relevanceScore }),
    tokenCount: estimateTokens(value),
  };
}

/**
 * 从 Runtime Snapshot 组装送入行为规划器/LLM 的上下文。
 * 该函数不修改持久化状态，适合在每次请求前重复调用。
 */
export function buildRuntimeContext(
  snapshot: RuntimeSnapshot,
  request: RuntimeContextRequest = {}
): RuntimeContext {
  const now = request.now ?? nowIso();
  const maxEvents = finiteLimit(request.maxEvents, 12);
  const maxMemories = finiteLimit(request.maxMemories, 12);
  const maxEpisodes = finiteLimit(request.maxEpisodes, 8);
  const query = request.query?.toLocaleLowerCase().trim();
  const match = (value: string): boolean => !query || value.toLocaleLowerCase().includes(query);
  const relevantMemories = [...snapshot.memories]
    .filter((memory) => memory.reviewStatus === undefined || memory.reviewStatus === 'confirmed')
    .filter((memory) => validAt(memory, now))
    .filter((memory) => (!request.targetId || memory.targetId === request.targetId) && match(memory.content))
    .sort((a, b) => b.salience - a.salience || Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, maxMemories)
    .map((memory) => ({ ...memory, lastAccessedAt: now }));
  const relevantEpisodes = [...snapshot.episodes]
    .filter((episode) => !request.targetId || episode.targetId === request.targetId)
    .sort((a, b) => b.salience - a.salience || Date.parse(b.lastEventAt) - Date.parse(a.lastEventAt))
    .slice(0, maxEpisodes);
  const targetEvents = [...snapshot.events]
    .filter((event) => !request.targetId || event.targetId === request.targetId)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
  const contextEvent: DomainEvent | undefined = targetEvents.at(-1);
  const latestChange = contextEvent
    ? [...snapshot.stateChanges].reverse().find((change) => change.eventId === contextEvent.id)
    : undefined;
  const stored = latestChange?.changes.appraisal;
  const appraisal: AppraisalResult | undefined = stored && typeof stored === 'object'
    ? stored as AppraisalResult
    : contextEvent
      ? evaluateAppraisal({ snapshot, event: contextEvent })
      : undefined;
  const behaviorPlan: BehaviorPlan = planBehavior({
    snapshot,
    event: contextEvent,
    appraisal,
    memories: relevantMemories,
  });
  const recentEvents = [...snapshot.events]
    .filter((event) => !request.targetId || event.targetId === request.targetId)
    .filter((event) => {
      if (!query) return true;
      const payloadText = JSON.stringify(event.payload ?? {}).toLocaleLowerCase();
      return [event.eventType, event.topic ?? '', payloadText].some((value) =>
        value.toLocaleLowerCase().includes(query)
      );
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id))
    .slice(-maxEvents);
  const contextBuildItems: ContextBuildItem[] = [
    item('identity', snapshot.character.id, 0, snapshot.character.profile, 1),
    item('state', snapshot.character.id, 0, {
      emotions: snapshot.character.emotions,
      mood: snapshot.character.mood,
      attitudes: snapshot.character.attitudes,
      relationships: snapshot.character.relationships,
      appraisal,
    }, appraisal?.impact ?? 0),
    ...recentEvents.map((event, index) => item(
      event.eventType === 'conversation_turn' ? 'turn' : 'event',
      event.sourceTurnId ?? event.id,
      index,
      event,
      event.importance
    )),
    ...relevantMemories.map((memory, index) => item('memory', memory.id, index, memory, memory.salience)),
    ...relevantEpisodes.map((episode, index) => item('episode', episode.id, index, episode, episode.salience)),
    ...snapshot.character.goals.filter((goal) => goal.active).map((goal, index) => item('goal', snapshot.character.id, index, goal, goal.priority)),
    item('behavior_plan', snapshot.character.id, 0, behaviorPlan, behaviorPlan.confidence),
  ];
  const contextBuild: ContextBuildRecord = {
    id: stableRuntimeUuid(
      'context-build',
      snapshot.character.id,
      String(snapshot.version),
      now,
      request.conversationId ?? '',
      request.turnId ?? '',
      request.targetId ?? '',
      request.query ?? ''
    ),
    characterId: snapshot.character.id,
    ...(request.conversationId ? { conversationId: request.conversationId } : {}),
    ...(request.turnId ? { turnId: request.turnId } : {}),
    ...(request.modelProvider ? { modelProvider: request.modelProvider } : {}),
    ...(request.modelName ? { modelName: request.modelName } : {}),
    totalTokenCount: contextBuildItems.reduce((total, current) => total + (current.tokenCount ?? 0), 0),
    createdAt: now,
    items: contextBuildItems,
  };
  return {
    identity: snapshot.character.profile,
    traits: snapshot.character.traits,
    values: snapshot.character.values,
    beliefs: snapshot.character.beliefs,
    currentState: {
      emotions: decayEmotions(snapshot.character.emotions, now),
      mood: decayMood(snapshot.character.mood, now),
      attitudes: decayAttitudes(snapshot.character.attitudes, now),
      relationships: decayRelationships(snapshot.character.relationships, now),
    },
    recentEvents,
    relevantMemories,
    relevantEpisodes,
    appraisal,
    behaviorPlan,
    contextBuild,
  };
}
