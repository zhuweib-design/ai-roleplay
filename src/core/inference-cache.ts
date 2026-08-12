/**
 * 推理结果缓存 (模块2 · 本地模型推理)
 *
 * LRU + TTL 双重策略：
 * - LRU：超出容量时淘汰最久未访问的条目
 * - TTL：条目超过存活时间后视为过期
 *
 * 缓存键：由 prompt + modelId + temperature 生成的哈希
 */

// ── 类型 ──

export interface CacheEntry<T> {
  /** 缓存键 */
  key: string;
  /** 缓存值 */
  value: T;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后访问时间戳 */
  accessedAt: number;
  /** 命中次数 */
  hitCount: number;
}

export interface CacheStats {
  /** 当前条目数 */
  size: number;
  /** 最大容量 */
  maxCapacity: number;
  /** 累计命中次数 */
  totalHits: number;
  /** 累计未命中次数 */
  totalMisses: number;
  /** 命中率（0-1） */
  hitRate: number;
  /** 累计写入次数 */
  totalWrites: number;
  /** 累计淘汰次数 */
  totalEvictions: number;
}

// ── 哈希工具 ──

/**
 * 简单的字符串哈希（djb2 变体）
 * 用于生成缓存键，非密码学用途。
 */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * 生成推理缓存键
 *
 * @param modelId 模型 ID
 * @param messages 消息列表
 * @param temperature 温度参数
 */
export function buildCacheKey(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number
): string {
  const msgHash = hashString(
    messages.map((m) => `${m.role}:${m.content}`).join('\n')
  );
  return `${modelId}|${msgHash}|${temperature.toFixed(2)}`;
}

// ── LRU + TTL 缓存 ──

/**
 * LRU + TTL 推理结果缓存
 */
export class InferenceCache<T = string> {
  private entries = new Map<string, CacheEntry<T>>();
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    totalWrites: 0,
    totalEvictions: 0,
  };

  constructor(
    private readonly maxCapacity: number = 50,
    private readonly ttlMs: number = 30 * 60 * 1000 // 30 分钟
  ) {}

  /**
   * 获取缓存值（命中时更新访问时间）
   */
  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.totalMisses++;
      return null;
    }

    // TTL 过期检查
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      this.stats.totalMisses++;
      return null;
    }

    // LRU：移到末尾（Map 保持插入顺序，最新访问放末尾）
    this.entries.delete(key);
    entry.accessedAt = Date.now();
    entry.hitCount++;
    this.entries.set(key, entry);
    this.stats.totalHits++;
    return entry.value;
  }

  /**
   * 写入缓存（超出容量时淘汰最旧的）
   */
  set(key: string, value: T): void {
    // 若已存在则先删除（更新为最新）
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // 容量淘汰
    while (this.entries.size >= this.maxCapacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
      this.stats.totalEvictions++;
    }

    const now = Date.now();
    this.entries.set(key, {
      key,
      value,
      createdAt: now,
      accessedAt: now,
      hitCount: 0,
    });
    this.stats.totalWrites++;
  }

  /**
   * 删除指定键
   */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * 清理已过期条目
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const total = this.stats.totalHits + this.stats.totalMisses;
    return {
      size: this.entries.size,
      maxCapacity: this.maxCapacity,
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      hitRate: total > 0 ? this.stats.totalHits / total : 0,
      totalWrites: this.stats.totalWrites,
      totalEvictions: this.stats.totalEvictions,
    };
  }

  /**
   * 更新容量（保留最新条目）
   */
  resize(newCapacity: number): void {
    if (newCapacity <= 0) return;
    (this as unknown as { maxCapacity: number }).maxCapacity = newCapacity;
    while (this.entries.size > newCapacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
      this.stats.totalEvictions++;
    }
  }

  /**
   * 更新 TTL
   */
  setTtl(ttlMs: number): void {
    if (ttlMs > 0) {
      (this as unknown as { ttlMs: number }).ttlMs = ttlMs;
    }
  }
}
