import type {
  EmotionName,
  EmotionState,
  Episode,
  EpisodeStatus,
  MoodState,
  AttitudeState,
  RelationshipState,
  Score,
} from './types';

export const DEFAULT_EMOTION_HALF_LIFE_SECONDS = 15 * 60;
export const DEFAULT_MOOD_HALF_LIFE_SECONDS = 6 * 60 * 60;

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 按半衰期把动态值拉回基线。halfLife <= 0 时立即回到基线。 */
export function decayTowardsBaseline(
  value: number,
  baseline: number,
  halfLifeSeconds: number,
  elapsedSeconds: number
): number {
  if (elapsedSeconds <= 0) return clamp(value);
  if (halfLifeSeconds <= 0) return clamp(baseline);
  const factor = Math.pow(0.5, elapsedSeconds / halfLifeSeconds);
  return clamp(baseline + (value - baseline) * factor);
}

export function decayEmotion(state: EmotionState, now: string): EmotionState {
  const elapsedSeconds = Math.max(0, (Date.parse(now) - Date.parse(state.updatedAt)) / 1000);
  return {
    ...state,
    intensity: decayTowardsBaseline(
      state.intensity,
      state.baseline,
      state.halfLifeSeconds,
      elapsedSeconds
    ),
    updatedAt: now,
  };
}

export function decayMood(state: MoodState, now: string): MoodState {
  const elapsedSeconds = Math.max(0, (Date.parse(now) - Date.parse(state.updatedAt)) / 1000);
  return {
    ...state,
    valence: decayTowardsBaseline(
      state.valence,
      state.baselineValence,
      state.halfLifeSeconds,
      elapsedSeconds
    ),
    arousal: decayTowardsBaseline(
      state.arousal,
      state.baselineArousal,
      state.halfLifeSeconds,
      elapsedSeconds
    ),
    dominance: decayTowardsBaseline(
      state.dominance,
      state.baselineDominance,
      state.halfLifeSeconds,
      elapsedSeconds
    ),
    updatedAt: now,
  };
}

export function decayEmotions(states: EmotionState[], now: string): EmotionState[] {
  return states.map((state) => decayEmotion(state, now));
}

/** 仅对显式配置 half-life 的长期态度做惰性衰减，旧快照保持原有不衰减行为。 */
export function decayAttitude(state: AttitudeState, now: string): AttitudeState {
  if (state.halfLifeSeconds === undefined || !Number.isFinite(state.halfLifeSeconds)) return state;
  const elapsedSeconds = Math.max(0, (Date.parse(now) - Date.parse(state.updatedAt)) / 1000);
  return {
    ...state,
    liking: decayTowardsBaseline(state.liking, state.baselineLiking ?? 0, state.halfLifeSeconds, elapsedSeconds),
    salience: decayTowardsBaseline(state.salience, state.baselineSalience ?? 0, state.halfLifeSeconds, elapsedSeconds),
    confidence: decayTowardsBaseline(state.confidence, state.baselineConfidence ?? 0, state.halfLifeSeconds, elapsedSeconds),
    updatedAt: now,
  };
}

export function decayAttitudes(states: AttitudeState[], now: string): AttitudeState[] {
  return states.map((state) => decayAttitude(state, now));
}

/** 仅对显式配置 half-life 的长期关系做惰性衰减，避免历史关系默认归零。 */
export function decayRelationship(state: RelationshipState, now: string): RelationshipState {
  const halfLifeSeconds = state.halfLifeSeconds;
  if (halfLifeSeconds === undefined || !Number.isFinite(halfLifeSeconds)) return state;
  const elapsedSeconds = Math.max(0, (Date.parse(now) - Date.parse(state.updatedAt)) / 1000);
  const dimensions = Object.fromEntries(
    Object.entries(state.dimensions).map(([key, value]) => [
      key,
      decayTowardsBaseline(value, state.baselineDimensions?.[key] ?? 0, halfLifeSeconds, elapsedSeconds),
    ])
  );
  return {
    ...state,
    dimensions,
    closeness: decayTowardsBaseline(state.closeness, state.baselineCloseness ?? 0, halfLifeSeconds, elapsedSeconds),
    updatedAt: now,
  };
}

