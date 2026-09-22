import { DEFAULT_EMOTION_HALF_LIFE_SECONDS, DEFAULT_MOOD_HALF_LIFE_SECONDS, nowIso } from './emotion-engine';
import type {
  ArchetypeTemplate,
  CharacterCompileInput,
  CharacterDefinition,
  CharacterDelta,
  CharacterGoal,
  CharacterProfile,
  CharacterTrait,
  CharacterValue,
  CharacterBelief,
  EmotionState,
  MoodState,
  SeedMemory,
} from './types';

export class CharacterCompileError extends Error {
  constructor(public readonly issues: string[]) {
    super(`角色编译失败：${issues.join('；')}`);
    this.name = 'CharacterCompileError';
  }
}

function id(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function mergeByKey<T extends { key: string }>(base: T[] = [], delta: Array<Partial<T> & Pick<T, 'key'>> = []): T[] {
  const map = new Map(base.map((item) => [item.key, { ...item }]));
  for (const item of delta) {
    const previous = map.get(item.key);
    map.set(item.key, { ...previous, ...item } as T);
  }
  return [...map.values()];
}

function mergeProfile(...profiles: Array<Partial<CharacterProfile> | undefined>): CharacterProfile {
  const merged = Object.assign({}, ...profiles);
  return {
    displayName: typeof merged.displayName === 'string' ? merged.displayName.trim() : '',
    description: merged.description,
    speakingStyle: merged.speakingStyle,
    boundaries: merged.boundaries ? [...merged.boundaries] : undefined,
  };
}

function mergeScores(...values: Array<Record<string, number> | undefined>): Record<string, number> {
  return Object.assign({}, ...values);
}

function defaultEmotion(emotion: string, now: string): EmotionState {
  return {
    emotion,
    intensity: 0,
    baseline: 0,
    halfLifeSeconds: DEFAULT_EMOTION_HALF_LIFE_SECONDS,
    updatedAt: now,
  };
}

function defaultMood(now: string): MoodState {
  return {
    valence: 0,
    arousal: 0,
    dominance: 0,
    baselineValence: 0,
    baselineArousal: 0,
    baselineDominance: 0,
    halfLifeSeconds: DEFAULT_MOOD_HALF_LIFE_SECONDS,
    updatedAt: now,
  };
}

function mergeEmotionStates(
  base: Array<Partial<EmotionState> & Pick<EmotionState, 'emotion'>> = [],
  delta: Array<Partial<EmotionState> & Pick<EmotionState, 'emotion'>> = [],
  now: string
): EmotionState[] {
  const map = new Map<string, EmotionState>();
  for (const item of base) map.set(item.emotion, { ...defaultEmotion(item.emotion, now), ...item, updatedAt: now });
  for (const item of delta) {
    const previous = map.get(item.emotion) ?? defaultEmotion(item.emotion, now);
    map.set(item.emotion, { ...previous, ...item, updatedAt: now });
  }
  return [...map.values()];
}

function mergeMood(base: Partial<MoodState> | undefined, delta: Partial<MoodState> | undefined, now: string): MoodState {
  return { ...defaultMood(now), ...base, ...delta, updatedAt: now };
}

function validateScore(value: number | undefined, path: string, issues: string[]): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    issues.push(`${path} 必须是 0 到 1 之间的数字`);
  }
}

export function validateCharacterDefinition(character: CharacterDefinition): string[] {
  const issues: string[] = [];
  if (!character.id) issues.push('缺少角色 id');
  if (!character.tenantId) issues.push('缺少 tenantId');
  if (!character.profile.displayName.trim()) issues.push('角色名称不能为空');
  for (const trait of character.traits) validateScore(trait.value, `traits.${trait.key}`, issues);
  for (const value of character.values) validateScore(value.importance, `values.${value.key}`, issues);
  for (const belief of character.beliefs) validateScore(belief.confidence, `beliefs.${belief.key}`, issues);
  for (const goal of character.goals) validateScore(goal.priority, `goals.${goal.key}`, issues);
  for (const emotion of character.emotions) {
    validateScore(emotion.intensity, `emotions.${emotion.emotion}.intensity`, issues);
    validateScore(emotion.baseline, `emotions.${emotion.emotion}.baseline`, issues);
  }
  return issues;
}

export function compileCharacter(input: CharacterCompileInput): CharacterDefinition {
  const now = input.now ?? nowIso();
  const archetype: ArchetypeTemplate = input.archetype ?? { id: 'custom', name: 'Custom' };
  const delta: CharacterDelta = input.delta ?? {};
  const profile = mergeProfile(archetype.profile, delta.profile, input.profile);
  const traits = mergeByKey<CharacterTrait>(archetype.traits, delta.traits);
  const values = mergeByKey<CharacterValue>(archetype.values, delta.values);
  const beliefs = mergeByKey<CharacterBelief>(archetype.beliefs, delta.beliefs);
  const goals = mergeByKey<CharacterGoal>(archetype.goals, delta.goals);
  const emotions = mergeEmotionStates(archetype.defaultEmotions, delta.emotions, now);
  const mood = mergeMood(archetype.defaultMood, delta.mood, now);
  const character: CharacterDefinition = {
    id: input.id ?? id('character'),
    tenantId: input.tenantId,
    archetypeId: archetype.id,
    profile,
    traits,
    values,
    beliefs,
    goals,
    preferences: mergeScores(archetype.preferences, delta.preferences),
    emotions,
    mood,
    attitudes: [],
    relationships: [],
    seedMemories: (input.seedMemories ?? []).map((memory: SeedMemory) => ({ ...memory })),
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
  const issues = validateCharacterDefinition(character);
  if (issues.length > 0) throw new CharacterCompileError(issues);
  return character;
}

