import { clamp } from './emotion-engine';
import { evaluateAppraisal, hasPositiveEventSignal } from './appraisal-engine';
import type {
  AppraisalResult,
  BehaviorPlan,
  CharacterDefinition,
  DomainEvent,
  MemoryRecord,
  RuntimeSnapshot,
} from './types';

export interface BehaviorPlannerInput {
  snapshot: RuntimeSnapshot;
  event?: DomainEvent;
  appraisal?: AppraisalResult;
  memories?: MemoryRecord[];
}

function traitValue(character: CharacterDefinition, aliases: string[], fallback: number): number {
  const keys = aliases.map((key) => key.toLocaleLowerCase());
  const trait = character.traits.find((item) => keys.includes(item.key.toLocaleLowerCase()));
  return trait ? clamp(trait.value) : fallback;
}

function latestEvent(snapshot: RuntimeSnapshot, targetId?: string): DomainEvent | undefined {
  return [...snapshot.events]
    .filter((event) => !targetId || event.targetId === targetId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    .at(-1);
}

function currentEmotionExpression(snapshot: RuntimeSnapshot, appraisal: AppraisalResult | undefined): Record<string, number> {
  const emotions = [...snapshot.character.emotions]
    .filter((emotion) => emotion.intensity >= 0.05)
    .sort((left, right) => right.intensity - left.intensity || left.emotion.localeCompare(right.emotion))
    .slice(0, 4)
    .reduce<Record<string, number>>((result, emotion) => {
      result[emotion.emotion] = clamp(emotion.intensity);
      return result;
    }, {});
  if (Object.keys(emotions).length > 0 || !appraisal) return emotions;
  const inferred: Record<string, number> = {};
  const scale = clamp(appraisal.impact * 1.2);
  if (appraisal.betrayal > 0.35 || appraisal.valueViolation > 0.55) inferred.anger = clamp(scale * Math.max(appraisal.betrayal, appraisal.valueViolation));
  if (appraisal.threat > 0.35) inferred.fear = clamp(scale * appraisal.threat * 0.75);
  if (appraisal.loss > 0.35) inferred.sadness = clamp(scale * appraisal.loss * 0.75);
  return inferred;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function emptyPlan(character: CharacterDefinition): BehaviorPlan {
  return {
    goal: '保持自然、连贯的交流',
    strategy: 'neutral_response',
    assertiveness: traitValue(character, ['assertiveness', 'confidence'], 0.35),
    warmth: traitValue(character, ['warmth', 'empathy'], 0.5),
    directness: 0.35,
    emotionExpression: {},
    constraints: unique(character.profile.boundaries ?? []),
    speechDirectives: { acknowledgeEmotion: false, preserveRelationship: true },
    confidence: 0.25,
  };
}

/**
 * 根据评价和角色状态选择表达策略。该函数不生成自然语言，也不修改 Snapshot。
 */
export function planBehavior(input: BehaviorPlannerInput): BehaviorPlan {
  const event = input.event ?? latestEvent(input.snapshot);
  if (!event) return emptyPlan(input.snapshot.character);
  const appraisal = input.appraisal ?? evaluateAppraisal({ snapshot: input.snapshot, event });
  const character = input.snapshot.character;
  const relationship = event.targetId
    ? character.relationships.find((item) => item.targetId === event.targetId)
    : undefined;
  const attitude = event.targetId
    ? character.attitudes.find((item) => item.targetId === event.targetId)
    : undefined;
  const closeness = relationship?.closeness ?? 0;
  const positive = hasPositiveEventSignal(event);
  const activeGoal = [...character.goals]
    .filter((goal) => goal.active)
    .sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key))[0];

  let strategy = 'calm_engagement';
  let goal = activeGoal && appraisal.goalRelevance >= 0.4 ? activeGoal.description : '理解当前事件并保持交流连贯';
  if (appraisal.betrayal >= 0.6 || appraisal.valueViolation >= 0.7) {
    strategy = closeness >= 0.45 ? 'gentle_confrontation' : 'firm_boundary';
    goal = closeness >= 0.45 ? '表达失望，同时维护关系' : '明确表达边界并保护自身';
  } else if (appraisal.threat >= 0.65) {
    strategy = 'protective_boundary';
    goal = '先确认安全和事实，再决定是否继续互动';
  } else if (appraisal.loss >= 0.6) {
    strategy = 'supportive_reassurance';
    goal = closeness >= 0.35 ? '承认失落并维持可继续的联系' : '平稳回应离别或变化';
  } else if (appraisal.surprise >= 0.65) {
    strategy = 'curious_clarification';
    goal = '澄清意图和事实，减少误解';
  } else if (positive) {
    strategy = 'warm_engagement';
    goal = activeGoal && appraisal.goalRelevance >= 0.4 ? activeGoal.description : '回应积极信号并延续互动';
  }

  const traitAssertiveness = traitValue(character, ['assertiveness', 'confidence', 'independence'], 0.45);
  const traitWarmth = traitValue(character, ['warmth', 'empathy', 'attachment'], 0.5);
  const assertiveness = clamp(
    traitAssertiveness * 0.55 +
      appraisal.threat * 0.2 +
      appraisal.valueViolation * 0.15 +
      appraisal.betrayal * 0.1
  );
  const warmth = clamp(
    traitWarmth * 0.45 +
      closeness * 0.3 +
      (attitude?.liking ?? 0) * 0.15 +
      (positive ? 0.1 : 0) -
      appraisal.betrayal * 0.18 -
      appraisal.threat * 0.12
  );
  const directness = clamp(
    assertiveness * 0.55 +
      appraisal.socialSignificance * 0.15 +
      appraisal.threat * 0.15 +
      appraisal.valueViolation * 0.15
  );
  const constraints = unique([
    ...(character.profile.boundaries ?? []),
    ...(strategy === 'gentle_confrontation' ? ['避免升级冲突'] : []),
    ...(strategy === 'protective_boundary' || strategy === 'firm_boundary' ? ['先确认事实再下结论'] : []),
  ]);
  const emotionExpression = currentEmotionExpression(input.snapshot, appraisal);
  const confidence = clamp(0.35 + appraisal.impact * 0.35 + appraisal.socialSignificance * 0.15 + (event.targetId ? 0.1 : 0));
  return {
    goal,
    strategy,
    assertiveness,
    warmth,
    directness,
    emotionExpression,
    constraints,
    speechDirectives: {
      acknowledgeEmotion: Object.keys(emotionExpression).length > 0,
      askClarifyingQuestion: strategy === 'curious_clarification' || strategy === 'protective_boundary',
      preserveRelationship: closeness >= 0.35 && strategy !== 'firm_boundary',
      avoidEscalation: strategy === 'gentle_confrontation' || strategy === 'supportive_reassurance',
      useShortSentences: appraisal.threat >= 0.55,
      memoryCount: input.memories?.length ?? 0,
    },
    confidence,
  };
}

export function createBehaviorPlanner(): { plan(input: BehaviorPlannerInput): BehaviorPlan } {
  return { plan: planBehavior };
}

