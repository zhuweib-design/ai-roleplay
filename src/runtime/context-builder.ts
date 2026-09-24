import { decayEmotions, decayMood, nowIso } from './emotion-engine';
import type { RuntimeContext, RuntimeContextRequest, RuntimeSnapshot } from './types';

/**
 * 从 Runtime Snapshot 组装送入行为规划器/LLM 的上下文。
 * 该函数不修改持久化状态，适合在每次请求前重复调用。
 */
export function buildRuntimeContext(
  snapshot: RuntimeSnapshot,
  request: RuntimeContextRequest = {}
): RuntimeContext {
  const now = request.now ?? nowIso();
  const maxEvents = request.maxEvents ?? 12;
  const maxMemories = request.maxMemories ?? 12;
  const maxEpisodes = request.maxEpisodes ?? 8;
  const query = request.query?.toLocaleLowerCase().trim();
  const match = (value: string): boolean => !query || value.toLocaleLowerCase().includes(query);
  const relevantMemories = [...snapshot.memories]
    .filter((memory) => (!request.targetId || memory.targetId === request.targetId) && match(memory.content))
    .sort((a, b) => b.salience - a.salience || Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, maxMemories)
    .map((memory) => ({ ...memory, lastAccessedAt: now }));
  const relevantEpisodes = [...snapshot.episodes]
    .filter((episode) => !request.targetId || episode.targetId === request.targetId)
    .sort((a, b) => b.salience - a.salience || Date.parse(b.lastEventAt) - Date.parse(a.lastEventAt))
    .slice(0, maxEpisodes);
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
  return {
    identity: snapshot.character.profile,
    traits: snapshot.character.traits,
    values: snapshot.character.values,
    beliefs: snapshot.character.beliefs,
    currentState: {
      emotions: decayEmotions(snapshot.character.emotions, now),
      mood: decayMood(snapshot.character.mood, now),
      attitudes: snapshot.character.attitudes,
      relationships: snapshot.character.relationships,
    },
    recentEvents,
    relevantMemories,
    relevantEpisodes,
  };
}
