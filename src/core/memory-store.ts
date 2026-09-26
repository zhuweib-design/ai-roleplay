/**
 * L0 上下文结构层核心 (E-01)
 *
 * 依据《AI酒馆项目嵌入优化方案开发文档.md》L0 设计,落地为纯 TS 模块:
 * - MemoryStore:版本化记忆存储(稳定 ID + 单调修订号 + 快照 + diff + 恢复)
 * - CharacterRegistry:角色卡前缀组装(standing 常驻段字节稳定 + 前缀哈希对比)
 * - EmotionTracker:会话级情绪状态机(独立存储,fail-open)
 * - 写保护:standing 事实仅允许人工写(存储层硬约束,非提示词软约束)
 *
 * 设计:
 * - 纯逻辑 + 内存存储,持久化由调用方接 storage 层(IndexedDB/Rust fs)
 * - 快照不可变:每次 put 生成新修订号,历史可回溯
 */

import { t } from '@/i18n';

// ── 类型 ──

/** 记忆作用域:standing=常驻指令(仅人工写),scoped=作用域事实(优化器可写) */
export type MemoryScope = 'standing' | 'scoped';

/** 记忆类型 */
export type MemoryKind = 'character' | 'world' | 'emotion' | 'session';

/** 记忆事实 */
export interface MemoryFact {
  /** 稳定 ID('char-<hex>' 等,改名不变) */
  id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  body: string;
  /** 单调递增修订号(从 1 开始) */
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/** 修订元信息(快照列表项) */
export interface RevisionMeta {
  revision: number;
  updatedAt: number;
  /** 写入者:人工或优化器(用于审计静默改写) */
  author: 'human' | 'optimizer';
}

/** 会话情绪状态 */
export interface EmotionState {
  label: string;
  reason: string;
  updatedAt: number;
  revision: number;
}

/** 记忆存储的可持久化快照格式。版本字段用于未来迁移。 */
export interface SerializedMemoryStore {
  version: 1;
  facts: Array<{
    id: string;
    scope: MemoryScope;
    kind: MemoryKind;
    snapshots: Array<{
      revision: number;
      body: string;
      updatedAt: number;
      author: 'human' | 'optimizer';
    }>;
  }>;
}

export interface MemorySearchOptions {
  scope?: MemoryScope;
  kind?: MemoryKind;
  limit?: number;
}

export interface MemorySearchResult {
  fact: MemoryFact;
  score: number;
}

/** 前缀组装结果 */
export interface AssembledPrefix {
  /** 组装后的前缀文本(字节稳定:同输入必同输出) */
  text: string;
  /** 前缀 SHA-256(十六进制),用于每请求对比 */
  hash: string;
}

// ── 工具 ──

/** 计算文本 SHA-256 十六进制 */
export async function textSha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── MemoryStore ──

/** 单条记忆的版本历史 */
interface FactHistory {
  id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  snapshots: Array<{ revision: number; body: string; updatedAt: number; author: 'human' | 'optimizer' }>;
}

/**
 * 版本化记忆存储(内存实现)
 * 职责:原子写(修订+1)、按修订读、快照列表、恢复、diff 审计
 */
export class MemoryStore {
  private facts = new Map<string, FactHistory>();

  /** 写入事实(原子:修订号 +1,快照追加) */
  async put(
    fact: Omit<MemoryFact, 'revision' | 'createdAt' | 'updatedAt'>,
    author: 'human' | 'optimizer' = 'human'
  ): Promise<MemoryFact> {
    const now = Date.now();
    const history = this.facts.get(fact.id);
    const revision = (history?.snapshots[history.snapshots.length - 1]?.revision ?? 0) + 1;

    // 写保护:standing 仅人工可写(E-01 硬约束)
    if (fact.scope === 'standing' && author !== 'human') {
      throw new Error(t('core.memoryWriteProtected', { id: fact.id }));
    }

    if (!history) {
      this.facts.set(fact.id, {
        id: fact.id,
        scope: fact.scope,
        kind: fact.kind,
        snapshots: [],
      });
    }
    this.facts.get(fact.id)!.snapshots.push({
      revision,
      body: fact.body,
      updatedAt: now,
      author,
    });

    return {
      id: fact.id,
      scope: fact.scope,
      kind: fact.kind,
      body: fact.body,
      revision,
      createdAt: this.facts.get(fact.id)!.snapshots[0]!.updatedAt,
      updatedAt: now,
    };
  }

  /** 读取指定修订版本(缺省最新) */
  async get(mid: string, revision?: number): Promise<MemoryFact | null> {
    const history = this.facts.get(mid);
    if (!history) return null;
    const snap = revision
      ? history.snapshots.find((s) => s.revision === revision)
      : history.snapshots[history.snapshots.length - 1];
    if (!snap) return null;
    return {
      id: history.id,
      scope: history.scope,
      kind: history.kind,
      body: snap.body,
      revision: snap.revision,
      createdAt: history.snapshots[0]!.updatedAt,
      updatedAt: snap.updatedAt,
    };
  }

