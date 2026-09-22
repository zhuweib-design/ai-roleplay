import { describe, expect, it } from 'vitest';
import {
  CharacterCompileError,
  InMemoryRuntimeStore,
  RuntimeApiAdapter,
  SnapshotRuntimeStore,
  RuntimeCore,
  PostgresRuntimeStore,
  OptimisticLockError,
  replayRuntimeEvents,
  computeSalience,
  decayTowardsBaseline,
  handleRuntimeRequest,
  type RuntimeSnapshot,
  type RuntimeSnapshotStore,
  type SqlExecutor,
  type DomainEvent,
  type StateChange,
} from '@/runtime';

describe('Virtual Character OS Runtime Core', () => {
  function createCore() {
    const store = new InMemoryRuntimeStore();
    const core = new RuntimeCore(store);
    return { core, store };
  }

  it('按 Archetype + Delta + Seed Memories 编译角色', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      archetype: {
        id: 'reserved',
        name: '克制型',
        profile: { displayName: '默认名', speakingStyle: '简短克制' },
        traits: [{ key: 'sensitivity', value: 0.4, locked: true }],
        defaultEmotions: [{ emotion: 'calm', intensity: 0.2 }],
      },
      delta: {
        profile: { displayName: '林澈' },
        traits: [{ key: 'sensitivity', value: 0.8 }],
      },
      seedMemories: [{ type: 'semantic', content: '曾经在雨夜救过一只猫', importance: 0.8 }],
      now: '2026-09-22T00:00:00.000Z',
    });

    expect(character.profile.displayName).toBe('林澈');
    expect(character.traits).toEqual([{ key: 'sensitivity', value: 0.8, locked: true }]);
    expect(character.seedMemories).toHaveLength(1);
    expect(character.version).toBe(0);
  });

  it('拒绝没有名称的角色包', async () => {
    const { core } = createCore();
    await expect(
      core.createCharacter({ tenantId: 'tenant-a', profile: { displayName: '  ' } })
    ).rejects.toBeInstanceOf(CharacterCompileError);
  });

  it('使用 Lazy Half-Life Decay 回到基线', () => {
    expect(decayTowardsBaseline(1, 0, 100, 100)).toBeCloseTo(0.5);
    expect(decayTowardsBaseline(0.8, 0.2, 100, 100)).toBeCloseTo(0.5);
  });

  it('处理事件、状态变化、记忆和 Episode', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '林澈' },
      now: '2026-09-22T00:00:00.000Z',
    });

    const result = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'promise_broken',
      targetId: 'alice',
      topic: '约会冲突',
      importance: 0.9,
      occurredAt: '2026-09-22T00:01:00.000Z',
      effects: {
        emotionDeltas: { anger: 0.82 },
        attitudeDelta: { liking: -0.2, salience: 0.3 },
        relationshipDelta: { dimensions: { trust: -0.25 }, closeness: 0.1 },
        memory: { type: 'episodic', content: 'Alice 再次违背了承诺', importance: 0.9 },
      },
    });

    expect(result.snapshot.version).toBe(1);
    expect(result.stateChange.stateVersion).toBe(1);
    expect(result.snapshot.character.emotions.find((item) => item.emotion === 'anger')?.intensity).toBeCloseTo(0.82);
    expect(result.snapshot.character.attitudes[0]?.liking).toBeCloseTo(0);
    expect(result.snapshot.memories[0]?.sourceEventId).toBe(result.event.id);
    expect(result.changedEpisode?.status).toBe('active');
  });

  it('支持 Episode 的 cooling、dormant 和 reopened 生命周期', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '林澈' },
      now: '2026-09-22T00:00:00.000Z',
    });

    const first = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'conflict',
      targetId: 'alice',
      importance: 0.9,
      occurredAt: '2026-09-22T00:00:00.000Z',
      effects: { emotionDeltas: { anger: 0.9 } },
    });
    const cooling = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'silence',
      targetId: 'alice',
      importance: 0.1,
      occurredAt: '2026-09-22T02:00:00.000Z',
    });
    expect(cooling.changedEpisode?.status).toBe('cooling');

    const dormant = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'ordinary_day',
      targetId: 'alice',
      importance: 0.1,
      occurredAt: '2026-09-22T04:00:00.000Z',
    });
    expect(dormant.changedEpisode?.status).toBe('dormant');

    const reopened = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'new_trigger',
      targetId: 'alice',
      importance: 0.9,
      occurredAt: '2026-09-22T05:00:00.000Z',
      effects: { emotionDeltas: { anger: 0.8 } },
    });
    expect(reopened.changedEpisode?.status).toBe('reopened');
    expect(first.snapshot.episodes[0]?.unresolved).toBe(true);
  });

  it('Salience 与喜欢、信任、亲密度保持独立', () => {
    expect(
      computeSalience({
        interaction: 0.1,
        emotionalImpact: 0.9,
        eventImportance: 0.9,
        relationshipRelevance: 0.1,
        recency: 1,
      })
    ).toBeGreaterThan(0.4);
  });


  it('可以通过现有 StorageAdapter 的快照接口持久化 Runtime Snapshot', async () => {
    const snapshots = new Map<string, unknown>();
    const storage = {
      async saveSnapshot(key: string, value: unknown) {
        snapshots.set(key, value);
      },
      async loadSnapshot<T>(key: string): Promise<T | null> {
        return (snapshots.get(key) as T | undefined) ?? null;
      },
    } as never;
    const store = new SnapshotRuntimeStore(storage);
    const core = new RuntimeCore(store);
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      id: 'persisted-character',
      profile: { displayName: '可持久化角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const loaded = await core.getSnapshot(character.id);
    expect(loaded?.character.profile.displayName).toBe('可持久化角色');
    expect(snapshots.size).toBe(1);
  });

  it('可以从事件流确定性 Replay 出相同的 Runtime State', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: 'Replay 角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const initial = await core.getSnapshot(character.id);
    expect(initial).not.toBeNull();

    const first = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'praise',
      importance: 0.8,
      occurredAt: '2026-09-22T00:01:00.000Z',
      effects: { emotionDeltas: { joy: 0.6 } },
    });
    const second = await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'insult',
      importance: 0.8,
      occurredAt: '2026-09-22T00:02:00.000Z',
      effects: { emotionDeltas: { anger: 0.7 } },
    });
    const replayed = replayRuntimeEvents(
      { ...initial!, version: 0, events: [], stateChanges: [], episodes: [], memories: [] },
      [first.event, second.event]
    );
    expect(replayed.character.emotions).toEqual(second.snapshot.character.emotions);
    expect(replayed.version).toBe(second.snapshot.version);
  });

  it('Replay 按发生时间排序，并为派生审计实体保持稳定 ID', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '有序 Replay 角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const initial = await core.getSnapshot(character.id);
    expect(initial).not.toBeNull();

    const early: DomainEvent = {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'promise',
      importance: 0.8,
      payload: {},
      occurredAt: '2026-09-22T00:01:00.000Z',
      effects: {
        emotionDeltas: { joy: 0.4 },
        memory: { type: 'episodic', content: '曾经许下承诺', importance: 0.8 },
      },
    };
    const late: DomainEvent = {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'betrayal',
      importance: 0.9,
      payload: {},
      occurredAt: '2026-09-22T00:02:00.000Z',
      effects: { emotionDeltas: { anger: 0.7 } },
    };
    const cleanInitial = structuredClone(initial!);
    const chronological = replayRuntimeEvents(cleanInitial, [early, late]);
    const reversed = replayRuntimeEvents(structuredClone(initial!), [late, early]);

    expect(reversed).toEqual(chronological);
    expect(reversed.events.map((event) => event.id)).toEqual([early.id, late.id]);
    expect(reversed.stateChanges.map((change) => change.id)).toEqual(
      chronological.stateChanges.map((change) => change.id)
    );
    expect(reversed.memories.map((memory) => memory.id)).toEqual(
      chronological.memories.map((memory) => memory.id)
    );
  });

  it('事件写入支持乐观锁冲突重试与稳定 eventId 幂等', async () => {
    const inner = new InMemoryRuntimeStore();
    let failNextCommit = false;
    const store: RuntimeSnapshotStore = {
      load: (characterId) => inner.load(characterId),
      commit: async (snapshot, expectedVersion) => {
        if (failNextCommit) {
          failNextCommit = false;
          throw new OptimisticLockError(snapshot.character.id, expectedVersion, expectedVersion + 1);
        }
        await inner.commit(snapshot, expectedVersion);
      },
    };
    const core = new RuntimeCore(store, { maxCommitRetries: 1 });
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '幂等角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const input = {
      eventId: '55555555-5555-4555-8555-555555555555',
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'greeting',
      importance: 0.5,
      occurredAt: '2026-09-22T00:01:00.000Z',
      effects: { memory: { type: 'semantic' as const, content: '用户主动问候' } },
    };

    failNextCommit = true;
    const first = await core.ingestEvent(input);
    const duplicate = await core.ingestEvent(input);
    const retryWithoutGeneratedTimestamp = await core.ingestEvent({ ...input, occurredAt: undefined });

    expect(first.snapshot.version).toBe(1);
    expect(duplicate.snapshot).toEqual(first.snapshot);
    expect(retryWithoutGeneratedTimestamp.snapshot).toEqual(first.snapshot);
    expect(duplicate.event.id).toBe(input.eventId);
    expect(duplicate.snapshot.events).toHaveLength(1);
    expect(duplicate.snapshot.memories).toHaveLength(1);
  });

  it('PostgresRuntimeStore 使用事务、版本锁和审计记录', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const characterId = '22222222-2222-4222-8222-222222222222';
    let persisted: RuntimeSnapshot | null = null;
    let version = 0;
    const queries: string[] = [];
    const fakeSql: SqlExecutor = {
      async query<Row = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
        queries.push(text);
        if (text.includes('SELECT state_version')) {
          return { rows: [{ state_version: version }] as Row[], rowCount: 1 };
        }
        if (text.includes('SELECT s.state')) {
          return { rows: persisted ? [{ state: persisted, event_sequence: persisted.version }] as Row[] : [], rowCount: persisted ? 1 : 0 };
        }
        if (text.includes('SELECT state, event_sequence')) {
          return { rows: persisted ? [{ state: persisted, event_sequence: persisted.version }] as Row[] : [], rowCount: persisted ? 1 : 0 };
        }
        if (text.includes('INSERT INTO state_snapshots')) {
          persisted = JSON.parse(String(params[2])) as RuntimeSnapshot;
          version = persisted.version;
        }
        if (text.includes('UPDATE characters')) version = Number(params[2]);
        return { rows: [] as Row[], rowCount: 1 };
      },
      async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        return work(fakeSql);
      },
    };
    const store = new PostgresRuntimeStore(fakeSql, tenantId);
    const character = await coreCompilerCharacter(tenantId, characterId);
    const initial: RuntimeSnapshot = {
      character,
      events: [],
      stateChanges: [],
      memories: [],
      episodes: [],
      version: 0,
      updatedAt: character.updatedAt,
    };
    await store.initialize(initial);
    const event: DomainEvent = {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId,
      characterId,
      eventType: 'praise',
      importance: 0.8,
      payload: {},
      occurredAt: '2026-09-22T00:01:00.000Z',
    };
    const stateChange: StateChange = {
      id: '44444444-4444-4444-8444-444444444444',
      eventId: event.id,
      characterId,
      occurredAt: event.occurredAt,
      stateVersion: 1,
      stateType: 'runtime',
      dimension: 'projection',
      delta: 0,
      changes: {},
    };
    const next = { ...initial, events: [event], stateChanges: [stateChange], version: 1, updatedAt: event.occurredAt };
    await store.commit(next, 0);
    expect(await store.load(characterId)).toEqual(next);
    expect(queries.some((query) => query.includes('FOR UPDATE'))).toBe(true);
    expect(queries.some((query) => query.includes('state_audit_logs'))).toBe(true);
    await expect(store.commit(next, 0)).rejects.toBeInstanceOf(Error);
  });
  it('API 基线可创建角色、接收事件并构建上下文', async () => {
    const { core } = createCore();
    const api = new RuntimeApiAdapter(core);
    const health = await handleRuntimeRequest(api, { method: 'GET', path: '/v1/runtime/health' });
    expect(health).toEqual({
      status: 200,
      body: { ok: true, service: 'virtual-character-runtime', version: 'v1' },
    });

    const created = await handleRuntimeRequest(api, {
      method: 'POST',
      path: '/v1/runtime/characters',
      body: { tenantId: 'tenant-a', profile: { displayName: '林澈' } },
    });
    expect(created.status).toBe(201);
    const snapshot = created.body as RuntimeSnapshot;

    const event = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${snapshot.character.id}/events`,
      body: {
        tenantId: 'tenant-a',
        eventType: 'greeting',
        importance: 0.5,
        effects: { memory: { type: 'semantic', content: '用户今天主动问候' } },
      },
    });
    expect(event.status).toBe(200);

    const context = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${snapshot.character.id}/context`,
      body: { query: '问候' },
    });
    expect(context.status).toBe(200);
    expect((context.body as { relevantMemories: unknown[] }).relevantMemories).toHaveLength(1);
  });
});




async function coreCompilerCharacter(tenantId: string, id: string) {
  const { compileCharacter } = await import('@/runtime');
  return compileCharacter({ tenantId, id, profile: { displayName: 'Postgres 角色' }, now: '2026-09-22T00:00:00.000Z' });
}



