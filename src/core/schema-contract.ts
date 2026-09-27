/**
 * 1.0.0 核心数据契约基线。
 *
 * 这里记录的是跨存储、备份和 Runtime 之间的语义版本，不等同于某个
 * 数据库迁移文件编号。新增可选字段可以继续使用当前版本；改变字段含义
 * 或删除字段时必须先增加迁移，并提升对应契约版本。
 */

export const CORE_SCHEMA_ID = 'ai-roleplay-core' as const;
export const CORE_SCHEMA_VERSION = 1 as const;

export type CoreContractName =
  | 'character'
  | 'chat'
  | 'lorebook'
  | 'group-chat'
  | 'story'
  | 'runtime-snapshot'
  | 'backup';

export interface CoreContractDescriptor {
  name: CoreContractName;
  version: number;
  compatibility: 'backward-compatible';
  source: string;
}

/** 当前发布线支持的核心数据契约清单。对象被冻结，避免运行时被意外修改。 */
export const CORE_CONTRACTS: Readonly<Record<CoreContractName, CoreContractDescriptor>> = Object.freeze({
  character: {
    name: 'character',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/core/character-card.ts',
  },
  chat: {
    name: 'chat',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/storage/types.ts',
  },
  lorebook: {
    name: 'lorebook',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/core/lorebook.ts',
  },
  'group-chat': {
    name: 'group-chat',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/core/group-chat.ts',
  },
  story: {
    name: 'story',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/core/story-types.ts',
  },
  'runtime-snapshot': {
    name: 'runtime-snapshot',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/runtime/types.ts',
  },
  backup: {
    name: 'backup',
    version: CORE_SCHEMA_VERSION,
    compatibility: 'backward-compatible',
    source: 'src/core/backup.ts',
  },
});

export function isSupportedCoreContract(
  name: CoreContractName,
  version: number,
): boolean {
  return Number.isInteger(version) && version === CORE_CONTRACTS[name].version;
}

export function assertSupportedCoreContract(
  name: CoreContractName,
  version: number,
): void {
  // i18n-ignore-start // 领域校验错误，不直接作为 UI 文案
  if (!isSupportedCoreContract(name, version)) {
    throw new Error(`不支持的 ${name} 数据契约版本：${version}`);
  }
  // i18n-ignore-end
}
