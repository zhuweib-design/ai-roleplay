import { describe, expect, it } from 'vitest';
import {
  CORE_CONTRACTS,
  CORE_SCHEMA_ID,
  CORE_SCHEMA_VERSION,
  assertSupportedCoreContract,
  isSupportedCoreContract,
} from '../../src/core/schema-contract';

describe('core schema contract', () => {
  it('公开稳定的核心契约基线', () => {
    expect(CORE_SCHEMA_ID).toBe('ai-roleplay-core');
    expect(CORE_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(CORE_CONTRACTS)).toEqual([
      'character', 'chat', 'lorebook', 'group-chat', 'story', 'runtime-snapshot', 'backup',
    ]);
    for (const descriptor of Object.values(CORE_CONTRACTS)) {
      expect(descriptor.version).toBe(CORE_SCHEMA_VERSION);
      expect(descriptor.compatibility).toBe('backward-compatible');
      expect(descriptor.source).toMatch(/^src\//);
    }
  });

  it('只接受当前契约版本', () => {
    expect(isSupportedCoreContract('runtime-snapshot', 1)).toBe(true);
    expect(isSupportedCoreContract('runtime-snapshot', 2)).toBe(false);
    expect(isSupportedCoreContract('runtime-snapshot', 1.5)).toBe(false);
    expect(() => assertSupportedCoreContract('backup', 1)).not.toThrow();
    expect(() => assertSupportedCoreContract('backup', 2)).toThrow('不支持的 backup 数据契约版本');
  });
});
