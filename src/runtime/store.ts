import type { StorageAdapter } from '@storage/storage-adapter';
import type {
  CharacterDefinition,
  ContextBuildRecord,
  RuntimeCharacterListRequest,
  RuntimeCharacterListResult,
  RuntimeSnapshot,
  RuntimeSnapshotStore,
} from './types';

export class RuntimeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConflictError';
  }
}

export class RuntimeAlreadyExistsError extends Error {
  constructor(public readonly characterId: string) {
    super(`角色已存在：${characterId}`);
    this.name = 'RuntimeAlreadyExistsError';
  }
}

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

function listCharactersFromSnapshots(
  snapshots: RuntimeSnapshot[], request: RuntimeCharacterListRequest
): RuntimeCharacterListResult {
  const items = snapshots
    .filter((snapshot) => snapshot?.character?.tenantId === request.tenantId &&
      typeof snapshot.character.id === 'string' && (!request.cursor || snapshot.character.id > request.cursor))
    .sort((a, b) => a.character.id.localeCompare(b.character.id))
    .slice(0, (request.limit ?? 20) + 1);
  const limit = request.limit ?? 20;
  return {
    items: items.slice(0, limit).map((snapshot) => clone(snapshot.character)),
    ...(items.length > limit ? { nextCursor: items[limit - 1]!.character.id } : {}),
  };
}

export class InMemoryRuntimeStore implements RuntimeSnapshotStore {
  private readonly snapshots = new Map<string, RuntimeSnapshot>();
  private readonly contextBuilds = new Map<string, ContextBuildRecord>();

  async listCharacters(request: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    return listCharactersFromSnapshots([...this.snapshots.values()], request);
  }

  async load(characterId: string): Promise<RuntimeSnapshot | null> {
    const snapshot = this.snapshots.get(characterId);
    return snapshot ? clone(snapshot) : null;
  }

  async initialize(snapshot: RuntimeSnapshot): Promise<void> {
    const characterId = snapshot.character.id;
    if (this.snapshots.has(characterId)) throw new RuntimeAlreadyExistsError(characterId);
    this.snapshots.set(characterId, clone(snapshot));
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    const current = this.snapshots.get(snapshot.character.id);
    const actualVersion = current?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new OptimisticLockError(snapshot.character.id, expectedVersion, actualVersion);
    }
    // 兼容旧初始化调用，但不能用版本 0 覆盖已有角色。
    if (current && snapshot.version === 0) throw new RuntimeAlreadyExistsError(snapshot.character.id);
    this.snapshots.set(snapshot.character.id, clone(snapshot));
  }

  async recordContextBuild(record: ContextBuildRecord): Promise<void> {
    this.contextBuilds.set(record.id, clone(record));
  }

  async getContextBuild(buildId: string): Promise<ContextBuildRecord | null> {
    const record = this.contextBuilds.get(buildId);
    return record ? clone(record) : null;
  }

  seed(snapshot: RuntimeSnapshot): void {
    this.snapshots.set(snapshot.character.id, clone(snapshot));
  }

  clear(): void {
    this.snapshots.clear();
    this.contextBuilds.clear();
  }
}

// StorageAdapter 没有原子 CAS；同一适配器实例上的 Core 共享进程内锁。
// 不同进程或不同适配器实例应使用带唯一键和事务的 PostgreSQL Store。
const snapshotLocks = new WeakMap<StorageAdapter, Map<string, Promise<void>>>();

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

  private contextBuildKey(buildId: string): string {
    return `${this.namespace}:context-build:${buildId}`;
  }

  async listCharacters(request: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    if (!this.storage.listSnapshotsByPrefix) throw new Error('存储适配器不支持角色快照枚举');
    const snapshots = await this.storage.listSnapshotsByPrefix<RuntimeSnapshot>(`${this.namespace}:`);
    return listCharactersFromSnapshots(snapshots, request);
  }

  async load(characterId: string): Promise<RuntimeSnapshot | null> {
    const snapshot = await this.storage.loadSnapshot<RuntimeSnapshot>(this.key(characterId));
    return snapshot ? clone(snapshot) : null;
  }

  private async withLock<T>(characterId: string, work: () => Promise<T>): Promise<T> {
    let locks = snapshotLocks.get(this.storage);
    if (!locks) {
      locks = new Map();
      snapshotLocks.set(this.storage, locks);
    }
    const key = this.key(characterId);
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.then(() => undefined, () => undefined);
    locks.set(key, settled);
    try {
      return await next;
    } finally {
      if (locks.get(key) === settled) locks.delete(key);
    }
  }

  async initialize(snapshot: RuntimeSnapshot): Promise<void> {
    const characterId = snapshot.character.id;
    await this.withLock(characterId, async () => {
      if (await this.load(characterId)) throw new RuntimeAlreadyExistsError(characterId);
      await this.storage.saveSnapshot(this.key(characterId), clone(snapshot));
    });
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    const characterId = snapshot.character.id;
    await this.withLock(characterId, async () => {
      const current = await this.load(characterId);
      const actualVersion = current?.version ?? 0;
      if (actualVersion !== expectedVersion) {
        throw new OptimisticLockError(characterId, expectedVersion, actualVersion);
      }
      if (current && snapshot.version === 0) throw new RuntimeAlreadyExistsError(characterId);
      await this.storage.saveSnapshot(this.key(characterId), clone(snapshot));
    });
  }

  async recordContextBuild(record: ContextBuildRecord): Promise<void> {
    await this.storage.saveSnapshot(this.contextBuildKey(record.id), clone(record));
  }
}
