import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { createProjectRuntime } from '../../src/runtime/project-runtime';
import type { UICharacter } from '@/types';
import type { StorageAdapter } from '@/storage/storage-adapter';
import type { GroupChat } from '@/core/group-chat';
import { uiCharToCard } from '@/services/type-adapters';
import { buildChatRuntimeContext } from '@/runtime/chat-bridge';
import { RuntimeApiAdapter } from '@/runtime/runtime-api';
import { RuntimeCore } from '@/runtime/runtime-core';
import { InMemoryRuntimeStore } from '@/runtime/store';
import { createRuntimeHttpHandler } from '@/runtime/runtime-http-handler';
import { createGroupRuntimeHttpHandler } from '@/runtime/runtime-group-http-handler';
import type { GroupRuntimeApi } from '@/runtime/runtime-group-http';
import { GroupRuntimeError } from '@/runtime/group-runtime-contract';

function makeCharacter(id = `runtime-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`): UICharacter {
  return {
    id,
    name: 'Runtime 测试角色',
    avatarType: 'gradient',
    gradientFrom: '#123456',
    gradientTo: '#654321',
    initial: 'R',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '一个用于验证 Runtime 注入的测试角色。',
    personality: '温和、稳定',
    scenario: '测试场景',
    model: 'gpt-4o',
    profileId: null,
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
  };
}

