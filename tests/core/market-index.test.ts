/**
 * market-index — 社区市场远程索引引擎 (T-11 / G8) 测试
 *
 * 覆盖：
 * - 合法清单解析通过
 * - 非法 JSON / 缺必填字段(version/updatedAt/items) 拒绝
 * - 条目缺 id/sha256/url 拒绝
 * - verifySha256Hex 哈希校验一致性与篡改检测
 * - 内容类型解析（角色卡 / 世界书 / 模板）
 */
import { describe, it, expect } from 'vitest';
import {
  parseMarketIndex,
  verifySha256Hex,
  parseCharacterItem,
  parseWorldbookItem,
  parseTemplateItem,
  type MarketIndexItem,
  type MarketIndexManifest,
} from '@core/market-index';

function makeItem(overrides: Partial<MarketIndexItem> = {}): MarketIndexItem {
  return {
    id: 'item-1',
    type: 'character',
    name: '测试角色',
    description: '测试描述',
    tags: ['rpg'],
    author: 'tester',
    version: '1.0.0',
    size: 1024,
    sha256: 'a'.repeat(64),
    url: 'https://example.com/card.json',
    ...overrides,
  };
}

function makeManifest(
  items: MarketIndexItem[] = [makeItem()],
  overrides: Partial<MarketIndexManifest> = {}
): MarketIndexManifest {
  return {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    items,
    ...overrides,
  };
}

describe('parseMarketIndex (T-11)', () => {
  it('合法清单解析通过', () => {
    const result = parseMarketIndex(JSON.stringify(makeManifest()));
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.name).toBe('测试角色');
    expect(result!.version).toBe(1);
  });

  it('非法 JSON 拒绝', () => {
    expect(parseMarketIndex('not json')).toBeNull();
  });

  it('缺失 version 拒绝', () => {
    const { version: _v, ...rest } = makeManifest();
    expect(parseMarketIndex(JSON.stringify({ ...rest }))).toBeNull();
  });

  it('缺失 updatedAt 拒绝', () => {
    const { updatedAt: _u, ...rest } = makeManifest();
    expect(parseMarketIndex(JSON.stringify({ ...rest }))).toBeNull();
  });

  it('缺失 items 拒绝', () => {
    const { items: _i, ...rest } = makeManifest();
    expect(parseMarketIndex(JSON.stringify({ ...rest }))).toBeNull();
  });

  it('条目缺 id/sha256/url 拒绝', () => {
    expect(parseMarketIndex(JSON.stringify(makeManifest([makeItem({ id: '' })])))).toBeNull();
    expect(parseMarketIndex(JSON.stringify(makeManifest([makeItem({ sha256: '' })])))).toBeNull();
    expect(parseMarketIndex(JSON.stringify(makeManifest([makeItem({ url: '' })])))).toBeNull();
  });

  it('条目非法 type 回退为 character', () => {
    const result = parseMarketIndex(
      JSON.stringify(makeManifest([{ ...makeItem(), type: 'plugin' as MarketIndexItem['type'] }]))
    );
    expect(result).not.toBeNull();
    expect(result!.items[0]!.type).toBe('character');
  });
});

describe('verifySha256Hex', () => {
  it('校验通过', async () => {
    const bytes = new TextEncoder().encode('hello market');
    // 先用 same 输入计算真实哈希，再验证
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await verifySha256Hex(bytes, hex)).toBe(true);
    // 大小写不敏感
    expect(await verifySha256Hex(bytes, hex.toUpperCase())).toBe(true);
  });

  it('篡改内容 → 校验失败', async () => {
    const data = new TextEncoder().encode('hello market');
    const tampered = new TextEncoder().encode('hello market!');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await verifySha256Hex(tampered, hex)).toBe(false);
  });

  it('非法哈希输入直接拒绝', async () => {
    const bytes = new TextEncoder().encode('x');
    expect(await verifySha256Hex(bytes, 'bad')).toBe(false);
  });
});

describe('内容类型解析', () => {
  it('角色卡需要 name', () => {
    expect(parseCharacterItem({ name: 'Alice', description: 'x' })).not.toBeNull();
    expect(parseCharacterItem({ description: 'x' })).toBeNull();
  });

  it('世界书需要 name 与 entries 数组', () => {
    expect(parseWorldbookItem({ name: 'WB', entries: [] })).not.toBeNull();
    expect(parseWorldbookItem({ name: 'WB' })).toBeNull();
    expect(parseWorldbookItem({ entries: [] })).toBeNull();
  });

  it('模板需要 id 与 name', () => {
    expect(parseTemplateItem({ id: 'fantasy', name: '奇幻' })).not.toBeNull();
    expect(parseTemplateItem({ name: '奇幻' })).toBeNull();
    expect(parseTemplateItem({ id: 'fantasy' })).toBeNull();
  });
});
