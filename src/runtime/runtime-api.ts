import { CharacterCompileError } from './character-compiler';
import { OptimisticLockError } from './store';
import { RuntimeCore } from './runtime-core';
import type {
  CharacterCompileInput,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeEventInput,
  RuntimeReduceResult,
  RuntimeSnapshot,
} from './types';

export type RuntimeRoute =
  | '/v1/runtime/health'
  | '/v1/runtime/characters'
  | `/v1/runtime/characters/${string}`
  | `/v1/runtime/characters/${string}/events`
  | `/v1/runtime/characters/${string}/context`;

export interface RuntimeApiRequest {
  method: 'GET' | 'POST';
  path: RuntimeRoute;
  body?: unknown;
}

export interface RuntimeApiResponse<T = unknown> {
  status: number;
  body: T;
}

export interface RuntimeApi {
  createCharacter(input: CharacterCompileInput): Promise<RuntimeSnapshot>;
  getCharacter(characterId: string): Promise<RuntimeSnapshot>;
  ingestEvent(characterId: string, input: Omit<RuntimeEventInput, 'characterId'>): Promise<RuntimeReduceResult>;
  buildContext(characterId: string, input?: RuntimeContextRequest): Promise<RuntimeContext>;
}

export class RuntimeApiAdapter implements RuntimeApi {
  constructor(private readonly core: RuntimeCore) {}

  async createCharacter(input: CharacterCompileInput): Promise<RuntimeSnapshot> {
    const character = await this.core.createCharacter(input);
    const snapshot = await this.core.getSnapshot(character.id);
    if (!snapshot) throw new Error('角色创建后无法读取 Runtime Snapshot');
    return snapshot;
  }

  async getCharacter(characterId: string): Promise<RuntimeSnapshot> {
    const snapshot = await this.core.getSnapshot(characterId);
    if (!snapshot) throw new Error(`角色不存在：${characterId}`);
    return snapshot;
  }

  async ingestEvent(characterId: string, input: Omit<RuntimeEventInput, 'characterId'>): Promise<RuntimeReduceResult> {
    return this.core.ingestEvent({ ...input, characterId });
  }

  async buildContext(characterId: string, input?: RuntimeContextRequest) {
    return this.core.buildContext(characterId, input);
  }
}

function characterIdFrom(path: string): string | null {
  const match = path.match(/^\/v1\/runtime\/characters\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export async function handleRuntimeRequest(
  api: RuntimeApi,
  request: RuntimeApiRequest
): Promise<RuntimeApiResponse> {
  try {
    if (request.method === 'GET' && request.path === '/v1/runtime/health') {
      return { status: 200, body: { ok: true, service: 'virtual-character-runtime', version: 'v1' } };
    }
    if (request.method === 'POST' && request.path === '/v1/runtime/characters') {
      return { status: 201, body: await api.createCharacter(request.body as CharacterCompileInput) };
    }
    const characterId = characterIdFrom(request.path);
    if (!characterId) return { status: 404, body: { error: 'NOT_FOUND' } };
    if (request.method === 'GET' && request.path === `/v1/runtime/characters/${characterId}`) {
      return { status: 200, body: await api.getCharacter(characterId) };
    }
    if (request.method === 'POST' && request.path === `/v1/runtime/characters/${characterId}/events`) {
      return {
        status: 200,
        body: await api.ingestEvent(characterId, request.body as Omit<RuntimeEventInput, 'characterId'>),
      };
    }
    if (request.method === 'POST' && request.path === `/v1/runtime/characters/${characterId}/context`) {
      return { status: 200, body: await api.buildContext(characterId, request.body as RuntimeContextRequest) };
    }
    return { status: 404, body: { error: 'NOT_FOUND' } };
  } catch (error) {
    if (error instanceof CharacterCompileError) return { status: 422, body: { error: 'VALIDATION_ERROR', issues: error.issues } };
    if (error instanceof OptimisticLockError) return { status: 409, body: { error: 'VERSION_CONFLICT', message: error.message } };
    const message = error instanceof Error ? error.message : '未知运行时错误';
    if (message.includes('不存在')) return { status: 404, body: { error: 'NOT_FOUND', message } };
    return { status: 500, body: { error: 'RUNTIME_ERROR', message } };
  }
}



