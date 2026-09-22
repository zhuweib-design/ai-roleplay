import { describe, expect, it } from 'vitest';
import {
  CharacterCompileError,
  InMemoryRuntimeStore,
  RuntimeApiAdapter,
  SnapshotRuntimeStore,
  RuntimeCore,
  computeSalience,
  decayTowardsBaseline,
  handleRuntimeRequest,
  type RuntimeSnapshot,
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