  /** 列出当前修订的事实。返回值按更新时间倒序，避免暴露内部快照引用。 */
  async listFacts(options: Pick<MemorySearchOptions, 'scope' | 'kind'> = {}): Promise<MemoryFact[]> {
    const facts: MemoryFact[] = [];
    for (const id of this.facts.keys()) {
      const fact = await this.get(id);
      if (!fact) continue;
      if (options.scope && fact.scope !== options.scope) continue;
      if (options.kind && fact.kind !== options.kind) continue;
      facts.push(fact);
    }
    return facts.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  /**
   * 从本地查询中挑选相关事实。
   *
   * 这是轻量级的确定性检索，用于没有向量模型时的本地降级链路；
   * 向量 RAG 仍可在更大的语料上提供语义召回。结果不修改事实本身。
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const facts = await this.listFacts(options);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return facts.slice(0, Math.max(0, options.limit ?? facts.length)).map((fact) => ({ fact, score: 0 }));
    }

    const queryTerms = memoryTerms(normalizedQuery);
    const scored: MemorySearchResult[] = [];
    for (const fact of facts) {
      const body = fact.body.toLocaleLowerCase();
      const matchedTerms = queryTerms.filter((term) => body.includes(term));
      const exact = body.includes(normalizedQuery) ? 1 : 0;
      const score = exact * 2 + matchedTerms.length / Math.max(1, queryTerms.length);
      if (score > 0) scored.push({ fact, score });
    }

    scored.sort((a, b) => b.score - a.score || b.fact.updatedAt - a.fact.updatedAt || a.fact.id.localeCompare(b.fact.id));
    return scored.slice(0, Math.max(0, options.limit ?? 8));
  }

  /** 修订快照列表(新→旧) */
  async revisions(mid: string): Promise<RevisionMeta[]> {
    const history = this.facts.get(mid);
    if (!history) return [];
    return [...history.snapshots]
      .reverse()
      .map((s) => ({ revision: s.revision, updatedAt: s.updatedAt, author: s.author }));
  }

  /** 恢复到指定修订(作为新修订写入,保留审计链) */
  async restore(mid: string, revision: number): Promise<MemoryFact | null> {
    const history = this.facts.get(mid);
    if (!history) return null;
    const snap = history.snapshots.find((s) => s.revision === revision);
    if (!snap) return null;
    return this.put(
      { id: history.id, scope: history.scope, kind: history.kind, body: snap.body },
      'human'
    );
  }

  /** diff 审计:两修订之间逐行差异(简单行级) */
  async diff(mid: string, revA: number, revB: number): Promise<string[]> {
    const history = this.facts.get(mid);
    if (!history) return [];
    const a = history.snapshots.find((s) => s.revision === revA)?.body ?? '';
    const b = history.snapshots.find((s) => s.revision === revB)?.body ?? '';
    const linesA = a.split('\n');
    const linesB = b.split('\n');
    const out: string[] = [];
    const max = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < max; i++) {
      if (linesA[i] !== linesB[i]) {
        out.push(t('core.diffLine', { index: i + 1, from: linesA[i] ?? t('core.diffNone'), to: linesB[i] ?? t('core.diffNone') }));
      }
    }
    return out;
  }

  /** 导出不含内部 Map 的可持久化快照。 */
  toJSON(): SerializedMemoryStore {
    return {
      version: 1,
      facts: Array.from(this.facts.values()).map((history) => ({
        id: history.id,
        scope: history.scope,
        kind: history.kind,
        snapshots: history.snapshots.map((snapshot) => ({ ...snapshot })),
      })),
    };
  }

  /**
   * 导入快照。损坏的单条记录会被跳过，整个快照不会阻塞聊天主链路。
   * 导入前替换当前内容，避免残留已经删除的事实。
   */
  fromJSON(value: unknown): void {
    const parsed = parseSerializedMemoryStore(value);
    if (!parsed) return;
    this.facts.clear();
    for (const history of parsed.facts) {
      this.facts.set(history.id, {
        id: history.id,
        scope: history.scope,
        kind: history.kind,
        snapshots: history.snapshots.map((snapshot) => ({ ...snapshot })),
      });
    }
  }

  /** 清空当前存储，主要用于切换账户或测试隔离。 */
  clear(): void {
    this.facts.clear();
  }

  /** 列出全部事实 id(供注册表组装) */
  listIds(): string[] {
    return Array.from(this.facts.keys());
  }
}

function memoryTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const token of text.match(/[a-z0-9]+/gi) ?? []) {
    if (token.length >= 2) terms.add(token.toLocaleLowerCase());
  }
  const cjk = text.replace(/[^\u3400-\u9fff]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) terms.add(cjk.slice(i, i + 2));
  for (let i = 0; i < cjk.length - 2; i++) terms.add(cjk.slice(i, i + 3));
  return Array.from(terms);
}

