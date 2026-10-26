import type { RuntimeContextRequest } from './types';
import { GroupRuntimeError } from './group-runtime-contract';
import type { RuntimeHttpHandler } from './http-envelope';
import type { RuntimeTraceSink } from './runtime-trace';
import {
  authorizeRuntimeRequest,
  runtimeAuthorizationResponse,
  type RuntimeTenantBindingOptions,
} from './runtime-auth';
import {
  resolveRuntimeAccess,
  runtimeJsonResponse as respond,
  withRuntimeTrace,
} from './http-envelope';
import type { GroupRuntimeApi } from './runtime-group-http';

/**
 * 群聊 Runtime 的 HTTP handler —— 服务端专用。
 *
 * 与 `runtime-http-handler.ts` 同理：客户端 `HttpGroupRuntimeApi` 留在这个名字的
 * 原文件里（前端要用），handler 与它的请求校验搬到这里，才能把 handler 挂进
 * `runtime/server.ts` 而不把客户端一起带走。
 */

function invalid(message: string): never {
  throw new GroupRuntimeError(400, 'INVALID_REQUEST', message);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('请求体必须是对象');
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} 不能为空`);
  return value as string;
}

function contextRequest(value: unknown): RuntimeContextRequest {
  const input = value === undefined ? {} : object(value);
  for (const key of ['query', 'targetId', 'now'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'string') invalid(key + ' 必须是字符串');
  }
  if (input.now !== undefined && !Number.isFinite(Date.parse(input.now as string))) invalid('now 必须是有效时间');
  for (const key of ['maxEvents', 'maxMemories', 'maxEpisodes'] as const) {
    const limit = input[key];
    if (limit !== undefined && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0)) {
      invalid(key + ' 必须是非负安全整数');
    }
  }
  return input as RuntimeContextRequest;
}

function optionalVersion(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid('expectedVersion 必须是非负安全整数');
  }
  return value;
}

export type GroupRuntimeHandlerOptions = RuntimeTenantBindingOptions & {
  /** 关联事件接收器；宿主据此落日志或指标。缺省时不产生任何日志副作用。 */
  onTrace?: RuntimeTraceSink;
};

/** 复用已绑定租户的 GroupRuntimeApi，并按宿主配置执行认证边界。 */
export function createGroupRuntimeHttpHandler(
  api: GroupRuntimeApi,
  options: GroupRuntimeHandlerOptions = {}
): RuntimeHttpHandler {
  // 服务端回显关联 ID，并上报方法/路径/状态/耗时（与单聊共用同一层外壳）
  return withRuntimeTrace((request) => dispatchGroupRequest(api, options, request), options.onTrace);
}

async function dispatchGroupRequest(
  api: GroupRuntimeApi,
  options: RuntimeTenantBindingOptions,
  request: Request
): Promise<Response> {
  {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const access = await resolveRuntimeAccess(request, options, url.pathname);
      if (!access.granted) return access.response;
      const { principal } = access;
      let body: Record<string, unknown> | undefined;
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        try {
          const raw = await request.text();
          body = raw.trim() ? object(JSON.parse(raw) as unknown) : {};
        } catch (error) {
          if (error instanceof GroupRuntimeError) throw error;
          invalid('JSON 格式无效');
        }
      }
      if (!await authorizeRuntimeRequest(request, principal, options, {
        path: url.pathname,
        method,
        body,
        query: url.searchParams,
      })) {
        return runtimeAuthorizationResponse('MEMBER_FORBIDDEN');
      }
      if (url.pathname === '/v1/runtime/groups') {
        if (method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' });
        const payload = body!;
        if (!Array.isArray(payload.memberIds) || !payload.memberIds.every((id) => typeof id === 'string')) {
          invalid('memberIds 必须是字符串数组');
        }
        await api.createGroup({
          groupId: string(payload.groupId, 'groupId'), name: string(payload.name, 'name'),
          memberIds: payload.memberIds as string[],
        });
        return respond(200, { groupId: payload.groupId });
      }
      const match = url.pathname.match(/^\/v1\/runtime\/groups\/([^/]+)(?:\/(turns|context|members|status|outbox)(?:\/([^/]+))?)?$/);
      if (!match || (match[3] && match[2] !== 'members' && !(match[2] === 'outbox' && match[3] === 'retry'))) {
        return respond(404, { error: 'NOT_FOUND' });
      }
      const groupId = decodeURIComponent(match[1]!);
      const resource = match[2];
      if (!resource && method === 'GET') {
        return respond(200, await api.getGroupState(groupId));
      }
      // 群组资源本身只提供 GET；其它方法不应被误判为有效子路由。
      // 返回 404 可避免把不完整路径暴露成可调用的领域操作。
      if (!resource) return respond(404, { error: 'NOT_FOUND' });
      if (resource === 'turns' && method === 'GET') {
        return respond(200, await api.listTurns(groupId, string(url.searchParams.get('memberId'), 'memberId')));
      }
      if (resource === 'turns' && method === 'POST') {
        const payload = body!;
        return respond(200, await api.commitTurn({
          groupId, turnId: string(payload.turnId, 'turnId'), speakerId: string(payload.speakerId, 'speakerId'),
          userMessage: string(payload.userMessage, 'userMessage'),
          assistantMessage: string(payload.assistantMessage, 'assistantMessage'),
          ...(payload.occurredAt === undefined ? {} : { occurredAt: string(payload.occurredAt, 'occurredAt') }),
        }));
      }
      if (resource === 'context' && method === 'POST') {
        const payload = body!;
        return respond(200, await api.buildMemberContext(groupId,
          string(payload.memberId, 'memberId'), contextRequest(payload.request)));
      }
      if (resource === 'status' && !match[3] && method === 'PUT') {
        const payload = body!;
        const status = payload.status;
        if (status !== 'active' && status !== 'archived') invalid('status 必须是 active 或 archived');
        const expectedVersion = optionalVersion(payload.expectedVersion);
        return respond(200, await api.setGroupStatus({
          groupId, status, ...(expectedVersion === undefined ? {} : { expectedVersion }),
        }));
      }
      if (resource === 'outbox' && !match[3] && method === 'POST') {
        const payload = body!;
        return respond(200, await api.enqueueTurn({
          groupId, turnId: string(payload.turnId, 'turnId'), speakerId: string(payload.speakerId, 'speakerId'),
          userMessage: string(payload.userMessage, 'userMessage'),
          assistantMessage: string(payload.assistantMessage, 'assistantMessage'),
          ...(payload.occurredAt === undefined ? {} : { occurredAt: string(payload.occurredAt, 'occurredAt') }),
        }));
      }
      if (resource === 'outbox' && !match[3] && method === 'GET') {
        return respond(200, await api.listPendingTurns(groupId));
      }
      if (resource === 'outbox' && match[3] === 'retry' && method === 'POST') {
        return respond(200, await api.retryPendingTurns(groupId));
      }
      if (resource === 'members' && !match[3] && method === 'POST') {
        const expectedVersion = optionalVersion(body!.expectedVersion);
        return respond(200, await api.addMember(groupId, string(body!.characterId, 'characterId'), expectedVersion));
      }
      if (resource === 'members' && match[3] && method === 'DELETE') {
        const expectedVersion = method === 'DELETE' && body ? optionalVersion(body.expectedVersion) : undefined;
        return respond(200, await api.removeMember(groupId, decodeURIComponent(match[3]), expectedVersion));
      }
      return respond(405, { error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
      if (error instanceof GroupRuntimeError) {
        return respond(error.status, { error: error.code, message: error.message });
      }
      if (error instanceof URIError) return respond(400, { error: 'INVALID_PATH' });
      return respond(500, { error: 'GROUP_INTERNAL_ERROR', message: '群聊 Runtime 内部错误' });
    }
  }
}
