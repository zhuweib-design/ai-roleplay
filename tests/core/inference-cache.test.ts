/**
 * inference-cache 单元测试 (模块2)
 *
 * 覆盖：
 * - LRU 淘汰策略
 * - TTL 过期机制
 * - 缓存键生成
 * - 统计信息
 * - resize / setTtl
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InferenceCache, hashString, buildCacheKey } from '../../src/core/inference-cache';

describe('hashString', () => {
  it('相同输入返回相同哈希', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('不同输入返回不同哈希', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('空字符串返回有效哈希', () => {
    const h = hashString('');
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });

  it('长字符串也能哈希', () => {
    const long = 'a'.repeat(10000);
    expect(hashString(long)).toBeTruthy();
  });
});

describe('buildCacheKey', () => {
  it('相同参数生成相同键', () => {
    const msgs = [{ role: 'user', content: 'hello' }];
    expect(buildCacheKey('model-a', msgs, 0.7)).toBe(buildCacheKey('model-a', msgs, 0.7));
  });

  it('不同模型 ID 生成不同键', () => {
    const msgs = [{ role: 'user', content: 'hello' }];
    expect(buildCacheKey('model-a', msgs, 0.7)).not.toBe(buildCacheKey('model-b', msgs, 0.7));
  });

  it('不同温度生成不同键', () => {
    const msgs = [{ role: 'user', content: 'hello' }];
    expect(buildCacheKey('model-a', msgs, 0.7)).not.toBe(buildCacheKey('model-a', msgs, 0.8));
  });

  it('不同消息生成不同键', () => {
    expect(buildCacheKey('model-a', [{ role: 'user', content: 'a' }], 0.7))
      .not.toBe(buildCacheKey('model-a', [{ role: 'user', content: 'b' }], 0.7));
  });
});

describe('InferenceCache', () => {
  let cache: InferenceCache<string>;

  beforeEach(() => {
    cache = new InferenceCache<string>(3, 60000);
  });

  describe('基本读写', () => {
    it('写入后可读取', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('未写入的键返回 null', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('delete 后不可读取', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('delete 不存在的键返回 false', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('clear 清空所有', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('LRU 淘汰', () => {
    it('超出容量时淘汰最久未访问的', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      // 访问 a，使其成为最近使用
      cache.get('a');
      // 写入 d，应淘汰 b（最久未访问）
      cache.set('d', '4');

      expect(cache.get('a')).toBe('1'); // 仍存在
      expect(cache.get('b')).toBeNull(); // 被淘汰
      expect(cache.get('c')).toBe('3'); // 仍存在
      expect(cache.get('d')).toBe('4'); // 新写入
    });

    it('覆盖已存在的键不增加条目数', () => {
      cache.set('a', '1');
      cache.set('a', '2');
      expect(cache.getStats().size).toBe(1);
      expect(cache.get('a')).toBe('2');
    });

    it('容量为 1 时只保留最新', () => {
      const small = new InferenceCache<string>(1);
      small.set('a', '1');
      small.set('b', '2');
      expect(small.get('a')).toBeNull();
      expect(small.get('b')).toBe('2');
    });
  });

  describe('TTL 过期', () => {
    it('过期条目返回 null', () => {
      const shortTtl = new InferenceCache<string>(10, 50); // 50ms TTL
      shortTtl.set('key', 'value');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortTtl.get('key')).toBeNull();
          resolve();
        }, 60);
      });
    });

    it('未过期条目仍可读取', () => {
      const longTtl = new InferenceCache<string>(10, 5000);
      longTtl.set('key', 'value');
      expect(longTtl.get('key')).toBe('value');
    });

    it('purgeExpired 清理过期条目', () => {
      const shortTtl = new InferenceCache<string>(10, 50);
      shortTtl.set('a', '1');
      shortTtl.set('b', '2');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const purged = shortTtl.purgeExpired();
          expect(purged).toBe(2);
          expect(shortTtl.getStats().size).toBe(0);
          resolve();
        }, 60);
      });
    });
  });

  describe('统计信息', () => {
    it('初始统计全为 0', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.totalWrites).toBe(0);
      expect(stats.totalEvictions).toBe(0);
    });

    it('写入后 totalWrites 增加', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.getStats().totalWrites).toBe(2);
    });

    it('命中时 totalHits 增加', () => {
      cache.set('a', '1');
      cache.get('a');
      expect(cache.getStats().totalHits).toBe(1);
    });

    it('未命中时 totalMisses 增加', () => {
      cache.get('nonexistent');
      expect(cache.getStats().totalMisses).toBe(1);
    });

    it('hitRate 正确计算', () => {
      cache.set('a', '1');
      cache.get('a'); // 命中
      cache.get('b'); // 未命中
      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.5);
    });

    it('淘汰时 totalEvictions 增加', () => {
      const small = new InferenceCache<string>(2);
      small.set('a', '1');
      small.set('b', '2');
      small.set('c', '3'); // 淘汰 a
      expect(small.getStats().totalEvictions).toBe(1);
    });

    it('maxCapacity 反映构造参数', () => {
      expect(cache.getStats().maxCapacity).toBe(3);
    });
  });

  describe('resize', () => {
    it('扩大容量不影响现有条目', () => {
      cache.set('a', '1');
      cache.resize(10);
      expect(cache.get('a')).toBe('1');
      expect(cache.getStats().maxCapacity).toBe(10);
    });

    it('缩小容量时淘汰多余条目', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.resize(1);
      expect(cache.getStats().size).toBe(1);
      // a 和 b 被淘汰，c 是最新的
      expect(cache.get('c')).toBe('3');
    });

    it('resize 为 0 或负数无效', () => {
      cache.set('a', '1');
      cache.resize(0);
      expect(cache.getStats().maxCapacity).toBe(3);
      expect(cache.get('a')).toBe('1');
    });
  });

  describe('setTtl', () => {
    it('更新 TTL 后新条目使用新 TTL', () => {
      cache.setTtl(30); // 30ms
      cache.set('a', '1');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('a')).toBeNull();
          resolve();
        }, 40);
      });
    });
  });

  describe('LRU 访问顺序更新', () => {
    it('get 后条目成为最近使用', () => {
      const small = new InferenceCache<string>(2);
      small.set('a', '1');
      small.set('b', '2');
      // 访问 a，使其成为最近使用
      small.get('a');
      // 写入 c，应淘汰 b
      small.set('c', '3');
      expect(small.get('a')).toBe('1');
      expect(small.get('b')).toBeNull();
      expect(small.get('c')).toBe('3');
    });
  });
});
