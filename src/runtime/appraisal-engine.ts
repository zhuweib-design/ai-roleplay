import { clamp } from './emotion-engine';
import type {
  AppraisalResult,
  AttitudeState,
  CharacterDefinition,
  DomainEvent,
  EventEffects,
  RelationshipState,
  RuntimeSnapshot,
} from './types';

export interface AppraisalInput {
  snapshot: RuntimeSnapshot;
  event: DomainEvent;
}

type SignalName =
  | 'goalRelevance'
  | 'valueViolation'
  | 'betrayal'
  | 'threat'
  | 'loss'
  | 'socialSignificance'
  | 'surprise'
  | 'targetSalience';

const SIGNAL_KEYS: Record<SignalName, string[]> = {
  goalRelevance: ['goalRelevance', 'goal_relevance', 'goal'],
  valueViolation: ['valueViolation', 'value_violation', 'principleViolation', 'principle_violation'],
  betrayal: ['betrayal', 'betrayed'],
  threat: ['threat', 'danger'],
  loss: ['loss', 'grief'],
  socialSignificance: ['socialSignificance', 'social_significance'],
  surprise: ['surprise', 'novelty', 'unexpected'],
  targetSalience: ['targetSalience', 'target_salience', 'salience'],
};

const BETRAYAL_TERMS = ['betray', 'betrayed', 'deceiv', 'promise_broken', 'backstab', '背叛', '出卖', '欺骗', '失约', '背弃'];
const THREAT_TERMS = ['threat', 'danger', 'attack', 'conflict', 'insult', 'harm', '威胁', '危险', '攻击', '冲突', '辱骂', '伤害'];
const LOSS_TERMS = ['loss', 'lost', 'leave', 'leaving', 'goodbye', 'cancel', 'death', '失去', '离开', '告别', '取消', '死亡', '丢失'];
const SOCIAL_TERMS = ['promise', 'relationship', 'friend', 'romantic', 'group', 'conversation', 'invite', 'reject', '承诺', '关系', '朋友', '恋', '群聊', '对话', '邀请', '拒绝'];
const POSITIVE_TERMS = ['praise', 'success', 'welcome', 'thanks', 'reward', 'help', 'compliment', '夸奖', '表扬', '成功', '欢迎', '感谢', '奖励', '帮助', '赞美'];
const NEGATIVE_TERMS = [...BETRAYAL_TERMS, ...THREAT_TERMS, ...LOSS_TERMS, 'lie', 'break', 'violate', '拒绝', '撒谎', '违背'];

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function appraisalPayload(event: DomainEvent): Record<string, unknown> {
  const payload = event.payload ?? {};
  const nested = objectValue(payload.appraisal) ?? objectValue(payload.appraisalSignals);
  return nested ? { ...payload, ...nested } : payload;
}

function readNumber(payload: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return clamp(value);
    const nested = objectValue(value);
    if (nested && typeof nested.score === 'number' && Number.isFinite(nested.score)) return clamp(nested.score);
  }
  return undefined;
}

function readBoolean(payload: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function flattenText(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  const object = objectValue(value);
  if (!object) return [];
  return Object.entries(object)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, item]) => [key, ...flattenText(item)]);
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\u3000]+/g, '');
}

