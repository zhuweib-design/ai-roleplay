/**
 * market-index — 社区市场 v1 索引 (T-11) 测试
 *
 * 覆盖：
 * - 合法清单解析通过
 * - 非法条目逐字段拒绝(version/url/sha256/size/type)
 * - 版本不匹配、重复 id 拒绝
 * - sha256Hex 与 verifyMarketItemHash 校验
 */
import { describe, it, expect } from 'vitest';
import {
  MARKET_INDEX_VERSION,
  validateMarketIndex,
  validateMarketItem,
  sha256Hex,
  verifyMarketItemHash,
  type MarketIndexItem,
} from '@core/market-index';

function makeItem(overrides: Partial<MarketIndexItem> = {}): MarketIndexItem {
  return {
    id: 'item-1',
    type: 'character',
    name: '测试角色',
    version: '1.0.0',
    author: 'tester',
    url: 'https://example.com/card.json',
    sha256: 'a'.repeat(64),
    size: 1024,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeIndex(items: unknown[] = [makeItem()]) {
  return { version: MARKET_INDEX_VERSION, name: '测试市场', items };
}

describe('market-index (T-11)', () => {
  it('合法清单解析通过', () => {
    const result = validateMarketIndex(makeIndex());
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('版本不匹配拒绝', () => {
    const result = validateMarketIndex({ ...makeIndex(), version: 99 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('版本');
  });

  it('缺少 items 拒绝', () => {
    const result = validateMarketIndex({ version: MARKET_INDEX_VERSION, name: 'x' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('items'))).toBe(true);
  });

  it('重复 id 拒绝', () => {
    const result = validateMarketIndex(
      makeIndex([makeItem(), makeItem({ name: '重复名' })])
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it.each([
    ['http url', { url: 'http://example.com/x.json' }],
    ['非法 sha256', { sha256: 'zz'.repeat(32) }],
    ['短 sha256', { sha256: 'abc' }],
    ['非法 size', { size: -1 }],
    ['非法 version', { version: 'v1' }],
    ['非法 type', { type: 'plugin' }],
  ])('非法条目拒绝:%s', (_label, override) => {
    const errors = validateMarketItem(makeItem(override as Partial<MarketIndexItem>), 0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('sha256Hex 与 verifyMarketItemHash 一致', async () => {
    const data = new TextEncoder().encode('hello market').buffer;
    const hex = await sha256Hex(data);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);

    expect(await verifyMarketItemHash({ sha256: hex }, data)).toBe(true);
    // 篡改内容 → 校验失败
    const tampered = new TextEncoder().encode('hello market!').buffer;
    expect(await verifyMarketItemHash({ sha256: hex }, tampered)).toBe(false);
    // 非法哈希输入直接拒绝
    expect(await verifyMarketItemHash({ sha256: 'bad' }, data)).toBe(false);
  });
});