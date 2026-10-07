/**
 * E20：远程市场安装结果必须能一跳看到（`installRemoteItem` 返回新角色 id）
 *
 * 此前的返回类型是 boolean：界面拿不到落点，只能弹一句"已安装"，
 * 用户不知道角色去了哪、也没有入口。这里把契约钉成"成功给 id，失败给 null"。
 *
 * 只 mock 网络与卡片解析两层（`@/core/market-index` 的下载、`importV2Card`），
 * 安装链路（去重命名 → push → 记录来源）全走真实实现。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/core/market-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/market-index')>();
  return {
    ...actual,
    downloadMarketItem: vi.fn(async () => ({
      item: { id: 'i1', name: '远程角色', version: '2.1.0', size: 128 },
      // parseCharacterItem 读的是已解析对象（要求 name 为字符串），不是 JSON 文本
      content: { name: '远程角色', description: '来自远程市场的角色' },
    })),
  };
});

vi.mock('@/core/character-card', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/character-card')>();
  return {
    ...actual,
    importV2Card: () => ({
      id: 'remote-card-1',
      name: '远程角色',
      description: '来自远程市场的角色',
      personality: '沉稳',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: [],
      favorite: false,
      version: '2.1.0',
      createdAt: '2026-10-07T00:00:00.000Z',
      updatedAt: '2026-10-07T00:00:00.000Z',
      ext: {},
    }),
  };
});

import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';

function seedRemoteItem(): void {
  const store = useCommunityMarketStore();
  store.remoteItems.push({
    id: 'i1',
    name: '远程角色',
    type: 'character',
    version: '2.1.0',
    author: 'someone',
    size: 128,
    sha256: 'deadbeef',
    url: 'https://example.test/remote-card-1.json',
    description: '',
  } as never);
}

describe('市场安装结果可跳（E20）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('安装成功返回新角色 id，且该角色确实在角色列表里', async () => {
    seedRemoteItem();
    const store = useCommunityMarketStore();

    const installedId = await store.installRemoteItem('i1');

    expect(typeof installedId).toBe('string');
    expect(installedId).not.toBeNull();
    const created = useCharacterStore().characters.find((c) => c.id === installedId);
    expect(created?.name).toBe('远程角色');
    // 更新检查依赖的来源记录不能被这次改动带崩
    expect(store.installedOrigins[installedId!]).toMatchObject({ itemId: 'i1', version: '2.1.0' });
  });

  it('条目不存在与下载失败都返回 null（界面据此不显示"已加入角色列表"）', async () => {
    const store = useCommunityMarketStore();
    expect(await store.installRemoteItem('no-such-item')).toBeNull();

    seedRemoteItem();
    const { downloadMarketItem } = await import('@/core/market-index');
    vi.mocked(downloadMarketItem).mockResolvedValueOnce(null as never);
    expect(await store.installRemoteItem('i1')).toBeNull();
  });

  it('重名安装会改名，返回的 id 指向改名后的那个角色', async () => {
    useCharacterStore().characters.push({
      id: 'existing-same-name',
      name: '远程角色',
      description: '',
      messages: [],
    } as never);
    seedRemoteItem();
    const store = useCommunityMarketStore();

    const installedId = await store.installRemoteItem('i1');
    const created = useCharacterStore().characters.find((c) => c.id === installedId);
    expect(created?.name).not.toBe('远程角色');
    expect(created?.name).toContain('远程角色');
  });
});
