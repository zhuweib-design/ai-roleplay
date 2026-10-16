/**
 * 会话索引装载窗口回归（M14-b，M9-a 同形状）
 *
 * `loadAllSessions` 原来是整表替换：磁盘读到的快照直接盖掉 sessions。boot 之外它还会
 * 在角色数量变化时被 CharacterList 再次触发，那时索引并不空——窗口内用户的置顶/归档/
 * 改名（不推进 updatedAt 的原地改）、删除、以及 persistChat 刚同步进索引的新会话，
 * 都会被替换连磁盘读旧值一起盖掉。现在改为合并：窗口前就存在的 id 以内存版本为准。
 *
 * 断言方式：第二遍装载时把 loadChats 挂起（磁盘快照已到手、落地被挡住），在窗口内
 * 做四种用户动作，放行后逐条验收。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatSessionStore } from '../../src/stores/chat-session';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { Chat } from '../../src/storage/types';

function makeChat(id: string, characterId: string, updatedAt: string, opts: Partial<Chat> = {}): Chat {
  return {
    id,
    characterId,
    title: `会话 ${id}`,
    messages: [
      {
        id: `${id}-m1`,
        role: 'user',
        content: `来自 ${id} 的消息`,
        timestamp: updatedAt,
        swipes: [],
        swipeIndex: 0,
      },
    ],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
    ...opts,
  };
}

async function freshStore(dbName: string) {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  const adapter = new IndexedDBAdapter(dbName);
  await adapter.init();
  const store = useChatSessionStore();
  store.setStorageAdapter(adapter);
  return { adapter, store };
}

describe('loadAllSessions 装载窗口内的用户动作不被盖掉', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('窗口内置顶/改名/删除/新建在装载落地后全部保留', async () => {
    const { adapter, store } = await freshStore('test-load-window');
    await adapter.saveChat(makeChat('chat-a', 'c1', '2026-10-05T00:00:00.000Z', { title: '旧标题甲' }));
    await adapter.saveChat(makeChat('chat-b', 'c1', '2026-10-04T00:00:00.000Z', { title: '旧标题乙' }));
    await adapter.saveChat(makeChat('chat-c', 'c1', '2026-10-03T00:00:00.000Z'));

    // 第一遍装载 = boot，索引进入"非空"状态（这是第二遍装载会盖东西的前提）
    await store.loadAllSessions(['c1']);
    expect(store.sessions.map((s) => s.id)).toEqual(['chat-a', 'chat-b', 'chat-c']);

    // 第二遍装载：磁盘快照在 loadChats 里就已到手，落地（整表替换）被挂起挡住
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const orig = adapter.loadChats.bind(adapter);
    vi.spyOn(adapter, 'loadChats').mockImplementation(async (cid: string) => {
      const list = await orig(cid);
      await held;
      return list;
    });
    const loading = store.loadAllSessions(['c1']);

    // ── 窗口内的四种动作（与真实写入函数同形）──
    await store.togglePin('chat-a'); // 原地改 pinned，不推进 updatedAt
    await store.renameSession('chat-b', '新标题乙'); // 原地改 title
    await store.deleteSession(null, 'chat-c'); // 直接移除
    store.sessions.push(makeChat('chat-new', 'c1', '2026-10-06T00:00:00.000Z')); // persistChat 的索引同步

    release();
    await loading;

    const byId = new Map(store.sessions.map((s) => [s.id, s]));
    expect(byId.get('chat-a')?.pinned, '置顶被整表替换盖回去了').toBe(true);
    expect(byId.get('chat-b')?.title, '改名被整表替换盖回去了').toBe('新标题乙');
    expect(byId.has('chat-c'), '窗口内删除的会话被磁盘快照复活了').toBe(false);
    expect(byId.has('chat-new'), '窗口内新建的会话被整表替换弄丢了').toBe(true);

    await adapter.close();
  });

  it('负向对照：窗口内什么都没发生时，装载结果与磁盘一致（合并不扭曲正常路径）', async () => {
    const { adapter, store } = await freshStore('test-load-window-clean');
    await adapter.saveChat(makeChat('chat-x', 'c1', '2026-10-05T00:00:00.000Z'));
    await adapter.saveChat(makeChat('chat-y', 'c2', '2026-10-04T00:00:00.000Z'));

    await store.loadAllSessions(['c1', 'c2']);
    // 第二遍装载：改 updatedAt 的落盘写入（persistChat 形态）也必须不丢
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const orig = adapter.loadChats.bind(adapter);
    vi.spyOn(adapter, 'loadChats').mockImplementation(async (cid: string) => {
      const list = await orig(cid);
      await held;
      return list;
    });
    const loading = store.loadAllSessions(['c1', 'c2']);
    // persistChat 形态：整条替换并推进 updatedAt（消息变了）
    const idx = store.sessions.findIndex((s) => s.id === 'chat-x');
    store.sessions[idx] = makeChat('chat-x', 'c1', '2026-10-07T00:00:00.000Z', {
      title: '带新消息的标题',
    });
    release();
    await loading;

    expect(store.sessions.map((s) => s.id)).toEqual(['chat-x', 'chat-y']);
    expect(store.sessions[0]!.title).toBe('带新消息的标题');

    await adapter.close();
  });
});