function makeResponse(content: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        id: 'runtime-chat-test',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }],
      })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('Chat Store — Runtime 实际链路', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ai-roleplay:runtime-tenant-id:')) localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('批量创建两个独立角色，重试不覆盖快照，超出单批上限则拒绝', async () => {
    const store = useChatStore();
    const first = makeCharacter();
    const second = makeCharacter();
    second.name = '另一个角色';

    const created = await store.createRuntimeCharactersBatch([first, second]);
    expect(created?.items.map((item) => item.status)).toEqual(['created', 'created']);
    expect(created?.items[0]?.characterId).not.toBe(created?.items[1]?.characterId);

    const tenantId = localStorage.getItem('ai-roleplay:runtime-tenant-id:default');
    expect(tenantId).toBeTruthy();
    const api = createProjectRuntime();
    const listed = await api.listCharacters({ tenantId: tenantId! });
    expect(listed.items.map((item) => item.profile.displayName)).toEqual(
      expect.arrayContaining([first.name, second.name])
    );

    const retried = await store.createRuntimeCharactersBatch([first, second]);
    expect(retried?.items.map((item) => item.status)).toEqual(['already_exists', 'already_exists']);
    expect((await api.getCharacter(created!.items[0]!.characterId)).version).toBe(created!.items[0]!.snapshot?.version);

    expect(await store.createRuntimeCharactersBatch(Array.from({ length: 51 }, (_, i) =>
      makeCharacter(`over-limit-${i}`)
    ))).toBeNull();
    expect(store.runtimeStatus?.phase).toBe('initialize');
  });

  it('Runtime 最小状态查看返回快照摘要，未初始化角色返回 enabled=false', async () => {
    const store = useChatStore();
    const character = makeCharacter();
    const created = await store.createRuntimeCharactersBatch([character]);
    expect(created?.items[0]?.status).toBe('created');

    const summary = await store.inspectRuntimeState(character);
    expect(summary.enabled).toBe(true);
    if (!summary.enabled) throw new Error('unreachable');
    expect(summary.displayName).toBe(character.name);
    expect(summary.version).toBe(0);
    expect(summary.eventCount).toBe(0);
    expect(summary.memoryCount).toBeGreaterThanOrEqual(0);
    expect(summary.mood).not.toBeNull();

    // 未初始化的角色不应报错，而是返回 enabled=false
    const unknown = makeCharacter('never-created');
    const missing = await store.inspectRuntimeState(unknown);
    expect(missing.enabled).toBe(false);
  });

  it('Runtime 回放自检对已提交事件流报告一致', async () => {
    const store = useChatStore();
    const character = makeCharacter('replay-target');
    const created = await store.createRuntimeCharactersBatch([character]);
    expect(created?.items[0]?.status).toBe('created');

    // 直接写入两条事件，避免依赖聊天链路的异步 fail-open 写入时机
    const tenantId = localStorage.getItem('ai-roleplay:runtime-tenant-id:default');
    expect(tenantId).toBeTruthy();
    const api = createProjectRuntime();
    const runtimeCharacterId = created!.items[0]!.characterId;
    for (const [eventId, eventType] of [
      [crypto.randomUUID(), 'replay_event_one'],
      [crypto.randomUUID(), 'replay_event_two'],
    ] as const) {
      await api.ingestEvent(runtimeCharacterId, {
        tenantId: tenantId!,
        eventId,
        eventType,
        importance: 0.5,
        payload: { source: 'replay-test' },
      });
    }

    const replay = await store.verifyRuntimeReplay(character);
    expect(replay.enabled).toBe(true);
    if (!replay.enabled) throw new Error('unreachable');
    expect(replay.eventCount).toBe(2);
    expect(replay.consistent).toBe(true);
    expect(replay.replayedVersion).toBe(replay.storedVersion);
    expect(replay.replayedVersion).toBe(2);
  });

  it('聊天 Runtime 记忆审核会持久化并通过事件回放自检', async () => {
    const store = useChatStore();
    const character = makeCharacter('memory-review-target');
    const created = await store.createRuntimeCharactersBatch([character]);
    expect(created?.items[0]?.status).toBe('created');
    const tenantId = localStorage.getItem('ai-roleplay:runtime-tenant-id:default');
    expect(tenantId).toBeTruthy();

    const api = createProjectRuntime();
    const runtimeCharacterId = created!.items[0]!.characterId;
    const event = await api.ingestEvent(runtimeCharacterId, {
      tenantId: tenantId!,
      eventType: 'conversation_turn',
      importance: 0.7,
      effects: { memory: { type: 'semantic', content: '需要用户审核的聊天事实' } },
    });
    expect(event.createdMemory?.reviewStatus).toBe('candidate');
    await expect(store.reviewRuntimeMemory(character, event.createdMemory!.id, 'confirm')).resolves.toBe(true);

    const summary = await store.inspectRuntimeState(character);
    expect(summary.enabled).toBe(true);
    if (!summary.enabled) throw new Error('Runtime state unavailable');
    expect(summary.memories[0]?.reviewStatus).toBe('confirmed');
    const replay = await store.verifyRuntimeReplay(character);
    expect(replay.enabled).toBe(true);
    if (!replay.enabled) throw new Error('Runtime replay unavailable');
    expect(replay.consistent).toBe(true);
    expect(replay.eventCount).toBe(2);
  });

  it('普通发送与重新生成都注入同一 Runtime 角色上下文', async () => {
    const requests: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requests.push(init ?? {});
      return makeResponse('Runtime 回复');
    });

    const store = useChatStore();
    store.setApiProfile({
      id: 'runtime-test-profile',
      name: 'Runtime Test',
      provider: 'openai',
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
    });
    const character = makeCharacter();

    await store.sendMessage(character, '你好');
    expect(character.messages).toHaveLength(2);
    await store.regenerateMessage(character, character.messages[1]!.id);

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const payload = JSON.parse(String(request.body)) as { messages: Array<{ role: string; content: string }> };
      const system = payload.messages.find((message) => message.role === 'system');
      expect(system?.content).toContain('[Virtual Character Runtime State]');
      expect(system?.content).toContain('Runtime 测试角色');
    }
    expect(store.runtimeStatus).toBeNull();
  });
  function setupGroupRemote() {
    vi.stubEnv('VITE_RUNTIME_BASE_URL', 'http://runtime.test');
    const characters = [makeCharacter('group-a'), makeCharacter('group-b')];
    characters[1]!.name = '另一个群聊角色';
    const group: GroupChat = {
      id: 'group-one', name: '远程测试群', description: '', mode: 'natural', firstMessage: '',
      messages: [], lastSpeakerId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      members: characters.map((c) => ({ characterId: c.id, name: c.name, joinedAt: new Date().toISOString(), allowAutoSelect: true })),
    };
    const characterApi = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const context = vi.fn<GroupRuntimeApi['buildMemberContext']>(async (_groupId, memberId, request) => characterApi.buildContext(memberId, request));
    const create = vi.fn<GroupRuntimeApi['createGroup']>(async () => {});
    const getGroupState = vi.fn<GroupRuntimeApi['getGroupState']>(async (groupId) => ({
      groupId, name: '远程测试群', status: 'active', version: 3, memberIds: ['group-a', 'group-b'],
    }));
    const addMember = vi.fn<GroupRuntimeApi['addMember']>(async (groupId, characterId) => ({
      groupId, name: '远程测试群', status: 'active', version: 4, memberIds: ['group-a', 'group-b', characterId],
    }));
    const removeMember = vi.fn<GroupRuntimeApi['removeMember']>(async (groupId) => ({
      groupId, name: '远程测试群', status: 'active', version: 4, memberIds: ['group-a'],
    }));
    const enqueueTurn = vi.fn<GroupRuntimeApi['enqueueTurn']>(async (input) => ({
      groupId: input.groupId, turnId: input.turnId, speakerId: input.speakerId,
      userMessage: input.userMessage, assistantMessage: input.assistantMessage,
      occurredAt: input.occurredAt ?? '2026-09-23T00:00:00.000Z', status: 'pending' as const,
      attempts: 0, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
    }));
    const listTurns = vi.fn<GroupRuntimeApi['listTurns']>(async () => []);
    const listPendingTurns = vi.fn<GroupRuntimeApi['listPendingTurns']>(async () => []);
    const retryPendingTurns = vi.fn<GroupRuntimeApi['retryPendingTurns']>(async () => []);
    const setGroupStatus = vi.fn<GroupRuntimeApi['setGroupStatus']>(async (input) => ({
      groupId: input.groupId, name: '远程测试群', status: input.status, version: 5,
      memberIds: ['group-a', 'group-b'],
    }));
    const commit = vi.fn<GroupRuntimeApi['commitTurn']>(async (input) => ({
      ...input, id: 'turn-id', sequenceNo: 0, occurredAt: '2026-09-23T00:00:00.000Z', eventIds: {},
    }));
    const groups = createGroupRuntimeHttpHandler({
      createGroup: create, getGroupState, setGroupStatus, commitTurn: commit, buildMemberContext: context,
      enqueueTurn, listPendingTurns, retryPendingTurns,
      addMember, removeMember, listTurns,
    }, { allowAnonymous: true });
    const single = createRuntimeHttpHandler(characterApi, { allowAnonymous: true });
    const paths: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const pathname = new URL(request.url).pathname;
      paths.push(pathname);
      return pathname.startsWith('/v1/runtime/groups') ? groups(request) : single(request);
    });
    const store = useChatStore();
    const input = { group, characters, speakerCharacterId: characters[0]!.id };
    return { store, input, paths, context, create, getGroupState, addMember, removeMember, setGroupStatus, listTurns, listPendingTurns, enqueueTurn, commit };
  }

  it('远程群聊先确认群组，再走成员限定上下文，且不污染缓存的单角色 API', async () => {
    const { store, input, paths, context, create, commit } = setupGroupRemote();
    const runtime = await store.ensureGroupRuntimeIntegration(input);
    expect(create).toHaveBeenCalledOnce();
    expect(runtime?.requireContext).toBe(true);
    const block = await buildChatRuntimeContext(runtime!);
    expect(block).toContain('Identity: Runtime 测试角色');
    expect(context).toHaveBeenCalledWith(create.mock.calls[0]![0].groupId, runtime!.characterId,
      { maxEvents: 12, maxMemories: 8, maxEpisodes: 5 });
    expect(paths.filter((path) => path.endsWith('/context'))).toEqual([
      '/v1/runtime/groups/' + create.mock.calls[0]![0].groupId + '/context',
    ]);
    const cached = await store.ensureRuntimeIntegration(input.characters[0]!, uiCharToCard(input.characters[0]!), 'group-' + input.group.id);
    expect(cached?.requireContext).toBeUndefined();
    expect(cached?.api.recordChatTurn).toBeTypeOf('function');
    expect(runtime!.api.recordChatTurn).toBeUndefined();
    await expect(runtime!.api.ingestEvent(runtime!.characterId, { tenantId: runtime!.tenantId, eventType: 'unexpected', importance: 0.5, payload: {} }))
      .rejects.toThrow('公共回合事务');
    const committed = await store.commitRuntimeGroupTurn({ ...input, turnId: 'stable-turn', userMessage: '问', assistantMessage: '答' });
    expect(committed).toEqual({ enabled: true, committed: true });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![0]).toMatchObject({ groupId: create.mock.calls[0]![0].groupId, speakerId: runtime!.characterId, turnId: 'stable-turn' });
    expect(paths.some((path) => path.includes('/characters/') && (path.endsWith('/events') || path.endsWith('/turns')))).toBe(false);
  });

  it.each([401, 403, 500])('成员限定 Context 返回 %i 时传播失败而不降级', async (status) => {
    const { store, input, context, paths } = setupGroupRemote();
    const runtime = await store.ensureGroupRuntimeIntegration(input);
    context.mockRejectedValue(new GroupRuntimeError(status, 'CONTEXT_DENIED', '群组上下文不可读取'));
    await expect(buildChatRuntimeContext(runtime!)).rejects.toMatchObject({ status, code: 'CONTEXT_DENIED' });
    expect(store.runtimeStatus).toMatchObject({ phase: 'context', message: '群组上下文不可读取' });
    expect(paths.some((path) => path.includes('/characters/') && path.endsWith('/context'))).toBe(false);
  });

  it('群组初始化冲突中止准备；不自动加入、移除或读取其他角色上下文', async () => {
    const { store, input, create, context, paths } = setupGroupRemote();
    create.mockRejectedValue(new GroupRuntimeError(409, 'GROUP_CONFLICT', '群组定义冲突'));
    await expect(store.ensureGroupRuntimeIntegration(input)).rejects.toMatchObject({ status: 409 });
    expect(store.runtimeStatus?.phase).toBe('initialize');
    expect(context).not.toHaveBeenCalled();
    expect(paths.some((path) => path.includes('/members'))).toBe(false);
  });

  it('远程提交失败后同键重试保留原始载荷，不回退单角色事件接口', async () => {
    const { store, input, enqueueTurn, commit, paths } = setupGroupRemote();
    commit.mockRejectedValueOnce(new GroupRuntimeError(503, 'TEMPORARY_FAILURE', '暂时不可用'));
    const turn = { ...input, turnId: 'retry-same-turn', userMessage: '问题', assistantMessage: '原始回答' };
    expect(await store.commitRuntimeGroupTurn(turn)).toEqual({ enabled: true, committed: false });
    expect(store.runtimeStatus?.phase).toBe('event');
    expect(store.pendingGroupRuntimeTurns[0]).toMatchObject({
      occurredAt: enqueueTurn.mock.calls[0]![0].occurredAt,
      status: 'failed', attempts: 1, lastErrorCode: 'TEMPORARY_FAILURE', lastErrorStatus: 503,
    });
    expect(await store.commitRuntimeGroupTurn(turn)).toEqual({ enabled: true, committed: true });
    expect(commit.mock.calls[0]![0]).toEqual(commit.mock.calls[1]![0]);
    expect(enqueueTurn.mock.calls[0]![0].occurredAt).toBe(enqueueTurn.mock.calls[1]![0].occurredAt);
    expect(paths.some((path) => path.includes('/characters/') && (path.endsWith('/events') || path.endsWith('/turns')))).toBe(false);
  });

  it('同一逻辑回合键遇到不同本地载荷时拒绝覆盖，也不发送远端请求', async () => {
    const { store, input, enqueueTurn, commit } = setupGroupRemote();
    const turn = { ...input, turnId: 'immutable-local-turn', userMessage: '原问题', assistantMessage: '原回答' };
    commit.mockRejectedValueOnce(new GroupRuntimeError(503, 'TEMPORARY_FAILURE', '暂时不可用'));
    expect(await store.commitRuntimeGroupTurn(turn)).toEqual({ enabled: true, committed: false });
    const enqueueCount = enqueueTurn.mock.calls.length;
    const commitCount = commit.mock.calls.length;

    expect(await store.commitRuntimeGroupTurn({ ...turn, assistantMessage: '不同回答' }))
      .toEqual({ enabled: true, committed: false });
    expect(enqueueTurn).toHaveBeenCalledTimes(enqueueCount);
    expect(commit).toHaveBeenCalledTimes(commitCount);
    expect(store.pendingGroupRuntimeTurns[0]?.assistantMessage).toBe('原回答');
  });

  it('成员变更先同步远端显式接口，失败时不要求调用方静默覆盖本地状态', async () => {
    const { store, input, addMember, removeMember } = setupGroupRemote();
    const extra = makeCharacter('group-c');
    const characters = [...input.characters, extra];
    const added = await store.syncRemoteGroupMember({
      group: input.group, characters, memberCharacterId: extra.id, operation: 'add',
    });
    expect(added).toEqual({ enabled: true, synced: true });
    expect(addMember).toHaveBeenCalledOnce();
    expect(addMember.mock.calls[0]![0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(input.group.members).toHaveLength(2);

    const removed = await store.syncRemoteGroupMember({
      group: input.group, characters, memberCharacterId: input.characters[1]!.id, operation: 'remove',
    });
    expect(removed).toEqual({ enabled: true, synced: true });
    expect(removeMember).toHaveBeenCalledOnce();
    expect(removeMember.mock.calls[0]![1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('拉取服务端群聊公共回合，远端模式未启用时返回 enabled=false', async () => {
    // 无 VITE_RUNTIME_BASE_URL → 纯本地模式
    const localStore = useChatStore();
    const localCharacter = makeCharacter('local-only');
    const localGroup: GroupChat = {
      id: 'local-group', name: '本地群', description: '', mode: 'natural', firstMessage: '',
      messages: [], lastSpeakerId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      members: [{ characterId: localCharacter.id, name: localCharacter.name, joinedAt: new Date().toISOString(), allowAutoSelect: true }],
    };
    const localResult = await localStore.fetchRemoteGroupTurns({
      group: localGroup, characters: [localCharacter],
    });
    expect(localResult).toEqual({ enabled: false, turns: [] });

    // 远端模式 → 走 listTurns 并透传服务端回合
    const { store, input, listTurns } = setupGroupRemote();
    listTurns.mockResolvedValueOnce([{
      id: 'server-turn', groupId: 'g', turnId: 'turn-x', sequenceNo: 0,
      speakerId: 'runtime-a', userMessage: '远地问', assistantMessage: '远地回答',
      occurredAt: '2026-09-24T03:00:00.000Z', eventIds: {},
    }]);
    const remoteResult = await store.fetchRemoteGroupTurns({
      group: input.group, characters: input.characters,
    });
    expect(remoteResult.enabled).toBe(true);
    expect(remoteResult.turns).toHaveLength(1);
    expect(remoteResult.turns[0]?.turnId).toBe('turn-x');
    expect(listTurns).toHaveBeenCalledOnce();
  });

  it('群组归档状态先同步远端，服务端失败时本地生命周期不变', async () => {
    const { store, input, getGroupState, setGroupStatus } = setupGroupRemote();

    const archived = await store.syncRemoteGroupStatus({
      group: input.group, characters: input.characters, status: 'archived',
    });
    expect(archived).toEqual({ enabled: true, synced: true });
    expect(setGroupStatus).toHaveBeenCalledOnce();
    // 远端已 active，目标 archived：必须带服务端读取到的版本做 CAS
    expect(setGroupStatus.mock.calls[0]![0]).toMatchObject({ status: 'archived', expectedVersion: 3 });

    // 模拟服务端已归档：本地请求恢复为 active 时会触发状态写入并遭遇 CAS 冲突
    getGroupState.mockImplementationOnce(async (groupId) => ({
      groupId, name: '远程测试群', status: 'archived', version: 4, memberIds: ['group-a', 'group-b'],
    }));
    setGroupStatus.mockRejectedValueOnce(new GroupRuntimeError(409, 'GROUP_VERSION_CONFLICT', '群组状态已更新'));
    const conflicted = await store.syncRemoteGroupStatus({
      group: input.group, characters: input.characters, status: 'active',
    });
    expect(conflicted).toEqual({ enabled: true, synced: false });
    expect(store.runtimeStatus?.phase).toBe('event');
  });

  it('远程提交失败会持久化待提交回合，刷新后可用同一载荷重试并清除队列', async () => {
    const snapshots = new Map<string, unknown>();
    const adapter = {
      saveSnapshot: vi.fn(async (key: string, value: unknown) => { snapshots.set(key, structuredClone(value)); }),
      loadSnapshot: vi.fn(async <T>(key: string) => (snapshots.get(key) as T | undefined) ?? null),
    } as unknown as StorageAdapter;
    const first = setupGroupRemote();
    first.store.setStorageAdapter(adapter);
    first.commit.mockRejectedValueOnce(new GroupRuntimeError(503, 'TEMPORARY_FAILURE', '网络暂时不可用'));
    const original = { ...first.input, turnId: 'persistent-retry', userMessage: '保留问题', assistantMessage: '保留回答' };
    expect(await first.store.commitRuntimeGroupTurn(original)).toEqual({ enabled: true, committed: false });
    expect(first.store.pendingGroupRuntimeTurns).toHaveLength(1);
    // MIG-01：写入端产出带版本信封，载荷位于 data 字段。
    expect(adapter.saveSnapshot).toHaveBeenCalledWith(
      'runtime:pending-group-turns:v1',
      expect.objectContaining({ schemaVersion: 1, data: expect.any(Array) }),
    );
    const raw = snapshots.get('runtime:pending-group-turns:v1') as { data: Array<Record<string, unknown>> };
    expect(raw).toBeDefined();
    const saved = raw.data.map((item) => ({ ...item }));
    expect(saved[0]).toMatchObject({ groupId: original.group.id, turnId: original.turnId, userMessage: original.userMessage, assistantMessage: original.assistantMessage, attempts: 1, status: 'failed', lastErrorCode: 'TEMPORARY_FAILURE', lastErrorStatus: 503 });
    expect(saved[0]?.occurredAt).toBe(first.enqueueTurn.mock.calls[0]![0].occurredAt);

    setActivePinia(createPinia());
    const refreshed = useChatStore();
    refreshed.setStorageAdapter(adapter);
    await refreshed.loadRuntimePendingGroupTurns();
    expect(refreshed.pendingGroupRuntimeTurns).toHaveLength(1);
    expect(refreshed.pendingGroupRuntimeTurns[0]).toMatchObject({ turnId: 'persistent-retry', assistantMessage: '保留回答' });
    const beforeRetry = first.commit.mock.calls.length;
    const retry = await refreshed.retryPendingGroupRuntimeTurn({ ...first.input, groupTurnId: 'persistent-retry' });
    expect(retry).toEqual({ enabled: true, committed: true });
    expect(first.commit.mock.calls.length).toBe(beforeRetry + 1);
    expect(first.commit.mock.calls.at(-1)?.[0]).toMatchObject({ turnId: 'persistent-retry', userMessage: '保留问题', assistantMessage: '保留回答' });
    expect(first.commit.mock.calls.at(-1)?.[0].occurredAt).toBe(saved[0]?.occurredAt);
    expect(refreshed.pendingGroupRuntimeTurns).toHaveLength(0);
  });

  it('升级时保留 0.3.0 队列快照并补齐缺失的回合时间和失败状态', async () => {
    const createdAt = '2026-09-24T03:00:00.000Z';
    const adapter = {
      loadSnapshot: vi.fn(async () => [{
        groupId: 'legacy-group', turnId: 'legacy-turn', speakerCharacterId: 'legacy-speaker',
        userMessage: '旧问题', assistantMessage: '旧回答', createdAt, attempts: 1,
      }]),
    } as unknown as StorageAdapter;
    const store = useChatStore();
    store.setStorageAdapter(adapter);

    await store.loadRuntimePendingGroupTurns();
    expect(store.pendingGroupRuntimeTurns).toEqual([expect.objectContaining({
      turnId: 'legacy-turn', occurredAt: createdAt, status: 'failed',
    })]);
  });

  it('进入群聊时从服务端恢复本地缺失的待处理回合，并可用原载荷显式重试', async () => {
    const { store, input, listPendingTurns, enqueueTurn, commit } = setupGroupRemote();
    const occurredAt = '2026-09-24T03:00:00.000Z';
    listPendingTurns.mockResolvedValueOnce([{
      groupId: 'remote-group', turnId: 'server-only-turn',
      speakerId: store.runtimeCharacterIdFor(input.characters[0]!),
      userMessage: '服务器保留的问题', assistantMessage: '服务器保留的回答', occurredAt,
      status: 'failed', attempts: 2, lastError: '上次提交失败',
      createdAt: occurredAt, updatedAt: occurredAt,
    }]);

    expect(await store.recoverRemoteGroupOutbox(input)).toEqual({ enabled: true, recovered: 1 });
    expect(store.pendingGroupRuntimeTurns[0]).toMatchObject({
      groupId: input.group.id, turnId: 'server-only-turn',
      speakerCharacterId: input.characters[0]!.id, occurredAt,
      attempts: 2, status: 'failed', lastError: '上次提交失败',
    });
    expect(await store.retryPendingGroupRuntimeTurn({ ...input, groupTurnId: 'server-only-turn' }))
      .toEqual({ enabled: true, committed: true });
    expect(enqueueTurn.mock.calls.at(-1)?.[0]).toMatchObject({
      turnId: 'server-only-turn', userMessage: '服务器保留的问题',
      assistantMessage: '服务器保留的回答', occurredAt,
    });
    expect(commit.mock.calls.at(-1)?.[0]).toMatchObject({ turnId: 'server-only-turn', occurredAt });
  });

  it('远程准备拒绝非成员和本地归档群组，且不发出 HTTP 请求', async () => {
    const { store, input, paths } = setupGroupRemote();
    await expect(store.ensureGroupRuntimeIntegration({ ...input, speakerCharacterId: 'outsider' })).rejects.toThrow('不是群组成员');
    input.group.lifecycleStatus = 'archived';
    await expect(store.ensureGroupRuntimeIntegration(input)).rejects.toThrow('已归档');
    expect(paths).toHaveLength(0);
  });

});


