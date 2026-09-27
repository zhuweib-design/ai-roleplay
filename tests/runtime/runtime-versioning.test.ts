import { describe, expect, it } from 'vitest';
import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  RUNTIME_REDUCER_VERSION,
  type DomainEvent,
} from '@/runtime/types';
import { reduceRuntimeState, validateRuntimeEventVersion } from '@/runtime/runtime-core';
import { createRuntimeSnapshot } from '@/runtime/store';
import { compileCharacter } from '@/runtime/character-compiler';
import { handleRuntimeRequest, RuntimeApiAdapter } from '@/runtime/runtime-api';
import { RuntimeCore } from '@/runtime/runtime-core';
import { InMemoryRuntimeStore } from '@/runtime/store';

function baseline() {
  const character = compileCharacter({
    tenantId: 'tenant-versioning',
    id: 'character-versioning',
    profile: { displayName: '版本测试角色' },
    now: '2026-09-27T00:00:00.000Z',
  });
  return createRuntimeSnapshot(character);
}

function event(extra: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-versioning',
    characterId: 'character-versioning',
    eventType: 'versioning-test',
    importance: 0.5,
    payload: {},
    occurredAt: '2026-09-27T00:01:00.000Z',
    ...extra,
  };
}

describe('Runtime Event / Reducer 版本边界', () => {
  it('公开当前契约版本', () => {
    expect(RUNTIME_EVENT_SCHEMA_VERSION).toBe(1);
    expect(RUNTIME_REDUCER_VERSION).toBe(1);
  });

  it('旧事件缺少版本字段时按当前版本兼容回放', () => {
    expect(() => validateRuntimeEventVersion(event())).not.toThrow();
    expect(() => reduceRuntimeState(baseline(), event())).not.toThrow();
  });

  it('拒绝未知事件 schema 版本', () => {
    expect(() => validateRuntimeEventVersion(event({ schemaVersion: 2 }))).toThrow('Event Schema 版本');
  });

  it('拒绝未知 reducer 版本', () => {
    expect(() => validateRuntimeEventVersion(event({ reducerVersion: 2 }))).toThrow('Reducer 版本');
  });

  it('HTTP 入口在进入 Runtime 前拒绝未知版本', async () => {
    const core = new RuntimeCore(new InMemoryRuntimeStore());
    const api = new RuntimeApiAdapter(core);
    const character = await api.createCharacter({
      tenantId: 'tenant-versioning',
      id: 'character-http-versioning',
      profile: { displayName: 'HTTP 版本角色' },
      now: '2026-09-27T00:00:00.000Z',
    });
    const response = await handleRuntimeRequest(api, {
      method: 'POST',
      path: `/v1/runtime/characters/${character.character.id}/events`,
      body: {
        tenantId: 'tenant-versioning',
        eventType: 'future-event',
        schemaVersion: 2,
      },
    });
    expect(response.status).toBe(422);
  });
});
