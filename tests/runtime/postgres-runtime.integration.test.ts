import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPgPoolRuntimeApi, createPgPoolRuntimeHttpHandler } from '@/runtime/server-runtime';
import { HttpRuntimeApi } from '@/runtime/runtime-http';
import { recordGroupObservation } from '@/services/group-chat-runtime';
import type { ChatRuntimeIntegration } from '@/runtime/chat-bridge';
import type { RuntimeSnapshot } from '@/runtime/types';

const connectionString = process.env.RUNTIME_PG_TEST_URL;
const integration = connectionString ? describe : describe.skip;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

integration('PostgreSQL Runtime 真实连接集成', () => {
  it('可执行迁移并完成角色、Event、Snapshot 全链路', async () => {
    const moduleName = 'pg';
    const { Pool } = await import(moduleName);
    const applySchema = process.env.RUNTIME_PG_APPLY_SCHEMA === '1';
    const schemaName = `runtime_test_${process.pid}_${Date.now()}`;
    const adminPool = new Pool({ connectionString, max: 1 });
    if (applySchema) await adminPool.query(`CREATE SCHEMA ${schemaName}`);
    const pool = new Pool({
      connectionString,
      max: 2,
      ...(applySchema ? { options: `-c search_path=${schemaName},public` } : {}),
    });
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    const characterId = randomUUID();
    const targetId = randomUUID();
    const eventId = randomUUID();

    try {
      if (applySchema) {
        const schema = fs.readFileSync(
          path.join(root, 'migrations', '001_virtual_character_os.sql'),
          'utf8'
        );
        // pgcrypto 扩展是数据库级对象；并行测试迁移必须串行创建以避开系统目录竞态。
        await adminPool.query('SELECT pg_advisory_lock(2026, 923)');
        try {
          await pool.query(schema);
        } finally {
          await adminPool.query('SELECT pg_advisory_unlock(2026, 923)');
        }
      }

      const api = createPgPoolRuntimeApi(pool, tenantId);
      const created = await api.createCharacter({
        tenantId,
        id: characterId,
        profile: { displayName: '真实 PostgreSQL 集成角色' },
        archetype: {
          id: randomUUID(),
          name: 'integration-archetype',
          traits: [{ key: 'warmth', value: 0.8, locked: true }],
          values: [{ key: 'honesty', importance: 0.9 }],
          beliefs: [{ key: 'belief-1', statement: '事实应当可追溯', confidence: 0.9 }],
          goals: [{ key: 'goal-1', description: '完成数据库验证', priority: 0.8, active: true }],
          preferences: { 'coffee': 0.6 },
          defaultEmotions: [{ emotion: 'joy', intensity: 0.2, baseline: 0.1, halfLifeSeconds: 3600 }],
          defaultMood: {
            valence: 0.1,
            arousal: 0.3,
            dominance: 0.5,
            baselineValence: 0,
            baselineArousal: 0.3,
            baselineDominance: 0.5,
            halfLifeSeconds: 3600,
          },
        },
        now: '2026-09-22T00:00:00.000Z',
      });
      const initialCommitInput = {
        tenantId,
        turn: {
          turnId: 'integration-turn-1',
          conversationKey: 'integration-conversation',
          userMessage: '请记录这次验证',
          assistantMessage: '已记录',
          occurredAt: '2026-09-22T00:00:30.000Z',
        },
        event: {
          eventId,
          eventType: 'integration_test',
          targetId,
          occurredAt: '2026-09-22T00:01:00.000Z',
          effects: {
            emotionDeltas: { joy: 0.4 },
            moodDelta: { valence: 0.2, arousal: 0.1, dominance: 0.1 },
            attitudeDelta: { targetId, liking: 0.3, salience: 0.2, confidence: 0.3 },
            relationshipDelta: { targetId, dimensions: { trust: 0.4 }, closeness: 0.2 },
            memory: { type: 'semantic' as const, content: '真实数据库写入验证', targetId },
          },
        },
      };
      const committed = await api.recordChatTurn(characterId, initialCommitInput);
      const duplicate = await api.recordChatTurn(characterId, initialCommitInput);
      const turn = committed.turn;
      const event = committed.result;

      await expect(api.recordChatTurn(characterId, {
        tenantId,
        turn: {
          turnId: 'rollback-turn-1',
          conversationKey: 'integration-conversation',
          userMessage: '这条 Turn 应回滚',
          assistantMessage: '不会落库',
          occurredAt: '2026-09-22T00:01:30.000Z',
        },
        event: {
          eventId: 'not-a-postgres-uuid',
          eventType: 'invalid_uuid_should_rollback',
          occurredAt: '2026-09-22T00:01:30.000Z',
        },
      })).rejects.toThrow('UUID');
      const rollbackChecks = await Promise.all([
        pool.query(
          "SELECT COUNT(*)::int AS count FROM conversation_turns WHERE metadata->>'logicalTurnId' = $1",
          ['rollback-turn-1']
        ),
        pool.query(
          'SELECT COUNT(*)::int AS count FROM events WHERE character_id = $1 AND event_type = $2',
          [characterId, 'invalid_uuid_should_rollback']
        ),
      ]);
      expect(rollbackChecks.map((result) => Number(result.rows[0]?.count))).toEqual([0, 0]);
      expect((await api.getCharacter(characterId)).version).toBe(1);

      const concurrentApi = createPgPoolRuntimeApi(pool, tenantId);
      const concurrentInputs = [
        {
          turnId: 'integration-turn-2',
          eventId: randomUUID(),
          userMessage: '并发消息一',
          assistantMessage: '并发回复一',
        },
        {
          turnId: 'integration-turn-3',
          eventId: randomUUID(),
          userMessage: '并发消息二',
          assistantMessage: '并发回复二',
        },
      ];
      const concurrentResults = await Promise.all(concurrentInputs.map((item, index) => {
        const targetApi = index === 0 ? api : concurrentApi;
        return targetApi.recordChatTurn(characterId, {
          tenantId,
          turn: {
            turnId: item.turnId,
            conversationKey: 'integration-conversation',
            userMessage: item.userMessage,
            assistantMessage: item.assistantMessage,
            occurredAt: `2026-09-22T00:02:0${index}.000Z`,
          },
          event: {
            eventId: item.eventId,
            eventType: 'concurrent_integration_test',
            occurredAt: `2026-09-22T00:02:0${index}.000Z`,
          },
        });
      }));
      expect(concurrentResults.map((result) => result.result.snapshot.version).sort()).toEqual([2, 3]);
      const snapshot = await api.getCharacter(characterId);

      expect((created as RuntimeSnapshot).character.id).toBe(characterId);
      expect(turn.userTurnId).not.toBe(turn.assistantTurnId);
      expect(event.snapshot.version).toBe(1);
      expect(duplicate.result.snapshot.version).toBe(1);
      expect(snapshot.version).toBe(3);
      expect(snapshot.events.map((item) => item.id).sort()).toEqual([
        eventId,
        ...concurrentInputs.map((item) => item.eventId),
      ].sort());
      expect(snapshot.memories).toHaveLength(1);

      const projectionChecks = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM character_traits WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_values WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_beliefs WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_goals WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_preferences WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_attitudes WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_relationships WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM relationship_dimensions WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_emotions WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM character_mood WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM conversation_turns WHERE session_id = $1', [turn.sessionId]),
        pool.query(
          `SELECT COUNT(*)::int AS count
             FROM event_turn_links AS link
             JOIN events AS event ON event.id = link.event_id
            WHERE event.character_id = $1`,
          [characterId]
        ),
        pool.query('SELECT COUNT(*)::int AS count FROM character_versions WHERE character_id = $1', [characterId]),
        pool.query('SELECT COUNT(*)::int AS count FROM state_audit_logs WHERE character_id = $1', [characterId]),
      ]);
      expect(projectionChecks.map((result) => Number(result.rows[0]?.count))).toEqual([
        1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 6, 6, 4, 3,
      ]);

      const otherTenantApi = createPgPoolRuntimeApi(pool, otherTenantId);
      await expect(otherTenantApi.getCharacter(characterId)).rejects.toThrow('角色不存在');

      // 外部 Event 不得把其他租户或同租户其他角色的原始 Turn 作为证据。
      const foreignCharacterId = randomUUID();
      await otherTenantApi.createCharacter({
        tenantId: otherTenantId,
        id: foreignCharacterId,
        profile: { displayName: '其他租户角色' },
      });
      const foreignTurn = await otherTenantApi.recordConversationTurn(foreignCharacterId, {
        tenantId: otherTenantId,
        turnId: 'foreign-turn',
        userMessage: '其他租户私有内容',
        assistantMessage: '不能建立证据关联',
      });
      const siblingCharacterId = randomUUID();
      await api.createCharacter({
        tenantId,
        id: siblingCharacterId,
        profile: { displayName: '同租户其他角色' },
      });
      const siblingTurn = await api.recordConversationTurn(siblingCharacterId, {
        tenantId,
        turnId: 'sibling-turn',
        userMessage: '同租户其他角色的消息',
        assistantMessage: '不能串联角色证据',
      });
      const crossBoundaryEventId = randomUUID();
      await api.ingestEvent(characterId, {
        tenantId,
        eventId: crossBoundaryEventId,
        eventType: 'cross_boundary_evidence_test',
        occurredAt: '2026-09-22T00:03:00.000Z',
        sourceTurnIds: [foreignTurn.userTurnId, siblingTurn.userTurnId],
      });
      const crossBoundaryLinks = await pool.query(
        'SELECT COUNT(*)::int AS count FROM event_turn_links WHERE event_id = $1',
        [crossBoundaryEventId]
      );
      expect(Number(crossBoundaryLinks.rows[0]?.count)).toBe(0);

      // 经真实 HTTP 序列化边界进入同一 PostgreSQL RuntimeStore，而非直接调用 Core。
      const handler = createPgPoolRuntimeHttpHandler(pool, tenantId);
      const httpApi = new HttpRuntimeApi({
        baseUrl: 'http://runtime.test',
        fetch: (input, init) => handler(new Request(input, init)),
      });
      const batchIds = [randomUUID(), randomUUID()];
      const batch = await httpApi.createCharacters(batchIds.map((id) => ({
        tenantId: otherTenantId,
        id,
        profile: { displayName: '批量角色' },
      })));
      expect(batch.items.map((item) => item.status)).toEqual(['created', 'created']);
      expect((await httpApi.createCharacters(batchIds.map((id) => ({
        tenantId: otherTenantId,
        id,
        profile: { displayName: '批量角色' },
      })))).items.map((item) => item.status)).toEqual(['already_exists', 'already_exists']);
      const batchRows = await pool.query(
        'SELECT id, tenant_id FROM characters WHERE id = ANY($1::uuid[])', [batchIds]
      );
      expect(batchRows.rows).toHaveLength(2);
      expect(batchRows.rows.every((row: { tenant_id: string }) => row.tenant_id === tenantId)).toBe(true);
      const listedIds: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await httpApi.listCharacters({ tenantId: otherTenantId, limit: 1, cursor });
        listedIds.push(...page.items.map((item) => item.id));
        expect(page.items.every((item) => item.tenantId === tenantId)).toBe(true);
        cursor = page.nextCursor;
      } while (cursor);
      expect(listedIds).toContain(batchIds[0]);
      expect(listedIds).toContain(batchIds[1]);
      expect(listedIds).not.toContain(foreignCharacterId);
      expect(listedIds).toEqual([...listedIds].sort());
      await expect(otherTenantApi.listCharacters({ tenantId })).rejects.toThrow('租户隔离');
      const foreignList = await otherTenantApi.listCharacters({ tenantId: otherTenantId });
      expect(foreignList.items.map((item) => item.id)).toContain(foreignCharacterId);
      expect(foreignList.items.map((item) => item.id)).not.toContain(batchIds[0]);

      const listener = {
        api, tenantId, characterId: batchIds[1]!,
      } as ChatRuntimeIntegration;
      const observation = {
        groupId: 'group-integration', assistantMessageId: 'reply-1', speakerId: 'speaker-ui',
        userMessage: '群聊公开问题', assistantMessage: '群聊公开回答',
      };
      await recordGroupObservation(listener, observation);
      await recordGroupObservation(listener, observation);
      const listenerSnapshot = await api.getCharacter(batchIds[1]!);
      expect(listenerSnapshot.events.filter((event) => event.eventType === 'group_observation')).toHaveLength(1);
      expect(listenerSnapshot.version).toBe(1);


      // 两个独立 HTTP Handler 和 Runtime Core 同时创建同一 UUID，数据库唯一键决定胜者。
      const raceId = randomUUID();
      const raceInput = JSON.stringify({
        tenantId, id: raceId, profile: { displayName: '并发创建角色' },
      });
      const raceHandler = createPgPoolRuntimeHttpHandler(pool, tenantId);
      const raceRequest = () => new Request('http://runtime.test/v1/runtime/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raceInput,
      });
      const raceResponses = await Promise.all([
        handler(raceRequest()), raceHandler(raceRequest()),
      ]);
      expect(raceResponses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await raceResponses.find((response) => response.status === 409)!.json())
        .toMatchObject({ error: 'ALREADY_EXISTS' });
      const raceRows = await pool.query('SELECT COUNT(*)::int AS count FROM characters WHERE id = $1', [raceId]);
      expect(Number(raceRows.rows[0]?.count)).toBe(1);

      const httpCharacterId = randomUUID();
      const httpCreated = await httpApi.createCharacter({
        tenantId: otherTenantId,
        id: httpCharacterId,
        profile: { displayName: 'HTTP 原子链路角色' },
        now: '2026-09-22T00:00:00.000Z',
      });
      expect(httpCreated.character.tenantId).toBe(tenantId);
      const httpInput = {
        tenantId: otherTenantId,
        turn: {
          turnId: 'http-integration-turn-1',
          conversationKey: 'http-integration-conversation',
          userMessage: '这条消息经过 HTTP 客户端',
          assistantMessage: '回复由 PostgreSQL 原子保存',
          occurredAt: '2026-09-22T00:04:00.000Z',
        },
        event: {
          eventId: randomUUID(),
          eventType: 'conversation_turn',
          occurredAt: '2026-09-22T00:04:00.000Z',
          payload: { source: 'integration-http' },
        },
      };
      const httpCommit = await httpApi.recordChatTurn(httpCharacterId, httpInput);
      expect(httpCommit.result.snapshot.version).toBe(1);
      expect(httpCommit.result.event.tenantId).toBe(tenantId);
      expect(httpCommit.result.event.sourceTurnIds).toEqual([
        httpCommit.turn.userTurnId,
        httpCommit.turn.assistantTurnId,
      ]);
      expect((await httpApi.recordChatTurn(httpCharacterId, httpInput)).result.snapshot.version).toBe(1);
      expect((await httpApi.getCharacter(httpCharacterId)).events).toHaveLength(1);
      const httpContext = await httpApi.buildContext(httpCharacterId, { query: 'HTTP' });
      expect(httpContext.recentEvents.map((item) => item.id)).toContain(httpInput.event.eventId);
      await expect(httpApi.recordChatTurn(httpCharacterId, {
        ...httpInput,
        turn: { ...httpInput.turn, userMessage: '相同幂等键但修改了原文' },
      })).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      const foreignHandler = createPgPoolRuntimeHttpHandler(pool, otherTenantId);
      const foreignHttpApi = new HttpRuntimeApi({
        baseUrl: 'http://runtime.test',
        fetch: (input, init) => foreignHandler(new Request(input, init)),
      });
      await expect(foreignHttpApi.getCharacter(httpCharacterId)).rejects.toMatchObject({ status: 404 });

    } finally {
      await pool.end();
      if (applySchema) await adminPool.query(`DROP SCHEMA ${schemaName} CASCADE`);
      await adminPool.end();
    }
  }, 30_000);
});
