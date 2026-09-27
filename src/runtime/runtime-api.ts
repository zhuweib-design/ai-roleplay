import { CharacterCompileError } from './character-compiler';
import { OptimisticLockError, RuntimeAlreadyExistsError, RuntimeConflictError } from './store';
import { RuntimeCore } from './runtime-core';
import type {
  CharacterCompileInput,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeConversationTurnEventInput,
  RuntimeConversationTurnCommitResult,
  RuntimeEventInput,
  RuntimeReduceResult,
  RuntimeSnapshot,
  RuntimeCharacterListRequest,
  RuntimeCharacterListResult,
  MemoryReviewAction,
} from './types';

export type RuntimeRoute =
  | '/v1/runtime/health'
  | '/v1/runtime/characters'
  | '/v1/runtime/characters/batch'
  | `/v1/runtime/characters/${string}`
  | `/v1/runtime/characters/${string}/events`
  | `/v1/runtime/characters/${string}/turns`
  | `/v1/runtime/characters/${string}/context`
  | `/v1/runtime/characters/${string}/memories/${string}/review`;

export interface RuntimeApiRequest {
  method: 'GET' | 'POST';
  path: RuntimeRoute;
  body?: unknown;
  query?: Record<string, string>;
}

export interface RuntimeApiResponse<T = unknown> {
  status: number;
  body: T;
}

export interface RuntimeBatchCreateItem {
  index: number;
  characterId: string;
  status: 'created' | 'already_exists' | 'invalid';
  snapshot?: RuntimeSnapshot;
  issues?: string[];
}

export interface RuntimeBatchCreateResult {
  items: RuntimeBatchCreateItem[];
}

export interface RuntimeApi {
  listCharacters(input: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult>;
  createCharacters(inputs: CharacterCompileInput[]): Promise<RuntimeBatchCreateResult>;
  createCharacter(input: CharacterCompileInput): Promise<RuntimeSnapshot>;
  getCharacter(characterId: string): Promise<RuntimeSnapshot>;
  ingestEvent(characterId: string, input: Omit<RuntimeEventInput, 'characterId'>): Promise<RuntimeReduceResult>;
  recordConversationTurn(characterId: string, input: Omit<RuntimeConversationTurnInput, 'characterId'>): Promise<RuntimeConversationTurnResult>;
  recordChatTurn(characterId: string, input: RuntimeConversationTurnEventInput): Promise<RuntimeConversationTurnCommitResult>;
  buildContext(characterId: string, input?: RuntimeContextRequest): Promise<RuntimeContext>;
  reviewMemory(characterId: string, input: { tenantId: string; memoryId: string; action: MemoryReviewAction }): Promise<RuntimeSnapshot>;
}

export class RuntimeApiAdapter implements RuntimeApi {
  constructor(private readonly core: RuntimeCore) {}

  async listCharacters(input: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    return this.core.listCharacters(input);
  }

  async createCharacter(input: CharacterCompileInput): Promise<RuntimeSnapshot> {
    const character = await this.core.createCharacter(input);
    const snapshot = await this.core.getSnapshot(character.id);
    if (!snapshot) throw new Error('角色创建后无法读取 Runtime Snapshot');
    return snapshot;
  }

  async createCharacters(inputs: CharacterCompileInput[]): Promise<RuntimeBatchCreateResult> {
    const items: RuntimeBatchCreateItem[] = [];
    for (const [index, input] of inputs.entries()) {
      try {
        const snapshot = await this.createCharacter(input);
        items.push({ index, characterId: snapshot.character.id, status: 'created', snapshot });
      } catch (error) {
        if (error instanceof RuntimeAlreadyExistsError) {
          items.push({ index, characterId: input.id!, status: 'already_exists' });
        } else if (error instanceof CharacterCompileError) {
          items.push({ index, characterId: input.id!, status: 'invalid', issues: error.issues });
        } else {
          // 未知持久化故障不伪装成单项校验错误；已成功项可用稳定 ID 安全重试。
          throw error;
        }
      }
    }
    return { items };
  }