function containsTerm(text: string, terms: string[]): boolean {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function traitValue(character: CharacterDefinition, aliases: string[], fallback: number): number {
  const names = aliases.map((alias) => normalizeText(alias));
  const trait = character.traits.find((item) => names.includes(normalizeText(item.key)));
  return trait ? clamp(trait.value) : fallback;
}

function activeGoalRelevance(character: CharacterDefinition, text: string): number {
  const activeGoals = character.goals.filter((goal) => goal.active);
  if (activeGoals.length === 0) return 0.25;
  let best = 0;
  for (const goal of activeGoals) {
    const goalText = normalizeText(`${goal.key} ${goal.description}`);
    const matched = goalText.length > 0 && (normalizeText(text).includes(goalText) || normalizeText(text).includes(normalizeText(goal.key)));
    if (matched) best = Math.max(best, clamp(goal.priority));
  }
  return best > 0 ? clamp(0.25 + best * 0.75) : 0.15;
}

function valueViolation(character: CharacterDefinition, text: string, negativeSignal: boolean): number {
  if (character.values.length === 0) return negativeSignal ? 0.45 : 0.15;
  const normalized = normalizeText(text);
  const matched = character.values
    .filter((value) => normalized.includes(normalizeText(value.key)) || normalized.includes(normalizeText(value.key.replace(/[_-]/g, ' '))))
    .reduce((max, value) => Math.max(max, clamp(value.importance)), 0);
  if (matched > 0) return clamp(matched * (negativeSignal ? 1 : 0.35));
  return negativeSignal ? 0.45 : 0.15;
}

function targetState(snapshot: RuntimeSnapshot, event: DomainEvent): {
  attitude?: AttitudeState;
  relationship?: RelationshipState;
} {
  if (!event.targetId) return {};
  return {
    attitude: snapshot.character.attitudes.find((item) => item.targetId === event.targetId),
    relationship: snapshot.character.relationships.find((item) => item.targetId === event.targetId),
  };
}

function scoreSignal(
  payload: Record<string, unknown>,
  name: SignalName,
  fallback: number
): number {
  return readNumber(payload, SIGNAL_KEYS[name]) ?? fallback;
}

function reason(reasons: string[], condition: boolean, text: string): void {
  if (condition) reasons.push(text);
}

export function hasPositiveEventSignal(event: DomainEvent): boolean {
  const text = [event.eventType, event.topic ?? '', ...flattenText(event.payload)].join(' ');
  return containsTerm(text, POSITIVE_TERMS);
}

/**
 * 对事件做确定性评价。该函数只读 Snapshot，不调用模型，也不修改状态，便于 Replay。
 */
export function evaluateAppraisal(input: AppraisalInput): AppraisalResult {
  const { snapshot, event } = input;
  const payload = appraisalPayload(event);
  const text = [event.eventType, event.topic ?? '', ...flattenText(event.payload)].join(' ');
  const { attitude, relationship } = targetState(snapshot, event);
  const negativeSignal = containsTerm(text, NEGATIVE_TERMS);
  const betrayalSignal = containsTerm(text, BETRAYAL_TERMS);
  const threatSignal = containsTerm(text, THREAT_TERMS);
  const lossSignal = containsTerm(text, LOSS_TERMS);
  const socialSignal = containsTerm(text, SOCIAL_TERMS);

  const targetSalience = scoreSignal(
    payload,
    'targetSalience',
    event.targetId
      ? clamp(Math.max(attitude?.salience ?? 0, relationship?.closeness ?? 0, Math.min(1, (attitude?.evidenceCount ?? 0) / 10)))
      : 0
  );
  const relationshipRelevance = event.targetId
    ? clamp(Math.max(0.2, relationship?.closeness ?? 0, attitude?.salience ?? 0))
    : 0.2;
  const goalRelevance = scoreSignal(payload, 'goalRelevance', activeGoalRelevance(snapshot.character, text));
  const valueViolationScore = scoreSignal(payload, 'valueViolation', valueViolation(snapshot.character, text, negativeSignal));
  const betrayal = scoreSignal(payload, 'betrayal', betrayalSignal ? clamp(0.65 + valueViolationScore * 0.25 + relationshipRelevance * 0.1) : 0);
  const threat = scoreSignal(payload, 'threat', threatSignal ? clamp(0.6 + event.importance * 0.25) : 0);
  const loss = scoreSignal(payload, 'loss', lossSignal ? clamp(0.55 + event.importance * 0.3) : 0);
  const socialSignificance = scoreSignal(
    payload,
    'socialSignificance',
    event.targetId ? clamp(0.25 + relationshipRelevance * 0.5 + (socialSignal ? 0.25 : 0)) : socialSignal ? 0.35 : 0
  );
  const unexpected = readBoolean(payload, ['unexpected', 'isUnexpected']);
  const historicalTypeCount = snapshot.events.filter((item) => item.eventType === event.eventType).length;
  const surprise = scoreSignal(
    payload,
    'surprise',
    unexpected === true ? 0.8 : unexpected === false ? 0.1 : historicalTypeCount === 0 ? 0.45 : 0.15
  );
  const sensitivity = traitValue(snapshot.character, ['sensitivity', 'emotionality', 'reactivity'], 0.5);
  const importance = clamp(event.importance);
  const impact = clamp(
    importance *
      (0.4 + sensitivity * 0.6) *
      (0.35 + relationshipRelevance * 0.65) *
      (0.35 + goalRelevance * 0.65) *
      (0.35 + valueViolationScore * 0.65)
  );
  const reasons: string[] = [];
  reason(reasons, importance >= 0.65, `事件重要性较高（${importance.toFixed(2)}）`);
  reason(reasons, goalRelevance >= 0.5, '事件与角色当前目标相关');
  reason(reasons, valueViolationScore >= 0.5, '事件触及角色重视的价值');
  reason(reasons, betrayal >= 0.5, '事件包含背叛或失约信号');
  reason(reasons, threat >= 0.5, '事件包含威胁或伤害信号');
  reason(reasons, loss >= 0.5, '事件包含失去或离别信号');
  reason(reasons, targetSalience >= 0.5, '目标对象在角色状态中具有较高显著性');
  reason(reasons, surprise >= 0.5, '事件相对既有经历较为意外');
  if (reasons.length === 0) reasons.push(`事件影响有限（${impact.toFixed(2)}）`);

  return {
    importance,
    goalRelevance,
    valueViolation: valueViolationScore,
    betrayal,
    threat,
    loss,
    socialSignificance,
    surprise,
    targetSalience,
    impact,
    reasons,
  };
}

function addEmotionDelta(target: Record<string, number>, key: string, value: number): void {
  if (value > 0.03) target[key] = clamp(value);
}

/** 将评价结果转换成缺省事件影响；显式 effects 始终优先，兼容旧事件。 */
export function deriveAppraisalEffects(event: DomainEvent, appraisal: AppraisalResult): EventEffects {
  const existing = event.effects ?? {};
  const next: EventEffects = { ...existing };
  if (!existing.emotionDeltas || Object.keys(existing.emotionDeltas).length === 0) {
    const emotions: Record<string, number> = {};
    const scale = clamp(appraisal.impact * 1.25);
    addEmotionDelta(emotions, 'anger', scale * (appraisal.betrayal * 0.65 + appraisal.valueViolation * 0.35 + appraisal.threat * 0.2));
    addEmotionDelta(emotions, 'fear', scale * appraisal.threat * 0.7);
    addEmotionDelta(emotions, 'sadness', scale * appraisal.loss * 0.75);
    if (hasPositiveEventSignal(event)) addEmotionDelta(emotions, 'joy', scale * 0.65);
    if (appraisal.surprise > 0.55) addEmotionDelta(emotions, 'surprise', scale * appraisal.surprise * 0.7);
    if (Object.keys(emotions).length > 0) next.emotionDeltas = emotions;
  }
  if (event.targetId && !existing.attitudeDelta && (appraisal.betrayal > 0.35 || appraisal.valueViolation > 0.55 || appraisal.loss > 0.55)) {
    next.attitudeDelta = {
      liking: -clamp(appraisal.betrayal * 0.35 + appraisal.valueViolation * 0.2 + appraisal.loss * 0.1),
      salience: clamp(0.2 + appraisal.targetSalience * 0.35),
      confidence: clamp(0.05 + appraisal.impact * 0.2),
    };
  }
  if (event.targetId && !existing.relationshipDelta && appraisal.betrayal > 0.5) {
    next.relationshipDelta = {
      dimensions: { trust: -clamp(appraisal.betrayal * 0.25) },
      closeness: -clamp(appraisal.betrayal * 0.12),
    };
  }
  if (!existing.moodDelta && (appraisal.threat > 0.45 || appraisal.surprise > 0.55 || appraisal.loss > 0.55)) {
    next.moodDelta = {
      arousal: clamp(Math.max(appraisal.threat, appraisal.surprise) * 0.25),
      dominance: -clamp(appraisal.threat * 0.15 + appraisal.loss * 0.1),
    };
  }
  return next;
}

export function createAppraisalEngine(): { evaluate(input: AppraisalInput): AppraisalResult } {
  return { evaluate: evaluateAppraisal };
}
