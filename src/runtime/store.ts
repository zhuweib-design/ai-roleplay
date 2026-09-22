import type { StorageAdapter } from '@storage/storage-adapter';
import type { CharacterDefinition, RuntimeSnapshot, RuntimeSnapshotStore } from './types';

export class OptimisticLockError extends Error {
  constructor(
    public readonly characterId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(`角色 ${characterId} 的状态版本冲突：期望 ${expectedVersion}，实际 ${actualVersion}`);
    this.name = 'OptimisticLockError';
  }
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createRuntimeSnapshot(character: CharacterDefinition): RuntimeSnapshot {
  return {
    character: clone(character),
    events: [],
    stateChanges: [],
    memories: [],
    episodes: [],
    version: character.version,
    updatedAt: character.updatedAt,
  };
}

export class InMemoryRuntimeStore implements RuntimeSnapshotStore {
  private readonly snapshots = new Map<string, RuntimeSnapshot>();

  async load(characterId: string): Promise<RuntimeSnapshot | null> {
    const snapshot = this.snapshots.get(characterId);
    return snapshot ? clone(snapshot) : null;
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    const current = this.snapshots.get(snapshot.character.id);
    const actualVersion = current?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new OptimisticLockError(snapshot.character.id, expectedVersion, actualVersion);
    }
    this.snapshots.set(snapshot.character.id, clone(snapshot));
  }

  seed(snapshot: RuntimeSnapshot): void {
    this.snapshots.set(snapshot.character.id, clone(snapshot));
  }

  clear(): void {
    this.snapshots.clear();
  }
}

/**
 * 使用现有 StorageAdapter 的快照能力保存 Runtime Core。
 * 该适配器适合 Web/Tauri 单进程场景；多进程并发应切换到 PostgreSQL 适配器。
 */
export class SnapshotRuntimeStore implements RuntimeSnapshotStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly namespace = 'virtual-character-runtime'
  ) {}

  private key(characterId: string): string {
    return `${this.namespace}:${characterId}`;
  }

  async load(characterId: string): Promise<RuntimeSnapshot | null> {
    const snapshot = await this.storage.loadSnapshot<RuntimeSnapshot>(this.key(characterId));
    return snapshot ? clone(snapshot) : null;
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    const current = await this.load(snapshot.character.id);
    const actualVersion = current?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new OptimisticLockError(snapshot.character.id, expectedVersion, actualVersion);
    }
    await this.storage.saveSnapshot(this.key(snapshot.character.id), clone(snapshot));
  }
}
