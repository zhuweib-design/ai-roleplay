/**
 * B6 拆分护栏：community-market store 的行为指纹（拆分前先记，搬完必须同一个值）
 *
 * 为什么要它：B6 是"逐字搬代码"的精简，风险不在算法而在**接线**——
 * 85 行的 return 清单里漏一个成员、工厂之间传 ref 还是传 .value、
 * persistMeta 与 commitTick 的先后顺序，都属于"看起来一样、实际不同"。
 * 单条断言只盯得住一处，这里把整条操作流水压成一个 sha256：
 * 一次改动，任何一处的可观察差异都会让它红。
 *
 * 与 theme-golden 的差别：那里输出是纯函数返回值，这里的可观察面包含
 * 「写了哪些存储键、顺序如何」，所以把 adapter 换成记录型桩件。
 *
 * 判据只记确定性可观测量：
 * - 语言先钉成 zh（`detectLocale()` 读 navigator，钉住后与操作系统无关）；
 * - 新生成实体的 id（`generateId` = 时间戳 36 进制 + 6 位随机）与
 *   `new Date().toISOString()` 归一化成 GEN / D，其余字段原样；
 * - 对象键顺序递归排序后再序列化，避免"属性写法顺序"这种无关差异误伤。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { setActivePinia, createPinia } from 'pinia';
import { setLocale } from '@/i18n';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';
import type { StorageAdapter } from '@storage/storage-adapter';
import type { CharacterCard } from '@core/character-card';

/** 拆分前后必须保持不变的指纹（拆分前 749 行实现与拆分后装配层各跑一次，同值） */
const EXPECTED_FINGERPRINT = 'cd6827baadd1ca8d15bbafcd571b40bd2188ed2ff06095f971115a032d96517f';

// ── 夹具 ──

/** 记录型存储桩件：只实现 store 用到的两个快照方法，并按时序记下每次写 */
function makeStubAdapter(seed: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(seed));
  const writes: string[] = [];
  const adapter = {
    async saveSnapshot(key: string, value: unknown) {
      writes.push(key);
      data.set(key, value);
    },
    async loadSnapshot<T>(key: string) {
      return (data.get(key) as T) ?? null;
    },
  };
  return {
    adapter: adapter as unknown as StorageAdapter,
    writes,
    dump: () => Object.fromEntries([...data.entries()].sort()),
  };
}

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test',
    name: '测试角色',
    avatar: '',
    description: '描述',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── 归一化 ──

/** `generateId` 产物形如 `card_m3k9x2abc123de`：前缀保留，随机尾巴换成 GEN */
function redactIds(value: string): string {
  return value.replace(
    /\b(user|card|tx|review|report)_([a-z0-9]{12,})\b/gi,
    '$1_GEN',
  );
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;

/** 递归排序键，使序列化结果与属性书写顺序无关 */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = canon((value as Record<string, unknown>)[k]);
    return out;
  }
  if (typeof value === 'string') return redactIds(value.replace(ISO_DATE, 'D'));
  return value;
}

