/**
 * 可选下载包的真实安装链路
 *
 * `tests/stores/community-market-install.test.ts` 把 `importV2Card` 也 mock 掉了，
 * 于是它只证明「store 收下 id 后怎么记账」，证明不了「市场里的卡真能被装进来」。
 * 2026-11-05 加这条测试时正好抓到一个真问题：`parseCharacterItem` 只认顶层 `name`，
 * 而 `market/cards/*.json` 全是 V2 卡（名字在 `data.name`），用户点下载会在
 * 校验通过之后才报“角色卡格式无效”。
 *
 * 这里只桩下载（不联网），解析、导入、去重、落库全走真实实现，并用仓库里的实际卡文件。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';

const CARDS_DIR = path.resolve(import.meta.dirname, '../../market/cards');

vi.mock('@/core/market-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/market-index')>();
  return {
    ...actual,
    downloadMarketItem: vi.fn(),
  };
});

import { downloadMarketItem } from '@/core/market-index';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';

/** 让下载返回仓库里某张真实卡的内容（字节与哈希校验由下载层负责，这里不重复） */
function stubDownloadWithCard(file: string) {
  const rawText = readFileSync(path.join(CARDS_DIR, file), 'utf8');
  vi.mocked(downloadMarketItem).mockResolvedValueOnce({
    item: { id: 'i1', name: '林晚', version: '1.0.0', size: rawText.length },
    rawText,
    content: JSON.parse(rawText),
  } as never);
}

describe('可选下载包：真实卡文件的安装链路', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('V2 形状的市场卡能被装进角色库，并带上开场白', async () => {
    const store = useCommunityMarketStore();
    store.remoteItems.push({
      id: 'i1',
      type: 'character',
      name: '林晚 · 深夜电台',
      description: '',
      tags: [],
      author: 'ai-roleplay',
      version: '1.0.0',
      size: 0,
      sha256: 'x',
      url: 'https://example.test/lin-wan.json',
      license: 'Apache-2.0',
    } as never);
    stubDownloadWithCard('lin-wan.json');

    const installedId = await store.installRemoteItem('i1');

    expect(installedId).not.toBeNull();
    const created = useCharacterStore().characters.find((c) => c.id === installedId);
    expect(created?.name).toBe('林晚');
    // 开场白落在 messages[0]，否则下载来的角色点进对话是空白
    expect(created?.messages[0]?.content).toContain('FM 92.7');
  });
});