  async getCharacter(characterId: string): Promise<RuntimeSnapshot> {
    const snapshot = await this.core.getSnapshot(characterId);
    if (!snapshot) throw new Error(`角色不存在：${characterId}`);
    return snapshot;
  }

  async ingestEvent(characterId: string, input: Omit<RuntimeEventInput, 'characterId'>): Promise<RuntimeReduceResult> {
    if (input.effects?.memoryReview) throw new Error('记忆审核必须通过专用复核接口提交');
    return this.core.ingestEvent({ ...input, characterId });
  }

  async recordConversationTurn(
    characterId: string,
    input: Omit<RuntimeConversationTurnInput, 'characterId'>
  ): Promise<RuntimeConversationTurnResult> {
    return this.core.recordConversationTurn({ ...input, characterId });
  }

  async recordChatTurn(
    characterId: string,
    input: RuntimeConversationTurnEventInput
  ): Promise<RuntimeConversationTurnCommitResult> {
    return this.core.ingestConversationTurn({
      ...input,
      characterId,
      turn: input.turn,
      event: input.event,
    });
  }

  async buildContext(characterId: string, input?: RuntimeContextRequest) {
    return this.core.buildContext(characterId, input);
  }

  async reviewMemory(characterId: string, input: { tenantId: string; memoryId: string; action: MemoryReviewAction }): Promise<RuntimeSnapshot> {
    const result = await this.core.reviewMemory({ ...input, characterId });
    return result.snapshot;
  }
}

class RuntimeRequestError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('；'));
    this.name = 'RuntimeRequestError';
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeRequestError([field + ' 必须是对象']);
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string, allowEmpty = false): void {
  if (typeof body[field] !== 'string' || (!allowEmpty && !body[field].trim())) {
    throw new RuntimeRequestError([field + ' 必须是字符串' + (allowEmpty ? '' : '且不能为空')]);
  }
}

function validateEvent(body: Record<string, unknown>, tenantRequired: boolean): void {
  if (tenantRequired) requiredString(body, 'tenantId');
  requiredString(body, 'eventType');
  if (body.payload !== undefined) record(body.payload, 'payload');
  if (body.effects !== undefined) {
    const effects = record(body.effects, 'effects');
    if (effects.memoryReview !== undefined) {
      throw new RuntimeRequestError(['记忆审核必须通过专用复核接口提交']);
    }
  }
}

