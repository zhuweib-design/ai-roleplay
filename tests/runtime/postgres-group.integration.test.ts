import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createPgPoolGroupRuntime, createPgPoolRuntimeApi, createPgPoolRuntimeHttpHandler } from '@/runtime/server-runtime';

import { HttpGroupRuntimeApi } from '@/runtime/runtime-group-http';
import { HttpRuntimeApi } from '@/runtime/runtime-http';

const connectionString = process.env.RUNTIME_PG_TEST_URL;
const integration = connectionString ? describe : describe.skip;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

integration('PostgreSQL 群聊公共回合与多角色原子事务', () => {
  it('旧部署的 group_chats 表迁移后补齐版本列与约束', async () => {
    const moduleName = 'pg';
    const { Pool } = await import(moduleName);
    const schema = `group_legacy_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString, max: 1 });
    const pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schema},public` });
    const legacyGroupId = randomUUID();
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`CREATE TABLE group_chats (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        next_sequence BIGINT NOT NULL DEFAULT 0 CHECK (next_sequence >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (id, tenant_id)
      )`);
      await pool.query(
        `INSERT INTO group_chats (id, tenant_id, name) VALUES ($1, $2, $3)`,
        [legacyGroupId, randomUUID(), '旧群聊'],
      );
      await admin.query('SELECT pg_advisory_lock(2026, 923)');
      try {
        await pool.query(fs.readFileSync(path.join(root, 'migrations', '001_virtual_character_os.sql'), 'utf8'));
      } finally {
        await admin.query('SELECT pg_advisory_unlock(2026, 923)');
      }
      const column = await pool.query(
        `SELECT column_default, is_nullable
           FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'group_chats' AND column_name = 'version'`,
      );
      const columnRow = column.rows[0] as { column_default: string | null; is_nullable: string } | undefined;
      expect(columnRow?.is_nullable).toBe('NO');
      expect(columnRow?.column_default).toContain('0');
      const row = await pool.query(
        'SELECT version FROM group_chats WHERE id = $1', [legacyGroupId],
      );
      expect(Number((row.rows[0] as { version: number | string } | undefined)?.version)).toBe(0);
      const constraint = await pool.query(
        `SELECT conname
           FROM pg_constraint
          WHERE conrelid = 'group_chats'::regclass AND conname = 'group_chats_version_nonnegative'`,
      );
      expect(constraint.rows).toHaveLength(1);
      await expect(pool.query(
        `INSERT INTO group_chats (id, tenant_id, name, version) VALUES ($1, $2, $3, -1)`,
        [randomUUID(), randomUUID(), '非法版本'],
      )).rejects.toThrow();
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  }, 90_000);

  it('验证租户/成员授权、并发顺序、幂等与中途故障全回滚', async () => {
    const moduleName = 'pg';
    const { Pool } = await import(moduleName);
    const schema = `group_test_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({ connectionString, max: 5, options: `-c search_path=${schema},public` });
    const tenant = randomUUID();
    const otherTenant = randomUUID();
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    const outsider = randomUUID();
    const groupId = randomUUID();
    let server: Server | undefined;
    try {
      await admin.query('SELECT pg_advisory_lock(2026, 923)');
      try {
        await pool.query(fs.readFileSync(path.join(root, 'migrations', '001_virtual_character_os.sql'), 'utf8'));
      } finally {
        await admin.query('SELECT pg_advisory_unlock(2026, 923)');
      }
      const api = createPgPoolRuntimeApi(pool, tenant);
      const foreignApi = createPgPoolRuntimeApi(pool, otherTenant);
      for (const [id, name] of [[a, '甲'], [b, '乙'], [c, '丙']] as const) {
        await api.createCharacter({ tenantId: tenant, id, profile: { displayName: name } });
      }
      await foreignApi.createCharacter({ tenantId: otherTenant, id: outsider,
        profile: { displayName: '其他租户角色' } });
      const group = createPgPoolGroupRuntime(pool, tenant);
      const foreignGroup = createPgPoolGroupRuntime(pool, otherTenant);
      await expect(group.createGroup({ groupId: randomUUID(), name: '非法成员', memberIds: [a, outsider] }))
        .rejects.toThrow('成员不存在');
      // 经真实 HTTP 客户端、统一 Fetch Handler 和 PostgreSQL 验证，而非分别模拟各层。
      const handler = createPgPoolRuntimeHttpHandler(pool, tenant);
      // 使用真实回环 HTTP 传输；此适配器仅用于测试，不代替生产认证宿主。
      server = createServer((request, response) => {
        void (async () => {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const method = request.method ?? 'GET';
            const result = await handler(new Request('http://127.0.0.1' + request.url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks).toString('utf8') }),
            }));
            response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
            response.end(await result.text());
          } catch {
            response.writeHead(500);
            response.end('测试 HTTP 宿主失败');
          }
        })();
      });
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('测试 HTTP 端口不可用');
      const transport = { baseUrl: 'http://127.0.0.1:' + address.port };
      const http = new HttpGroupRuntimeApi(transport);
      const characterHttp = new HttpRuntimeApi(transport);
      expect((await characterHttp.getCharacter(a)).character.profile.displayName).toBe('甲');
      await Promise.all([http.createGroup({ groupId, name: '原子群聊', memberIds: [b, a] }),
        http.createGroup({ groupId, name: '原子群聊', memberIds: [a, b] })]);
      await expect(http.createGroup({ groupId, name: '不可覆盖名称', memberIds: [a, b] }))
        .rejects.toMatchObject({ status: 409, code: 'GROUP_CONFLICT' });

      // 成员定义使用独立版本号；两个客户端基于同一旧版本并发修改时只能有一个成功。
      const casGroupId = randomUUID();
      await http.createGroup({ groupId: casGroupId, name: '版本控制群聊', memberIds: [a, b] });
      expect((await http.getGroupState(casGroupId)).version).toBe(0);
      const concurrentMembers = await Promise.allSettled([
        http.addMember(casGroupId, c, 0),
        http.addMember(casGroupId, c, 0),
      ]);
      expect(concurrentMembers.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(concurrentMembers.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect((await http.getGroupState(casGroupId)).version).toBe(1);
      await expect(http.removeMember(casGroupId, c, 0))
        .rejects.toMatchObject({ status: 409, code: 'GROUP_VERSION_CONFLICT' });
      const removedCasMember = await http.removeMember(casGroupId, c, 1);
      expect(removedCasMember.version).toBe(2);
      expect(removedCasMember.memberIds).toEqual([a, b].sort());
      const readdedCasMember = await http.addMember(casGroupId, c, 2);
      expect(readdedCasMember.version).toBe(3);
      await expect(http.removeMember(casGroupId, c, 2))
        .rejects.toMatchObject({ status: 409, code: 'GROUP_VERSION_CONFLICT' });
      await expect(group.listTurns(groupId, c)).rejects.toThrow('无权访问');
      await expect(foreignGroup.listTurns(groupId, outsider)).rejects.toThrow('无权访问');
      await expect(group.commitTurn({ groupId, turnId: 'outsider', speakerId: c,
        userMessage: '你好', assistantMessage: '你好' })).rejects.toThrow('发言角色不是有效群组成员');
      await expect(foreignGroup.commitTurn({ groupId, turnId: 'foreign', speakerId: outsider,
        userMessage: '你好', assistantMessage: '你好' })).rejects.toThrow('群组不存在');

      const input = { groupId, turnId: 'round-1', speakerId: a,
        userMessage: '请介绍大家', assistantMessage: '大家好', occurredAt: '2026-09-23T00:00:00.000Z' };
      const first = await http.commitTurn(input);
      expect(first.sequenceNo).toBe(0);
      expect(Object.keys(first.eventIds).sort()).toEqual([a, b].sort());
      expect(await http.commitTurn(input)).toEqual(first);
      await expect(group.commitTurn({ ...input, assistantMessage: '篡改回复' }))
        .rejects.toThrow('内容不一致');
      expect((await http.listTurns(groupId, b))).toHaveLength(1);
      expect((await api.getCharacter(a)).version).toBe(1);
      expect((await api.getCharacter(b)).version).toBe(1);
      const concurrent = await Promise.all([2, 3].map((round) => group.commitTurn({
        groupId, turnId: `round-${round}`, speakerId: round === 2 ? b : a,
        userMessage: `问题${round}`, assistantMessage: `答复${round}`,
      })));
      expect(concurrent.map((turn) => turn.sequenceNo).sort()).toEqual([1, 2]);
      expect((await api.getCharacter(a)).version).toBe(3);
      expect((await api.getCharacter(b)).version).toBe(3);

      await pool.query(`CREATE FUNCTION reject_group_link() RETURNS trigger AS $$
        BEGIN IF NEW.character_id = '${b}'::uuid THEN RAISE EXCEPTION 'forced group link failure';
        END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await pool.query(`CREATE TRIGGER reject_group_link BEFORE INSERT ON group_event_links
        FOR EACH ROW EXECUTE FUNCTION reject_group_link()`);
      await expect(group.commitTurn({ groupId, turnId: 'round-4', speakerId: a,
        userMessage: '失败问题', assistantMessage: '失败答复' })).rejects.toThrow('forced group link failure');
      expect((await group.listTurns(groupId, a))).toHaveLength(3);
      expect((await api.getCharacter(a)).version).toBe(3);
      expect((await api.getCharacter(b)).version).toBe(3);
      const count = await pool.query(
        'SELECT count(*)::text AS count FROM events WHERE character_id = ANY($1::uuid[])', [[a, b]]);
      expect((count.rows[0] as { count: string } | undefined)?.count).toBe('6');
      await pool.query('DROP TRIGGER reject_group_link ON group_event_links');
      const recovered = await group.commitTurn({ groupId, turnId: 'round-4', speakerId: a,
        userMessage: '失败问题', assistantMessage: '失败答复' });
      expect(recovered.sequenceNo).toBe(3);
      expect((await api.getCharacter(a)).version).toBe(4);
      expect((await api.getCharacter(b)).version).toBe(4);
      const linked = await pool.query(
        'SELECT count(*)::text AS count FROM group_event_links WHERE group_turn_id = $1', [first.id]);
      expect((linked.rows[0] as { count: string } | undefined)?.count).toBe('2');
      await expect(group.addMember(groupId, outsider)).rejects.toThrow('成员不存在');
      await http.addMember(groupId, c);
      await expect(http.createGroup({ groupId, name: '原子群聊', memberIds: [a, b] }))
        .rejects.toMatchObject({ status: 409, code: 'GROUP_CONFLICT' });
      expect((await group.listTurns(groupId, c))).toHaveLength(4);
      const withNewMember = await group.commitTurn({ groupId, turnId: 'round-5', speakerId: c,
        userMessage: '新成员问题', assistantMessage: '新成员答复' });
      expect(Object.keys(withNewMember.eventIds).sort()).toEqual([a, b, c].sort());
      expect((await api.getCharacter(c)).version).toBe(1);
      await http.removeMember(groupId, c);
      await expect(http.createGroup({ groupId, name: '原子群聊', memberIds: [a, b, c] }))
        .rejects.toMatchObject({ status: 409, code: 'GROUP_CONFLICT' });
      await expect(group.listTurns(groupId, c)).rejects.toThrow('无权访问');
      await expect(group.commitTurn({ groupId, turnId: 'after-leave', speakerId: c,
        userMessage: '离开', assistantMessage: '不允许' })).rejects.toThrow('有效群组成员');
      await expect(group.removeMember(groupId, a)).rejects.toThrow('至少保留 2 位成员');
      await expect(group.buildMemberContext(groupId, c)).rejects.toThrow('无权访问');
      await expect(foreignGroup.buildMemberContext(groupId, outsider)).rejects.toThrow('无权访问');
      await api.ingestEvent(a, { tenantId: tenant, eventId: randomUUID(),
        eventType: 'private-note', importance: 0.7, payload: { source: 'private' },
        effects: { memory: { type: 'semantic', content: '仅甲知道的私人线索', importance: 0.9 } } });
      const ownContext = await http.buildMemberContext(groupId, a, { query: '私人线索' });
      const otherContext = await http.buildMemberContext(groupId, b, { query: '私人线索' });
      expect(ownContext.relevantMemories.some((memory) => memory.content.includes('仅甲知道'))).toBe(true);
      expect(otherContext.relevantMemories.some((memory) => memory.content.includes('仅甲知道'))).toBe(false);
      await Promise.all([
        http.createGroup({ groupId, name: '原子群聊', memberIds: [a, b] }),
        http.commitTurn({ groupId, turnId: 'concurrent-create', speakerId: b, userMessage: '并发创建重试', assistantMessage: '不会覆盖成员' }),
      ]);
      await pool.query("UPDATE group_chats SET status = 'archived' WHERE id = $1", [groupId]);
      await expect(http.createGroup({ groupId, name: '原子群聊', memberIds: [a, b] }))
        .rejects.toMatchObject({ status: 404, code: 'GROUP_NOT_FOUND' });
    } finally {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      }
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  }, 90_000);
});


