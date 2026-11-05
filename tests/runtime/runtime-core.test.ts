import { describe, expect, it } from 'vitest';
// PostgresRuntimeStore / SqlExecutor 属服务端专用模块，barrel 已不再转导出它们，
// 改从 runtime/server 导入（这条边界由 tests/tooling/runtime-entry-boundary.test.ts 守着）
import { PostgresRuntimeStore, type SqlExecutor } from '@/runtime/server';
import {
  CharacterCompileError,
  InMemoryRuntimeStore,
  RuntimeApiAdapter,
  SnapshotRuntimeStore,
  RuntimeCore,
  RuntimeAlreadyExistsError,
  OptimisticLockError,
  replayRuntimeEvents,
  stableChatTargetId,
  stableChatConversationTurnIds,
  RuntimeConflictError,
  computeSalience,
  decayTowardsBaseline,
  handleRuntimeRequest,
  type RuntimeSnapshot,
  type RuntimeSnapshotStore,
  type DomainEvent,
  type StateChange,
  type Episode,
  type MemoryRecord,
} from '@/runtime';

describe('Virtual Character OS Runtime Core', () => {
  it('Chat Target ID 会从 UI 标识稳定映射为 UUID', () => {
    const first = stableChatTargetId('tenant-a', 'ui-character-1');
    const second = stableChatTargetId('tenant-a', 'ui-character-1');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

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

  it('跨 Runtime Core 并发初始化同一角色时把竞态转换为已存在冲突', async () => {
    const inner = new InMemoryRuntimeStore();
    let release!: () => void;
    const bothLoaded = new Promise<void>((resolve) => { release = resolve; });
    let initialLoads = 0;
    const store: RuntimeSnapshotStore = {
      load: async (characterId) => {
        if (initialLoads < 2) {
          initialLoads += 1;
          if (initialLoads === 2) release();
          await bothLoaded;
          return null;
        }
        return inner.load(characterId);
      },
      commit: (snapshot, expectedVersion) => inner.commit(snapshot, expectedVersion),
      initialize: (snapshot) => inner.initialize(snapshot),
    };
    const input = {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: 'tenant-a',
      profile: { displayName: '并发初始化角色' },
      now: '2026-09-22T00:00:00.000Z',
    };
    const results = await Promise.allSettled([
      new RuntimeCore(store).createCharacter(input),
      new RuntimeCore(store).createCharacter(input),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: new RuntimeAlreadyExistsError(input.id) });
    expect((await inner.load(input.id))?.character.id).toBe(input.id);
  });

  it('内存存储拒绝再次初始化及版本 0 覆盖', async () => {
    const store = new InMemoryRuntimeStore();
    const core = new RuntimeCore(store);
    const character = await core.createCharacter({
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: 'tenant-a',
      profile: { displayName: '原始角色' },
    });
    const snapshot = (await store.load(character.id))!;
    const replacement = {
      ...snapshot,
      character: { ...snapshot.character, profile: { displayName: '被覆盖' } },
    };
    await expect(store.initialize(replacement)).rejects.toBeInstanceOf(RuntimeAlreadyExistsError);
    await expect(store.commit(replacement, 0)).rejects.toBeInstanceOf(RuntimeAlreadyExistsError);
    expect((await store.load(character.id))?.character.profile.displayName).toBe('原始角色');
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

  it('Context Builder 会按 targetId 和 query 过滤最近事件', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '上下文角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'conversation_turn',
      targetId: 'alice',
      payload: { userMessage: '讨论森林计划' },
      occurredAt: '2026-09-22T00:01:00.000Z',
    });
    await core.ingestEvent({
      tenantId: 'tenant-a',
      characterId: character.id,
      eventType: 'conversation_turn',
      targetId: 'bob',
      payload: { userMessage: '讨论城市计划' },
      occurredAt: '2026-09-22T00:02:00.000Z',
    });

    const context = await core.buildContext(character.id, { targetId: 'alice', query: '森林' });
    expect(context.recentEvents).toHaveLength(1);
    expect(context.recentEvents[0]?.targetId).toBe('alice');
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
      async listSnapshotsByPrefix<T>(prefix: string): Promise<T[]> {
        return [...snapshots.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T);
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
    const reopened = new RuntimeCore(new SnapshotRuntimeStore(storage));
    expect((await reopened.listCharacters({ tenantId: 'tenant-a' })).items.map((item) => item.id)).toEqual([character.id]);
    expect((await reopened.listCharacters({ tenantId: 'tenant-b' })).items).toEqual([]);
  });

  it('两个本地快照 Store 共享适配器时不能并发覆盖初始化', async () => {
    const snapshots = new Map<string, unknown>();
    let release!: () => void;
    const bothLoaded = new Promise<void>((resolve) => { release = resolve; });
    let initialLoads = 0;
    const storage = {
      async saveSnapshot(key: string, value: unknown) {
        snapshots.set(key, value);
      },
      async loadSnapshot<T>(key: string): Promise<T | null> {
        if (initialLoads < 2) {
          initialLoads += 1;
          if (initialLoads === 2) release();
          await bothLoaded;
          return null;
        }
        return (snapshots.get(key) as T | undefined) ?? null;
      },
    } as never;
    const input = {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: 'tenant-a',
      profile: { displayName: '本地快照角色' },
    };
    const first = new SnapshotRuntimeStore(storage);
    const second = new SnapshotRuntimeStore(storage);
    const results = await Promise.allSettled([
      new RuntimeCore(first).createCharacter(input),
      new RuntimeCore(second).createCharacter(input),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: new RuntimeAlreadyExistsError(input.id),
    });
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

  it('原子聊天轮次通过单一 Store 接口提交 Turn、Event 与状态，并保持幂等', async () => {
    const inner = new InMemoryRuntimeStore();
    const setupCore = new RuntimeCore(inner);
    const character = await setupCore.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '原子轮次角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const atomicCalls: Array<{ expectedVersion: number; snapshotVersion: number }> = [];
    let ordinaryCommitCalls = 0;
    const store: RuntimeSnapshotStore = {
      load: (characterId) => inner.load(characterId),
      commit: async (snapshot, expectedVersion) => {
        ordinaryCommitCalls += 1;
        await inner.commit(snapshot, expectedVersion);
      },
      commitConversationTurn: async (snapshot, expectedVersion, input) => {
        atomicCalls.push({ expectedVersion, snapshotVersion: snapshot.version });
        await inner.commit(snapshot, expectedVersion);
        return stableChatConversationTurnIds(
          input.tenantId,
          input.characterId,
          input.conversationKey,
          input.sessionKey,
          input.turnId
        );
      },
    };
    const core = new RuntimeCore(store);
    const input = {
      tenantId: 'tenant-a',
      characterId: character.id,
      turn: {
        turnId: 'chat-turn-1',
        conversationKey: 'chat-1',
        sessionKey: 'session-1',
        userMessage: '你好',
        assistantMessage: '你好，我在。',
        occurredAt: '2026-09-22T00:01:00.000Z',
      },
      event: {
        eventId: '55555555-5555-4555-8555-555555555555',
        eventType: 'conversation_turn',
        occurredAt: '2026-09-22T00:01:00.000Z',
        payload: { userMessage: '你好', assistantMessage: '你好，我在。' },
      },
    };

    const first = await core.ingestConversationTurn(input);
    const duplicate = await core.ingestConversationTurn(input);
    const expectedTurnIds = stableChatConversationTurnIds(
      'tenant-a',
      character.id,
      'chat-1',
      'session-1',
      'chat-turn-1'
    );

    expect(first.result.snapshot.version).toBe(1);
    expect(first.result.event.sourceTurnIds).toEqual([
      expectedTurnIds.userTurnId,
      expectedTurnIds.assistantTurnId,
    ]);
    expect(duplicate.result.snapshot.version).toBe(1);
    expect(atomicCalls).toEqual([
      { expectedVersion: 0, snapshotVersion: 1 },
      { expectedVersion: 1, snapshotVersion: 1 },
    ]);
    expect(ordinaryCommitCalls).toBe(0);
    await expect(core.ingestConversationTurn({
      ...input,
      turn: { ...input.turn, userMessage: '篡改内容' },
      event: { ...input.event, payload: { userMessage: '篡改内容', assistantMessage: '你好，我在。' } },
    })).rejects.toBeInstanceOf(RuntimeConflictError);
  });
  it('原子轮次忽略外部伪造的 Turn 证据标识', async () => {
    const { core } = createCore();
    const character = await core.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '证据绑定测试角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const result = await core.ingestConversationTurn({
      tenantId: 'tenant-a',
      characterId: character.id,
      turn: {
        turnId: 'actual-turn',
        userMessage: '原始消息',
        assistantMessage: '角色回复',
      },
      event: {
        eventType: 'conversation_turn',
        sourceTurnId: 'forged-turn',
        sourceTurnIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });
    const ids = stableChatConversationTurnIds(
      'tenant-a', character.id, undefined, undefined, 'actual-turn'
    );
    expect(result.result.event.sourceTurnId).toBe('actual-turn');
    expect(result.result.event.sourceTurnIds).toEqual([ids.userTurnId, ids.assistantTurnId]);
    expect(result.turn).toEqual(ids);
  });

  it('PostgresRuntimeStore 使用事务、版本锁和审计记录', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const characterId = '22222222-2222-4222-8222-222222222222';
    let persisted: RuntimeSnapshot | null = null;
    let version = 0;
    let memoryReviewUpdates = 0;
    const queries: string[] = [];
    const fakeSql: SqlExecutor = {
      async query<Row = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
        queries.push(text);
        if (text.includes('UPDATE memories')) memoryReviewUpdates += 1;
        if (text.includes('SELECT state_version')) {
          return { rows: [{ state_version: version }] as Row[], rowCount: 1 };
        }
        if (text.includes('SELECT s.state')) {
          return { rows: persisted ? [{ state: persisted, event_sequence: persisted.version }] as Row[] : [], rowCount: persisted ? 1 : 0 };
        }
        if (text.includes('SELECT state, event_sequence')) {
          return { rows: persisted ? [{ state: persisted, event_sequence: persisted.version }] as Row[] : [], rowCount: persisted ? 1 : 0 };
        }
        if (text.includes('SELECT tenant_id FROM targets')) {
          return { rows: [{ tenant_id: tenantId }] as Row[], rowCount: 1 };
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
    const targetId = '77777777-7777-4777-8777-777777777777';
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
      targetId,
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
      targetId,
      delta: 0,
      changes: {},
    };
    const memory: MemoryRecord = {
      id: '55555555-5555-4555-8555-555555555555',
      characterId,
      type: 'semantic',
      content: 'PostgreSQL 记忆投影',
      importance: 0.8,
      salience: 0.8,
      targetId,
      sourceEventId: event.id,
      occurredAt: event.occurredAt,
    };
    const episode: Episode = {
      id: '66666666-6666-4666-8666-666666666666',
      topic: 'PostgreSQL Episode',
      status: 'active',
      startedAt: event.occurredAt,
      lastEventAt: event.occurredAt,
      currentIntensity: 0.8,
      peakIntensity: 0.8,
      salience: 0.8,
      residualInfluence: 0.8,
      unresolved: true,
      eventIds: [event.id],
    };
    const next = {
      ...initial,
      events: [event],
      stateChanges: [stateChange],
      memories: [memory],
      episodes: [episode],
      version: 1,
      updatedAt: event.occurredAt,
    };
    await store.commit(next, 0);
    expect(await store.load(characterId)).toEqual(next);
    expect(queries.some((query) => query.includes('FOR UPDATE'))).toBe(true);
    expect(queries.some((query) => query.includes('state_audit_logs'))).toBe(true);
    expect(queries.some((query) => query.includes('character_versions'))).toBe(true);
    expect(queries.some((query) => query.includes('character_mood'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO memories'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO targets'))).toBe(true);
    expect(queries.some((query) => query.includes('memory_sources'))).toBe(true);
    expect(queries.some((query) => query.includes('emotion_episodes'))).toBe(true);
    expect(queries.some((query) => query.includes('emotion_episode_events'))).toBe(true);
    await expect(store.commit(next, 0)).rejects.toBeInstanceOf(Error);

    const reviewEvent: DomainEvent = {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId,
      characterId,
      eventType: 'memory.review',
      importance: 0,
      payload: {},
      effects: { memoryReview: { memoryId: memory.id, action: 'confirm' } },
      occurredAt: '2026-09-22T00:02:00.000Z',
    };
    const reviewChange: StateChange = {
      id: '99999999-9999-4999-8999-999999999999',
      eventId: reviewEvent.id,
      characterId,
      occurredAt: reviewEvent.occurredAt,
      stateVersion: 2,
      stateType: 'runtime',
      dimension: 'memory_review',
      delta: 0,
      changes: { memoryReview: { memoryId: memory.id, action: 'confirm', reviewStatus: 'confirmed' } },
    };
    const reviewed = {
      ...next,
      character: { ...next.character, version: 2, updatedAt: reviewEvent.occurredAt },
      events: [...next.events, reviewEvent],
      stateChanges: [...next.stateChanges, reviewChange],
      memories: [{ ...memory, reviewStatus: 'confirmed' as const, reviewedAt: reviewEvent.occurredAt }],
      version: 2,
      updatedAt: reviewEvent.occurredAt,
    };
    await store.commit(reviewed, 1);
    expect(await store.load(characterId)).toEqual(reviewed);
    expect(memoryReviewUpdates).toBe(1);
  });
  it('PostgreSQL 边界在进入事务前拒绝非 UUID 角色或租户', async () => {
    let transactionCalls = 0;
    const sql: SqlExecutor = {
      async query() {
        throw new Error('不应执行 SQL');
      },
      async transaction<T>(_work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        transactionCalls += 1;
        throw new Error('不应进入事务');
      },
    };
    const store = new PostgresRuntimeStore(sql, 'tenant-a');
    const character = await coreCompilerCharacter('tenant-a', '22222222-2222-4222-8222-222222222222');
    const snapshot: RuntimeSnapshot = {
      character,
      events: [],
      stateChanges: [],
      memories: [],
      episodes: [],
      version: 0,
      updatedAt: character.updatedAt,
    };

    await expect(store.initialize(snapshot)).rejects.toThrow('租户 ID 要求使用 UUID');

    const validTenantId = '11111111-1111-4111-8111-111111111111';
    const validCharacter = await coreCompilerCharacter(
      validTenantId,
      '22222222-2222-4222-8222-222222222222'
    );
    const validSnapshot: RuntimeSnapshot = {
      character: validCharacter,
      events: [],
      stateChanges: [],
      memories: [],
      episodes: [],
      version: 0,
      updatedAt: validCharacter.updatedAt,
    };
    const validStore = new PostgresRuntimeStore(sql, validTenantId);
    await expect(validStore.commitConversationTurn(validSnapshot, 0, {
      tenantId: validTenantId,
      characterId: '33333333-3333-4333-8333-333333333333',
      turnId: 'mismatched-character-turn',
      userMessage: '错误角色',
      assistantMessage: '应被拒绝',
    })).rejects.toThrow('角色不一致');
    expect(transactionCalls).toBe(0);
  });

  it('PostgreSQL RuntimeStore 持久化 Conversation、Session、双 Turn 并保证幂等', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const characterId = '22222222-2222-4222-8222-222222222222';
    const turns = new Map<string, string>();
    let sessionConversationId = '';
    const queries: string[] = [];
    const sql: SqlExecutor = {
      async query<Row = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
        queries.push(text);
        if (text.includes('FROM characters')) {
          return { rows: [{ id: characterId }] as Row[], rowCount: 1 };
        }
        if (text.includes('FROM conversations') && text.includes('tenant_id')) {
          return { rows: [{ tenant_id: tenantId, character_id: characterId }] as Row[], rowCount: 1 };
        }
        if (text.includes('FROM conversation_sessions')) {
          return { rows: [{ conversation_id: sessionConversationId }] as Row[], rowCount: 1 };
        }
        if (text.includes('SELECT id, content') && text.includes('conversation_turns')) {
          const rows = [...turns.entries()].map(([id, content]) => ({ id, content }));
          return { rows: rows as Row[], rowCount: rows.length };
        }
        if (text.includes('COALESCE(MAX(sequence_no)')) {
          return { rows: [{ next_sequence: turns.size }] as Row[], rowCount: 1 };
        }
        if (text.includes('INSERT INTO conversation_sessions')) {
          sessionConversationId = String(params[1]);
        }
        if (text.includes('INSERT INTO conversation_turns')) {
          const id = String(params[0]);
          const content = text.includes("'user'") ? String(params[3]) : String(params[4]);
          turns.set(id, content);
        }
        return { rows: [] as Row[], rowCount: 1 };
      },
      async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        return work(sql);
      },
    };
    const store = new PostgresRuntimeStore(sql, tenantId);
    const input = {
      tenantId,
      characterId,
      turnId: 'ui-turn-1',
      conversationKey: 'chat-1',
      userMessage: '你好',
      assistantMessage: '你好，我在。',
      occurredAt: '2026-09-22T00:01:00.000Z',
    };

    const first = await store.recordConversationTurn(input);
    const second = await store.recordConversationTurn(input);
    expect(second).toEqual(first);
    expect(turns).toHaveLength(2);
    expect(queries.some((query) => query.includes('INSERT INTO conversations'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO conversation_sessions'))).toBe(true);
    expect(queries.filter((query) => query.includes('INSERT INTO conversation_turns'))).toHaveLength(2);
    await expect(store.recordConversationTurn({ ...input, userMessage: '篡改内容' })).rejects.toThrow('幂等键内容冲突');
  });

  it('PostgreSQL 原子幂等路径在单一事务中补齐 Turn 与 Event 证据关联', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const characterId = '22222222-2222-4222-8222-222222222222';
    const character = await coreCompilerCharacter(tenantId, characterId);
    const input = {
      tenantId,
      characterId,
      turnId: 'repair-turn-1',
      conversationKey: 'repair-chat-1',
      userMessage: '补齐原始消息',
      assistantMessage: '补齐原始回复',
      occurredAt: '2026-09-22T00:01:00.000Z',
    };
    const turnIds = stableChatConversationTurnIds(
      tenantId,
      characterId,
      input.conversationKey,
      undefined,
      input.turnId
    );
    const event: DomainEvent = {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId,
      characterId,
      eventType: 'conversation_turn',
      importance: 0.5,
      payload: { userMessage: input.userMessage, assistantMessage: input.assistantMessage },
      occurredAt: '2026-09-22T00:01:00.000Z',
      sourceTurnId: input.turnId,
    };
    const snapshot: RuntimeSnapshot = {
      character: { ...character, version: 1 },
      events: [event],
      stateChanges: [],
      memories: [],
      episodes: [],
      version: 1,
      updatedAt: event.occurredAt,
    };
    const turns = new Set<string>();
    const links: Array<[string, string]> = [];
    const queries: string[] = [];
    let transactionCalls = 0;
    let sessionConversationId = '';
    const sql: SqlExecutor = {
      async query<Row = Record<string, unknown>>(query: string, params: readonly unknown[] = []) {
        queries.push(query);
        if (query.includes('SELECT state_version')) {
          return { rows: [{ state_version: 1 }] as Row[], rowCount: 1 };
        }
        if (query.includes('SELECT state, event_sequence')) {
          return { rows: [{ state: snapshot, event_sequence: 1 }] as Row[], rowCount: 1 };
        }
        if (query.includes('FROM characters')) {
          return { rows: [{ id: characterId }] as Row[], rowCount: 1 };
        }
        if (query.includes('FROM conversations') && query.includes('tenant_id')) {
          return { rows: [{ tenant_id: tenantId, character_id: characterId }] as Row[], rowCount: 1 };
        }
        if (query.includes('FROM conversation_sessions')) {
          return { rows: [{ conversation_id: sessionConversationId }] as Row[], rowCount: 1 };
        }
        if (query.includes('SELECT id, content') && query.includes('conversation_turns')) {
          return { rows: [] as Row[], rowCount: 0 };
        }
        if (query.includes('COALESCE(MAX(sequence_no)')) {
          return { rows: [{ next_sequence: 0 }] as Row[], rowCount: 1 };
        }
        if (query.includes('INSERT INTO conversation_sessions')) {
          sessionConversationId = String(params[1]);
        }
        if (query.includes('INSERT INTO conversation_turns')) {
          turns.add(String(params[0]));
        }
        if (query.includes('SELECT 1 FROM conversation_turns')) {
          return { rows: turns.has(String(params[0])) ? [{}] as Row[] : [], rowCount: turns.has(String(params[0])) ? 1 : 0 };
        }
        if (query.includes('INSERT INTO event_turn_links')) {
          links.push([String(params[0]), String(params[1])]);
        }
        return { rows: [] as Row[], rowCount: 1 };
      },
      async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
        transactionCalls += 1;
        return work(sql);
      },
    };
    const store = new PostgresRuntimeStore(sql, tenantId);

    const result = await store.commitConversationTurn(snapshot, 1, input);

    expect(result).toEqual(turnIds);
    expect(transactionCalls).toBe(1);
    expect(links).toEqual([
      [event.id, turnIds.userTurnId],
      [event.id, turnIds.assistantTurnId],
    ]);
    expect(queries.some((query) => query.includes('INSERT INTO state_snapshots'))).toBe(false);
    expect(queries.some((query) => query.includes('state_audit_logs'))).toBe(false);
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
    const createdMemory = (event.body as { createdMemory: MemoryRecord }).createdMemory;

    const context = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${snapshot.character.id}/context`,
      body: { query: '问候' },
    });
    expect(context.status).toBe(200);
    expect((context.body as { relevantMemories: unknown[] }).relevantMemories).toHaveLength(0);
    const review = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${snapshot.character.id}/memories/${createdMemory.id}/review`,
      body: { tenantId: 'tenant-a', action: 'confirm' },
    });
    expect(review.status).toBe(200);
    const reviewedContext = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${snapshot.character.id}/context`,
      body: { query: '问候' },
    });
    expect((reviewedContext.body as { relevantMemories: unknown[] }).relevantMemories).toHaveLength(1);
  });
});




async function coreCompilerCharacter(tenantId: string, id: string) {
  const { compileCharacter } = await import('@/runtime');
  return compileCharacter({ tenantId, id, profile: { displayName: 'Postgres 角色' }, now: '2026-09-22T00:00:00.000Z' });
}



