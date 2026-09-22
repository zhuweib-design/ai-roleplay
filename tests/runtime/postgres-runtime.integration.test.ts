import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPgPoolRuntimeApi } from '@/runtime/server-runtime';
import type { RuntimeSnapshot } from '@/runtime/types';

const connectionString = process.env.RUNTIME_PG_TEST_URL;
const integration = connectionString ? describe : describe.skip;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

integration('PostgreSQL Runtime 真实连接集成', () => {
  it('可执行迁移并完成角色、Event、Snapshot 全链路', async () => {
    const moduleName = 'pg';
    const { Pool } = await import(moduleName);
    const pool = new Pool({ connectionString, max: 2 });
    const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const characterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    try {
      if (process.env.RUNTIME_PG_APPLY_SCHEMA === '1') {
        const schema = fs.readFileSync(
          path.join(root, 'migrations', '001_virtual_character_os.sql'),
          'utf8'
        );
        await pool.query(schema);
      }

      const api = createPgPoolRuntimeApi(pool, tenantId);
      const created = await api.createCharacter({
        tenantId,
        id: characterId,
        profile: { displayName: '真实 PostgreSQL 集成角色' },
        now: '2026-09-22T00:00:00.000Z',
      });
      const event = await api.ingestEvent(characterId, {
        tenantId,
        eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        eventType: 'integration_test',
        occurredAt: '2026-09-22T00:01:00.000Z',
        effects: { memory: { type: 'semantic', content: '真实数据库写入验证' } },
      });
      const snapshot = await api.getCharacter(characterId);

      expect((created as RuntimeSnapshot).character.id).toBe(characterId);
      expect(event.snapshot.version).toBe(1);
      expect(snapshot.events.map((item) => item.id)).toEqual([
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ]);
      expect(snapshot.memories).toHaveLength(1);
    } finally {
      await pool.query('DELETE FROM characters WHERE id = $1 AND tenant_id = $2', [characterId, tenantId]);
      await pool.end();
    }
  }, 30_000);
});
