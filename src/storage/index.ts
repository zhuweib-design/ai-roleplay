export type { StorageAdapter } from './storage-adapter';
export type { Chat, CharacterCard, ChatMessage } from './types';
export type { AppSettings } from '@/types';
export { IndexedDBAdapter } from './indexeddb-adapter';
export { getStorageAdapter, resetStorageAdapter, getStorageCapability } from './storage-factory';
export { migrateLegacyLocalStorage } from './legacy-migration';
export {
  SNAPSHOT_ENVELOPE_VERSION,
  SnapshotMigrationError,
  isSnapshotEnvelope,
  wrapSnapshot,
  unwrapSnapshot,
  migrateSnapshot,
  validateMigrationPlan,
} from './snapshot-migration';
export type {
  SnapshotEnvelope,
  SnapshotMigrationStep,
  SnapshotMigrationPlan,
  SnapshotMigrationReport,
  SnapshotMigrationErrorCode,
} from './snapshot-migration';
export {
  SNAPSHOT_MIGRATION_PLANS,
  LOCAL_MEMORY_MIGRATION_PLAN,
  PENDING_GROUP_TURNS_MIGRATION_PLAN,
  CHARACTER_VERSIONS_MIGRATION_PLAN,
} from './snapshot-plans';