function parseSerializedMemoryStore(value: unknown): SerializedMemoryStore | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { version?: unknown; facts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.facts)) return null;
  const facts: SerializedMemoryStore['facts'] = [];
  for (const candidate of raw.facts) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      (item.scope !== 'standing' && item.scope !== 'scoped') ||
      !['character', 'world', 'emotion', 'session'].includes(String(item.kind)) ||
      !Array.isArray(item.snapshots)
    ) continue;
    const snapshots = item.snapshots
      .filter((snapshot): snapshot is Record<string, unknown> => !!snapshot && typeof snapshot === 'object')
      .filter((snapshot) =>
        Number.isSafeInteger(snapshot.revision) &&
        (snapshot.revision as number) > 0 &&
        typeof snapshot.body === 'string' &&
        Number.isFinite(snapshot.updatedAt) &&
        (snapshot.author === 'human' || snapshot.author === 'optimizer')
      )
      .map((snapshot) => ({
        revision: snapshot.revision as number,
        body: snapshot.body as string,
        updatedAt: snapshot.updatedAt as number,
        author: snapshot.author as 'human' | 'optimizer',
      }))
      .sort((a, b) => a.revision - b.revision);
    if (snapshots.length === 0) continue;
    facts.push({
      id: item.id,
      scope: item.scope as MemoryScope,
      kind: item.kind as MemoryKind,
      snapshots,
    });
  }
  return { version: 1, facts };
}

// ── CharacterRegistry ──

/**
 * 角色卡前缀组装器
 * 按固定顺序拼接:base → standing 角色事实 → standing 世界观事实;
 * scoped 事实不进入前缀(动态段)。同输入必同输出(字节稳定)。
 */
export class CharacterRegistry {
  constructor(private readonly store: MemoryStore) {}

  /**
   * 组装字节稳定前缀
   * @param base 固定基础段(如系统提示词头部)
   * @param sessionId 会话 ID(可选):仅组装该会话的 standing 事实
   *   (id 前缀 `char-${sessionId}` / `world-${sessionId}`);
   *   缺省组装全部 standing 事实(单会话/全局场景)
   */
  async assemblePrefix(base: string, sessionId?: string): Promise<AssembledPrefix> {
    const all = (await Promise.all(
      this.store.listIds().map((id) => this.store.get(id))
    )).filter((f): f is MemoryFact => f !== null && f.scope === 'standing');

    const standingFacts = sessionId
      ? all.filter((f) => f.id === `char-${sessionId}` || f.id === `world-${sessionId}`)
      : all;

    // 稳定排序(按 id)保证与写入顺序无关
    const ordered = [...standingFacts].sort((a, b) => a.id.localeCompare(b.id));
    const parts = [base, ...ordered.map((f) => `【${f.kind}】${f.body}`)];
    const text = parts.join('\n');
    return { text, hash: await textSha256(text) };
  }

  /** 对比前缀哈希是否稳定(变化即告警,E-01 验收指标) */
  isStable(prev: string, curr: string): boolean {
    return prev === curr;
  }
}

// ── EmotionTracker ──

/**
 * 会话级情绪状态机
 * - 独立于角色卡存储(session 维度)
 * - 写失败静默沿用旧状态(fail-open,绝不影响主回复链路)
 * - 修订号递增,支持回看
 */
export class EmotionTracker {
  private states = new Map<string, EmotionState>();

  /** 读取当前情绪状态 */
  async current(sessionId: string): Promise<EmotionState | null> {
    return this.states.get(sessionId) ?? null;
  }

  /** 更新情绪状态(失败静默,返回是否成功) */
  async update(
    sessionId: string,
    label: string,
    reason: string
  ): Promise<boolean> {
    try {
      const prev = this.states.get(sessionId);
      this.states.set(sessionId, {
        label,
        reason,
        updatedAt: Date.now(),
        revision: (prev?.revision ?? 0) + 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** 导出情绪状态，供本地会话快照持久化。 */
  toJSON(): Record<string, EmotionState> {
    return Object.fromEntries(
      Array.from(this.states.entries()).map(([id, state]) => [id, { ...state }])
    );
  }

  /** 从快照恢复情绪状态；非法条目跳过。 */
  fromJSON(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    this.states.clear();
    for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const state = raw as Partial<EmotionState>;
      if (
        typeof state.label === 'string' &&
        typeof state.reason === 'string' &&
        Number.isFinite(state.updatedAt) &&
        Number.isSafeInteger(state.revision) &&
        (state.revision as number) > 0
      ) {
        this.states.set(id, {
          label: state.label,
          reason: state.reason,
          updatedAt: state.updatedAt as number,
          revision: state.revision as number,
        });
      }
    }
  }
}