describe('community-market store 行为指纹（B6 拆分护栏）', () => {
  let stub: ReturnType<typeof makeStubAdapter>;

  beforeEach(() => {
    localStorage.clear();
    setLocale('zh');
    setActivePinia(createPinia());
    stub = makeStubAdapter();
  });

  it('整条操作流水的指纹与基线一致', async () => {
    const store = useCommunityMarketStore();
    store.setStorageAdapter(stub.adapter);
    store._resetForTesting();

    const log: Record<string, unknown>[] = [];
    /** 每个采样点记录 store 的可观察面（不含引擎内部结构） */
    const sample = (step: string) => {
      log.push({
        step,
        loaded: store.loaded,
        isLoggedIn: store.isLoggedIn,
        user: store.currentUser?.name ?? null,
        userIdShape: store.currentUser ? redactIds(store.currentUser.id) : null,
        search: store.searchQuery,
        tags: [...store.selectedTags],
        categories: [...store.selectedCategories],
        currentCategory: store.currentCategory,
        minRating: store.minRating,
        featuredOnly: store.featuredOnly,
        sortBy: store.sortBy,
        cards: store.filteredCards.map((c) => c.marketId),
        categories4Count: store.allCategories,
        counts: store.categoryCounts,
        tagCount: store.allTags.length,
        stats: store.stats,
        favorites: [...store.favorites],
        lastError: store.lastError,
        lastInfo: store.lastInfo,
        origins: { ...store.installedOrigins },
        progress: Object.keys(store.downloadProgress).sort(),
      });
    };

    sample('00-reset');

    // ── 认证（复用 Mock 用户 / 新建用户 / 重复名冲突 / 登出）──
    expect(store.login('Alice')).toBe(true);
    sample('01-login-existing');
    expect(store.login('指纹用户')).toBe(true);
    sample('02-login-new');
    expect(store.login('Alice')).toBe(true);
    sample('03-login-again');
    store.logout();
    sample('04-logout');

    // ── 未登录的四个拒绝路径 ──
    const first = store.filteredCards[0]?.marketId ?? '';
    expect(store.downloadCard(first)).toBe(false);
    sample('05-download-denied');
    expect(store.publishCard(makeCard())).toBeNull();
    sample('06-publish-denied');
    expect(store.addReview(first, 5, '好')).toBe(false);
    sample('07-review-denied');
    expect(store.reportCard(first, 'spam', '测试')).toBe(false);
    sample('08-report-denied');
    expect(store.getRecommendations()).toEqual([]);
    sample('09-recommend-anon');

    // ── 筛选与排序 ──
    store.login('Alice');
    sample('10-filter-login');
    store.setSearch('剑');
    sample('11-search');
    store.setSearch('');
    store.toggleTag('奇幻');
    sample('12-tag-on');
    store.toggleTag('奇幻');
    store.toggleTag('科幻');
    sample('13-tag-swap');
    store.toggleCategory('奇幻');
    sample('14-category-toggle');
    store.toggleCategory('奇幻');
    store.setCategory('冒险');
    sample('15-category-single');
    store.setCategory('');
    sample('16-category-clear');
    store.setMinRating(4.5);
    sample('17-min-rating');
    store.setMinRating(0);
    store.toggleFeaturedOnly();
    sample('18-featured-only');
    store.toggleFeaturedOnly();
    for (const sort of ['popular', 'rating', 'newest', 'downloads', 'alphabetical'] as const) {
      store.setSortBy(sort);
      sample(`19-sort-${sort}`);
    }
    store.clearFilters();
    sample('20-clear-filters');

    // ── 详情读取 ──
    log.push({ step: '21-detail', ids: store.filteredCards.map((c) => c.marketId) });
    log.push({ step: '22-reviews', count: store.getReviews('card_mc1').length });
    log.push({ step: '23-getCard-missing', isNull: store.getCard('nope') === null });

    // ── 下载 / 收藏 / 推荐 ──
    expect(store.downloadCard('card_mc1')).toBe(true);
    sample('24-download');
    expect(store.downloadCard('card_mc1')).toBe(true);
    sample('25-download-again');
    log.push({ step: '26-history', count: store.getDownloadHistory().length });
    store.logout();
    log.push({ step: '27-history-anon', count: store.getDownloadHistory().length });
    store.login('Alice');
    expect(store.hasDownloaded('card_mc1')).toBe(true);
    store.toggleFavorite('card_mc1');
    sample('28-fav-on');
    store.toggleFavorite('card_mc3');
    sample('29-fav-two');
    store.toggleFavorite('card_mc1');
    sample('30-fav-off');
    store.toggleFavorite('card_mc1');
    log.push({ step: '31-fav-cards', ids: store.getFavoriteCards().map((c) => c.marketId) });
    log.push({ step: '32-preferred', tags: [...store.getPreferredTags()].sort() });
    log.push({ step: '33-recommend', ids: store.getRecommendations({ limit: 4 }).map((r) => r.card.marketId) });
    log.push({ step: '34-recommend-default', count: store.getRecommendations().length });

    // ── 发布（直接发布 + 从角色库发布）──
    const marketId = store.publishCard(makeCard({ name: '指纹卡' }), ['奇幻']);
    sample('35-publish');
    expect(marketId).toBeTruthy();
    useCharacterStore().characters.push({
      id: 'c-fp',
      name: '指纹角色',
      description: '来自角色库',
      avatar: '',
      tags: ['冒险'],
      favorite: false,
      lastActive: '2026-05-05T00:00:00.000Z',
      attributes: {},
      messages: [],
    } as never);
    const fromChar = store.publishCurrentCharacter('c-fp', ['测试']);
    sample('36-publish-from-character');
    log.push({ step: '36b-published-shape', ok: fromChar !== null });
    expect(store.publishCurrentCharacter('no-such-char')).toBeNull();
    sample('37-publish-missing-character');

    // ── 评论 / 举报 / 管理 ──
    expect(store.addReview('card_mc2', 5, '很好的角色卡')).toBe(true);
    sample('38-review');
    expect(store.addReview('card_mc2', 0, '零分')).toBe(false);
    sample('39-review-bad-rating');
    const reviewId = store.getReviews('card_mc2')[0]?.id ?? '';
    store.likeReview(reviewId);
    log.push({ step: '40-like', likes: store.getReviews('card_mc2')[0]?.likes ?? null });

    expect(store.reportCard('card_mc2', 'spam', '垃圾内容')).toBe(true);
    sample('41-report');
    log.push({ step: '42-reports', count: store.getReports().length });
    expect(store.resolveReport('no-such-report', 'resolved', '已核查')).toBe(false);
    sample('43-resolve-missing');

    expect(store.setModerationStatus(marketId!, 'approved')).toBe(true);
    sample('44-moderate');
    expect(store.setFeatured(marketId!, true)).toBe(true);
    sample('45-featured');
    log.push({ step: '46-card-state', status: store.getCard(marketId!)?.moderationStatus, featured: store.getCard(marketId!)?.featured });
    expect(store.setModerationStatus('nope', 'approved')).toBe(false);
    sample('47-moderate-missing');

    // ── 删除（连带移出收藏与落盘）──
    expect(store.deleteCard('card_mc3')).toBe(true);
    sample('48-delete');
    expect(store.deleteCard('card_mc3')).toBe(false);
    sample('49-delete-again');

    // ── 错误清理 ──
    store.clearLastError();
    store.clearLastInfo();
    sample('50-clear-messages');

    // ── 远程域（不联网：手工摆好清单与来源，只验派生与状态位）──
    store.remoteItems.push({
      id: 'r1', name: '远程一', type: 'character', version: '1.0.0',
      author: 'a', size: 10, sha256: 'x', url: 'https://example.test/r1.json', description: '',
    } as never);
    store.remoteItems.push({
      id: 'r2', name: '远程二', type: 'character', version: '2.0.0',
      author: 'a', size: 10, sha256: 'x', url: 'https://example.test/r2.json', description: '',
    } as never);
    store.installedOrigins['c-fp'] = { itemId: 'r1', version: '1.0.0' };
    store.installedOrigins['c-gone'] = { itemId: 'r9', version: '1.0.0' };
    log.push({ step: '51-updatable', list: store.getUpdatableInstalls() });
    log.push({
      step: '52-remote-state',
      items: store.remoteItems.map((i) => i.id),
      loading: store.remoteLoading,
      error: store.remoteError,
    });

    // ── 落盘往返 ──
    store.setStorageAdapter(null);
    void store.persistNow();
    sample('53-persist-without-adapter');
    store.setStorageAdapter(stub.adapter);
    store.login('Alice');
    store.toggleFavorite('card_mc2');
    await store.persistNow();
    sample('54-persist-now');
    store._resetForTesting();
    sample('55-after-reset');
    await store.loadFromDisk();
    sample('56-after-load');
    log.push({ step: '57-storage-keys', keys: [...new Set(stub.writes)].sort() });
    log.push({ step: '58-storage-order', writes: stub.writes });
    log.push({ step: '59-snapshot', snapshot: stub.dump() });

    const transcript = JSON.stringify(canon(log));
    const fingerprint = createHash('sha256').update(transcript).digest('hex');

    // 指纹之外再留一份采样点数：红的时候先看出是不是漏走了一步
    expect({ fingerprint, steps: log.length }).toEqual({
      fingerprint: EXPECTED_FINGERPRINT,
      steps: 65,
    });
  });

  /**
   * 对外成员清单（return 块 85 行的守卫）
   *
   * 指纹只覆盖流水里读过的成员；这里把**全部**对外面钉成字面清单，
   * 拆分时漏掉一个没被流水碰到的成员（如 setFeatured）也会立刻点名。
   */
  it('对外成员清单与基线逐字一致', () => {
    const store = useCommunityMarketStore();
    const PINIA_INTERNALS = new Set(['_customProperties', '_getters', '_hmrPayload', '_hotUpdate', '_p']);
    const keys = Object.keys(store)
      .filter((k) => !k.startsWith('$') && !PINIA_INTERNALS.has(k))
      .sort();
    expect(keys).toEqual([
      '_resetForTesting',
      'addReview',
      'allCategories',
      'allTags',
      'categoryCounts',
      'clearFilters',
      'clearLastError',
      'clearLastInfo',
      'currentCategory',
      'currentUser',
      'deleteCard',
      'downloadCard',
      'downloadProgress',
      'favorites',
      'featuredOnly',
      'filteredCards',
      'getCard',
      'getDownloadHistory',
      'getFavoriteCards',
      'getPreferredTags',
      'getRecommendations',
      'getReports',
      'getReviews',
      'getUpdatableInstalls',
      'hasDownloaded',
      'installRemoteItem',
      'installedOrigins',
      'isFavorite',
      'isLoggedIn',
      'lastError',
      'lastInfo',
      'likeReview',
      'loadFromDisk',
      'loadRemoteIndex',
      'loaded',
      'login',
      'logout',
      'minRating',
      'persistNow',
      'publishCard',
      'publishCurrentCharacter',
      'remoteError',
      'remoteItems',
      'remoteLoading',
      'reportCard',
      'resolveReport',
      'searchQuery',
      'selectedCategories',
      'selectedTags',
      'setCategory',
      'setFeatured',
      'setMinRating',
      'setModerationStatus',
      'setSearch',
      'setSortBy',
      'setStorageAdapter',
      'sortBy',
      'stats',
      'toggleCategory',
      'toggleFavorite',
      'toggleFeaturedOnly',
      'toggleTag',
    ]);
  });
});
