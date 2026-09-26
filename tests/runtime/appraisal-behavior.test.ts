import { describe, expect, it } from 'vitest';
import {
  compileCharacter,
  createRuntimeSnapshot,
  decayAttitude,
  decayRelationship,
  evaluateAppraisal,
  planBehavior,
  reduceRuntimeState,
  replayRuntimeEvents,
  type DomainEvent,
} from '@/runtime';

function makeSnapshot() {
  const character = compileCharacter({
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-a',
    profile: { displayName: '林澈', boundaries: ['不辱骂'] },
    delta: {
      traits: [
        { key: 'sensitivity', value: 0.8 },
        { key: 'warmth', value: 0.7 },
      ],
      values: [{ key: 'honesty', importance: 0.9 }],
      goals: [{ key: 'trust', description: '维护彼此信任', priority: 0.8, active: true }],
    },
    now: '2026-09-22T00:00:00.000Z',
  });
  return {
    ...createRuntimeSnapshot(character),
    character: {
      ...character,
      attitudes: [{ targetId: 'alice', liking: 0.8, salience: 0.9, confidence: 0.8, evidenceCount: 3, updatedAt: character.updatedAt }],
      relationships: [{ targetId: 'alice', dimensions: { trust: 0.8 }, closeness: 0.8, updatedAt: character.updatedAt }],
    },
  };
}

function makeEvent(snapshot: ReturnType<typeof makeSnapshot>): DomainEvent {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: snapshot.character.tenantId,
    characterId: snapshot.character.id,
    targetId: 'alice',
    eventType: 'promise_broken',
    topic: 'honesty violation',
    importance: 0.9,
    payload: {},
    occurredAt: '2026-09-22T00:01:00.000Z',
  };
}

describe('Appraisal Engine 与 Behavior Planner', () => {
  it('同一角色和事件得到确定性的评价，并识别关系显著性与价值冲突', () => {
    const snapshot = makeSnapshot();
    const event = makeEvent(snapshot);
    const first = evaluateAppraisal({ snapshot, event });
    const second = evaluateAppraisal({ snapshot, event });

    expect(second).toEqual(first);
    expect(first.importance).toBe(0.9);
    expect(first.valueViolation).toBeGreaterThan(0.5);
    expect(first.betrayal).toBeGreaterThan(0.6);
    expect(first.targetSalience).toBeGreaterThan(0.5);
    expect(first.socialSignificance).toBeGreaterThan(0.5);
    expect(first.impact).toBeGreaterThan(0.2);
    expect(first.reasons.length).toBeGreaterThan(0);
  });

  it('高背叛事件选择维护关系的温和对抗策略并继承边界', () => {
    const snapshot = makeSnapshot();
    const event = makeEvent(snapshot);
    const appraisal = evaluateAppraisal({ snapshot, event });
    const plan = planBehavior({ snapshot, event, appraisal });

    expect(plan.strategy).toBe('gentle_confrontation');
    expect(plan.goal).toContain('维护关系');
    expect(plan.constraints).toContain('不辱骂');
    expect(plan.constraints).toContain('避免升级冲突');
    expect(plan.speechDirectives).toMatchObject({ preserveRelationship: true, avoidEscalation: true });
    expect(plan.confidence).toBeGreaterThan(0.3);
  });

  it('没有事件时提供中性降级计划，不修改快照', () => {
    const snapshot = makeSnapshot();
    const before = structuredClone(snapshot);
    const plan = planBehavior({ snapshot });

    expect(plan.strategy).toBe('neutral_response');
    expect(plan.confidence).toBe(0.25);
    expect(snapshot).toEqual(before);
  });

  it('评价结果进入归约审计，缺省影响可 Replay 得到相同状态', () => {
    const initial = makeSnapshot();
    const event = makeEvent(initial);
    const result = reduceRuntimeState(initial, event);
    const replayed = replayRuntimeEvents(makeSnapshot(), [result.event]);

    expect(result.appraisal?.betrayal).toBeGreaterThan(0.6);
    expect(result.behaviorPlan?.strategy).toBe('gentle_confrontation');
    expect(result.stateChange.changes.appraisal).toEqual(result.appraisal);
    expect(result.snapshot.character.emotions.find((emotion) => emotion.emotion === 'anger')?.intensity).toBeGreaterThan(0);
    expect(result.snapshot.character.relationships[0]?.dimensions.trust).toBeLessThan(0.8);
    expect(replayed).toEqual(result.snapshot);
  });

  it('长期态度和关系只在显式配置 half-life 时惰性衰减', () => {
    const attitude = decayAttitude({
      targetId: 'alice',
      liking: 1,
      salience: 1,
      confidence: 1,
      evidenceCount: 1,
      halfLifeSeconds: 100,
      updatedAt: '2026-09-22T00:00:00.000Z',
    }, '2026-09-22T00:01:40.000Z');
    const relationship = decayRelationship({
      targetId: 'alice',
      dimensions: { trust: 1 },
      closeness: 1,
      halfLifeSeconds: 100,
      updatedAt: '2026-09-22T00:00:00.000Z',
    }, '2026-09-22T00:01:40.000Z');
    const legacy = decayAttitude({
      targetId: 'alice', liking: 1, salience: 1, confidence: 1, evidenceCount: 1,
      updatedAt: '2026-09-22T00:00:00.000Z',
    }, '2026-09-23T00:00:00.000Z');

    expect(attitude.liking).toBeCloseTo(0.5);
    expect(relationship.dimensions.trust).toBeCloseTo(0.5);
    expect(relationship.closeness).toBeCloseTo(0.5);
    expect(legacy.liking).toBe(1);
  });
});