function validateTurn(body: Record<string, unknown>, tenantRequired: boolean): void {
  if (tenantRequired) requiredString(body, 'tenantId');
  requiredString(body, 'turnId');
  requiredString(body, 'userMessage', true);
  requiredString(body, 'assistantMessage', true);
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
    if (request.method === 'GET' && request.path === '/v1/runtime/characters') {
      const tenantId = request.query?.tenantId;
      if (!tenantId) throw new RuntimeRequestError(['tenantId 不能为空']);
      const rawLimit = request.query?.limit;
      const limit = rawLimit === undefined ? 20 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new RuntimeRequestError(['limit 必须是 1 到 100 的整数']);
      }
      const cursor = request.query?.cursor;
      if (cursor !== undefined && (!cursor.trim() || cursor.length > 128)) {
        throw new RuntimeRequestError(['cursor 格式无效']);
      }
      return { status: 200, body: await api.listCharacters({ tenantId, limit, cursor }) };
    }
    if (request.method === 'POST' && request.path === '/v1/runtime/characters/batch') {
      const body = record(request.body, '批量角色输入');
      if (!Array.isArray(body.characters) || body.characters.length < 1 || body.characters.length > 50) {
        throw new RuntimeRequestError(['characters 必须包含 1 到 50 个角色']);
      }
      const seen = new Set<string>();
      const inputs = body.characters.map((value, index) => {
        const input = record(value, `characters[${index}]`);
        requiredString(input, 'id');
        requiredString(input, 'tenantId');
        if (input.profile !== undefined) record(input.profile, `characters[${index}].profile`);
        const id = input.id as string;
        if (seen.has(id)) throw new RuntimeRequestError([`characters[${index}].id 重复`]);
        seen.add(id);
        return input as unknown as CharacterCompileInput;
      });
      return { status: 200, body: await api.createCharacters(inputs) };
    }
    if (request.method === 'POST' && request.path === '/v1/runtime/characters') {
      const body = record(request.body, '角色输入');
      requiredString(body, 'tenantId');
      if (body.profile !== undefined) record(body.profile, 'profile');
      return { status: 201, body: await api.createCharacter(body as unknown as CharacterCompileInput) };
    }
    const characterId = characterIdFrom(request.path);
    if (!characterId) return { status: 404, body: { error: 'NOT_FOUND' } };
    if (request.method === 'GET' && request.path === `/v1/runtime/characters/${characterId}`) {
      const snapshot = await api.getCharacter(characterId);
      const tenantId = request.query?.tenantId;
      if (tenantId && snapshot.character.tenantId !== tenantId) throw new Error('租户隔离校验失败');
      return { status: 200, body: snapshot };
    }
    if (request.method === 'POST' && request.path === `/v1/runtime/characters/${characterId}/events`) {
      const body = record(request.body, '事件输入');
      validateEvent(body, true);
      return {
        status: 200,
        body: await api.ingestEvent(characterId, body as unknown as Omit<RuntimeEventInput, 'characterId'>),
      };
    }
    if (request.method === 'POST' && request.path === `/v1/runtime/characters/${characterId}/turns`) {
      const body = record(request.body, '轮次输入');
      if ('turn' in body || 'event' in body) {
        requiredString(body, 'tenantId');
        validateTurn(record(body.turn, 'turn'), false);
        validateEvent(record(body.event, 'event'), false);
        return {
          status: 200,
          body: await api.recordChatTurn(
            characterId,
            body as unknown as RuntimeConversationTurnEventInput
          ),
        };
      }
      validateTurn(body, true);
      return {
        status: 200,
        body: await api.recordConversationTurn(
          characterId,
          body as unknown as Omit<RuntimeConversationTurnInput, 'characterId'>
        ),
      };
    }
    if (request.method === 'POST' && request.path === `/v1/runtime/characters/${characterId}/context`) {
      const body = request.body === undefined ? {} : record(request.body, '上下文输入');
      if (request.query?.tenantId) {
        const snapshot = await api.getCharacter(characterId);
        if (snapshot.character.tenantId !== request.query.tenantId) throw new Error('租户隔离校验失败');
      }
      return { status: 200, body: await api.buildContext(characterId, body as RuntimeContextRequest) };
    }
    const memoryReview = request.path.match(/^\/v1\/runtime\/characters\/[^/]+\/memories\/([^/]+)\/review$/);
    if (request.method === 'POST' && memoryReview) {
      const body = record(request.body, '记忆复核输入');
      requiredString(body, 'tenantId');
      const memoryId = decodeURIComponent(memoryReview[1]!);
      const action = body.action;
      if (action !== 'confirm' && action !== 'reject' && action !== 'forget') {
        throw new RuntimeRequestError(['action 必须是 confirm、reject 或 forget']);
      }
      return {
        status: 200,
        body: await api.reviewMemory(characterId, { tenantId: body.tenantId as string, memoryId, action }),
      };
    }
    return { status: 404, body: { error: 'NOT_FOUND' } };
  } catch (error) {
    if (error instanceof RuntimeRequestError || error instanceof CharacterCompileError) {
      return { status: 422, body: { error: 'VALIDATION_ERROR', issues: error.issues } };
    }
    if (error instanceof RuntimeAlreadyExistsError) return { status: 409, body: { error: 'ALREADY_EXISTS', message: error.message } };
    if (error instanceof OptimisticLockError) return { status: 409, body: { error: 'VERSION_CONFLICT', message: error.message } };
    if (error instanceof RuntimeConflictError) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT', message: error.message } };
    const message = error instanceof Error ? error.message : '未知运行时错误';
    if (message.includes('不存在')) return { status: 404, body: { error: 'NOT_FOUND', message } };
    if (message.includes('租户隔离')) return { status: 403, body: { error: 'TENANT_FORBIDDEN', message } };
    return { status: 500, body: { error: 'RUNTIME_ERROR', message: 'Runtime 处理失败' } };
  }
}



