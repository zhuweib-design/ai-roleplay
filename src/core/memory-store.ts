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
      createdAt: this.facts.get(fact.id)!.snapshots[0].updatedAt,
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
      createdAt: history.snapshots[0].updatedAt,
      updatedAt: snap.updatedAt,
    };
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

  /** 列出全部事实 id(供注册表组装) */
  listIds(): string[] {
    return Array.from(this.facts.keys());
  }
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
}