export function decayRelationships(states: RelationshipState[], now: string): RelationshipState[] {
  return states.map((state) => decayRelationship(state, now));
}

export function applyEmotionDeltas(
  states: EmotionState[],
  deltas: Record<EmotionName, Score>,
  now: string
): EmotionState[] {
  const byName = new Map(decayEmotions(states, now).map((state) => [state.emotion, state]));
  for (const [emotion, delta] of Object.entries(deltas)) {
    const current = byName.get(emotion) ?? {
      emotion,
      intensity: 0,
      baseline: 0,
      halfLifeSeconds: DEFAULT_EMOTION_HALF_LIFE_SECONDS,
      updatedAt: now,
    };
    byName.set(emotion, {
      ...current,
      intensity: clamp(current.intensity + delta),
      updatedAt: now,
    });
  }
  return [...byName.values()].sort((a, b) => a.emotion.localeCompare(b.emotion));
}

export function applyMoodDelta(
  mood: MoodState,
  delta: Partial<Pick<MoodState, 'valence' | 'arousal' | 'dominance'>>,
  now: string
): MoodState {
  const decayed = decayMood(mood, now);
  return {
    ...decayed,
    valence: clamp(decayed.valence + (delta.valence ?? 0)),
    arousal: clamp(decayed.arousal + (delta.arousal ?? 0)),
    dominance: clamp(decayed.dominance + (delta.dominance ?? 0)),
    updatedAt: now,
  };
}

export interface SalienceSignals {
  interaction: number;
  emotionalImpact: number;
  eventImportance: number;
  relationshipRelevance: number;
  recency: number;
  decay?: number;
}

export function computeSalience(signals: SalienceSignals): number {
  const value =
    signals.interaction * 0.2 +
    signals.emotionalImpact * 0.25 +
    signals.eventImportance * 0.25 +
    signals.relationshipRelevance * 0.2 +
    signals.recency * 0.1 -
    (signals.decay ?? 0);
  return clamp(value);
}

export function maxEmotionIntensity(emotions: EmotionState[]): number {
  return emotions.reduce((max, emotion) => Math.max(max, emotion.intensity), 0);
}

export interface EpisodeDecisionInput {
  eventImportance: number;
  emotionIntensity: number;
  targetId?: string;
  topic?: string;
  explicitResolution?: boolean;
  now: string;
}

export function sameEpisode(a: Episode, input: EpisodeDecisionInput): boolean {
  const sameTarget = Boolean(a.targetId && input.targetId && a.targetId === input.targetId);
  const sameTopic = Boolean(a.topic && input.topic && a.topic === input.topic);
  return sameTarget || sameTopic;
}

export function shouldStartEpisode(input: EpisodeDecisionInput): boolean {
  return input.emotionIntensity >= 0.7 || input.eventImportance >= 0.75;
}

export function updateEpisodeStatus(
  episode: Episode,
  input: EpisodeDecisionInput
): EpisodeStatus {
  if (input.explicitResolution) return 'resolved';
  if (input.emotionIntensity <= 0.35) {
    return episode.status === 'active' || episode.status === 'reopened' ? 'cooling' : 'dormant';
  }
  if (episode.status === 'dormant' && sameEpisode(episode, input)) return 'reopened';
  if (input.emotionIntensity >= 0.45) return episode.status === 'cooling' ? 'active' : episode.status;
  return episode.status;
}

export function residualInfluence(episode: Episode, now: string): number {
  const elapsedSeconds = Math.max(0, (Date.parse(now) - Date.parse(episode.lastEventAt)) / 1000);
  return decayTowardsBaseline(episode.currentIntensity, 0.02, 7 * 24 * 60 * 60, elapsedSeconds);
}
