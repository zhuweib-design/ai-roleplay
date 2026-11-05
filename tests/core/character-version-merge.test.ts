/**
 * 合并域自由函数 —— R4-11 拆分后的独立测试
 *
 * 拆分前 findCommonAncestor / mergeBranch / resolveConflicts 是
 * CharacterRepository 的实例方法，只能先造一个完整仓库（含分支、锁、
 * 序列化状态）才能测合并逻辑。提到 character-version-merge.ts 后，
 * 这三个函数只吃 `commits` / `branches` / `currentBranch` 三份纯数据，
 * 可以直接用 Map 手工搭场景 —— 本文件就是在验证这个解耦是真的：
 * **全程不 new CharacterRepository，一次也不**。
 *
 * 另一层意义是回归保护：repository 侧现在只剩三行转发，
 * 若转发参数顺序写错（commits / branches / currentBranch / sourceBranch），
 * 原有 79 条测试里凡是走仓库入口的都能抓到；但若有人把自由函数本身改坏，
 * 这批测试能定位到具体函数而不是「mergeBranch 结果不对」。
 */
import { describe, it, expect } from 'vitest';

import {
  findCommonAncestor,
  mergeBranch,
  resolveConflicts,
  type BranchMap,
  type CommitMap,
} from '@core/character-version-merge';
import type {
  BranchName,
  CharacterBranch,
  CharacterVersion,
  VersionId,
} from '@core/character-version-types';
import type { CharacterCard } from '@core/character-card';

const AUTHOR = { name: 'Tester' };

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'char-1',
    name: '初始角色',
    avatar: '',
    description: '基础描述',
    personality: '冷静',
    scenario: '荒野',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: ['默认'],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeVersion(
  id: VersionId,
  parentId: VersionId | null,
  branch: BranchName,
  snapshot: CharacterCard
): CharacterVersion {
  return {
    id,
    parentId,
    branch,
    author: AUTHOR,
    timestamp: '2026-01-01T00:00:00.000Z',
    message: `commit ${id}`,
    snapshot,
  };
}

function makeBranch(name: BranchName, headId: VersionId | null): CharacterBranch {
  return {
    name,
    headId,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: AUTHOR,
    isDefault: name === 'main',
    locked: false,
  };
}

/**
 * 搭一条链：v1 ← v2 ← v3 …
 * 返回 commits map 与最后一个 commit id
 */
function chain(
  ids: VersionId[],
  snapshotOf: (i: number) => CharacterCard,
  branch: BranchName = 'main'
): { commits: CommitMap; head: VersionId } {
  const commits: CommitMap = new Map();
  let parentId: VersionId | null = null;
  for (let i = 0; i < ids.length; i++) {
    const v = makeVersion(ids[i]!, parentId, branch, snapshotOf(i));
    commits.set(v.id, v);
    parentId = v.id;
  }
  return { commits, head: ids[ids.length - 1]! };
}

describe('findCommonAncestor（自由函数）', () => {
  it('同一条链上的两点，共同祖先是靠上的那个', () => {
    const { commits } = chain(['a', 'b', 'c'], (i) => makeCard({ name: `n${i}` }));
    expect(findCommonAncestor(commits, 'c', 'b')).toBe('b');
    expect(findCommonAncestor(commits, 'c', 'a')).toBe('a');
  });

  it('同一提交对自身，返回自身', () => {
    const { commits } = chain(['a', 'b'], () => makeCard());
    expect(findCommonAncestor(commits, 'b', 'b')).toBe('b');
  });

  it('分叉的两条链，返回分叉点而不是 null', () => {
    // main: a ← b ← c
    //          ↖ d ← e（从 b 分出去，但 d 的 parent 仍是 b）
    const commits: CommitMap = new Map();
    const a = makeVersion('a', null, 'main', makeCard({ name: 'base' }));
    const b = makeVersion('b', 'a', 'main', makeCard({ name: 'fork-point' }));
    const c = makeVersion('c', 'b', 'main', makeCard({ name: 'main-head' }));
    const d = makeVersion('d', 'b', 'dev', makeCard({ name: 'dev-1' }));
    const e = makeVersion('e', 'd', 'dev', makeCard({ name: 'dev-head' }));
    for (const v of [a, b, c, d, e]) commits.set(v.id, v);

    expect(findCommonAncestor(commits, 'c', 'e')).toBe('b');
  });

  it('完全不相关的两条链，返回 null', () => {
    const commits: CommitMap = new Map();
    const x = makeVersion('x', null, 'main', makeCard());
    const y = makeVersion('y', null, 'other', makeCard());
    commits.set('x', x);
    commits.set('y', y);
    expect(findCommonAncestor(commits, 'x', 'y')).toBeNull();
  });

  it('起始提交不在 map 里（脏数据）时返回 null，不抛错', () => {
    const { commits } = chain(['a', 'b'], () => makeCard());
    expect(findCommonAncestor(commits, 'ghost', 'b')).toBeNull();
  });
});

describe('mergeBranch（自由函数）', () => {
  /**
   * 典型场景：base 有 name=原始；target 改了 description；source 改了 personality。
   * 两边改的字段不重叠 ⇒ 自动合并成功。
   */
  function setupDisjoint(): { commits: CommitMap; branches: BranchMap } {
    const base = makeCard({ name: '原始', description: 'D0', personality: 'P0' });
    const commits: CommitMap = new Map();
    const v1 = makeVersion('v1', null, 'main', base);
    const v2 = makeVersion(
      'v2',
      'v1',
      'main',
      makeCard({ name: '原始', description: 'D-main', personality: 'P0' })
    );
    const v3 = makeVersion(
      'v3',
      'v1',
      'dev',
      makeCard({ name: '原始', description: 'D0', personality: 'P-dev' })
    );
    for (const v of [v1, v2, v3]) commits.set(v.id, v);

    const branches: BranchMap = new Map([
      ['main', makeBranch('main', 'v2')],
      ['dev', makeBranch('dev', 'v3')],
    ]);
    return { commits, branches };
  }

  it('改的字段不重叠 ⇒ 自动合并成功，两边改动都保留', () => {
    const { commits, branches } = setupDisjoint();
    const result = mergeBranch(commits, branches, 'main', 'dev');

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.autoResolvedCount).toBeGreaterThan(0);
    expect(result.mergedSnapshot!.description).toBe('D-main');
    expect(result.mergedSnapshot!.personality).toBe('P-dev');
  });

  it('同一字段两边改得不同 ⇒ 冲突，自动合并不产出快照', () => {
    const commits: CommitMap = new Map();
    const v1 = makeVersion('v1', null, 'main', makeCard({ name: '原始' }));
    const v2 = makeVersion('v2', 'v1', 'main', makeCard({ name: 'main 改名' }));
    const v3 = makeVersion('v3', 'v1', 'dev', makeCard({ name: 'dev 改名' }));
    for (const v of [v1, v2, v3]) commits.set(v.id, v);

    const branches: BranchMap = new Map([
      ['main', makeBranch('main', 'v2')],
      ['dev', makeBranch('dev', 'v3')],
    ]);

    const result = mergeBranch(commits, branches, 'main', 'dev');
    expect(result.success).toBe(false);
    expect(result.mergedSnapshot).toBeNull();
    const conflict = result.conflicts.find((c) => c.path === 'name');
    expect(conflict).toBeTruthy();
    expect(conflict!.currentValue).toBe('main 改名');
    expect(conflict!.sourceValue).toBe('dev 改名');
    expect(conflict!.baseValue).toBe('原始');
  });

  it('同一 HEAD（无事可做）⇒ 成功且直接返回 target 快照的深拷贝', () => {
    const { commits } = chain(['v1'], () => makeCard({ name: 'only' }));
    const branches: BranchMap = new Map([
      ['main', makeBranch('main', 'v1')],
      ['dev', makeBranch('dev', 'v1')],
    ]);
    const result = mergeBranch(commits, branches, 'main', 'dev');

    expect(result.success).toBe(true);
    expect(result.autoResolvedCount).toBe(0);
    expect(result.mergedSnapshot!.name).toBe('only');
  });

  it('source 分支不存在 ⇒ 抛错（不是静默返回空结果）', () => {
    const { commits, branches } = setupDisjoint();
    expect(() => mergeBranch(commits, branches, 'main', 'nope')).toThrow();
  });

  it('两边都没有 HEAD ⇒ 抛错', () => {
    const branches: BranchMap = new Map([
      ['main', makeBranch('main', null)],
      ['dev', makeBranch('dev', null)],
    ]);
    expect(() => mergeBranch(new Map(), branches, 'main', 'dev')).toThrow();
  });

  it('合并结果的 mergedSnapshot 是深拷贝，改它不影响原提交快照', () => {
    const { commits, branches } = setupDisjoint();
    const result = mergeBranch(commits, branches, 'main', 'dev');
    result.mergedSnapshot!.name = '被外部改掉';
    expect(commits.get('v2')!.snapshot.name).toBe('原始');
  });
});

describe('resolveConflicts（自由函数）', () => {
  function setupConflict(): { commits: CommitMap; branches: BranchMap } {
    const commits: CommitMap = new Map();
    const v1 = makeVersion('v1', null, 'main', makeCard({ name: '原始', scenario: 'S0' }));
    const v2 = makeVersion('v2', 'v1', 'main', makeCard({ name: 'main 改名', scenario: 'S0' }));
    const v3 = makeVersion('v3', 'v1', 'dev', makeCard({ name: 'dev 改名', scenario: 'S-dev' }));
    for (const v of [v1, v2, v3]) commits.set(v.id, v);
    const branches: BranchMap = new Map([
      ['main', makeBranch('main', 'v2')],
      ['dev', makeBranch('dev', 'v3')],
    ]);
    return { commits, branches };
  }

  it("choice='source' 取源分支值，'current' 保持目标分支值", () => {
    const { commits, branches } = setupConflict();
    const merged = resolveConflicts(commits, branches, 'main', 'dev', {
      name: 'source',
      scenario: 'source',
    });
    expect(merged.name).toBe('dev 改名');
    expect(merged.scenario).toBe('S-dev');
  });

  it('未列出的字段保持目标分支值', () => {
    const { commits, branches } = setupConflict();
    const merged = resolveConflicts(commits, branches, 'main', 'dev', { name: 'source' });
    expect(merged.name).toBe('dev 改名');
    // scenario 没在 resolutions 里 ⇒ 保持 current
    expect(merged.scenario).toBe('S0');
  });

  it('显式选 current 时不覆盖', () => {
    const { commits, branches } = setupConflict();
    const merged = resolveConflicts(commits, branches, 'main', 'dev', {
      name: 'current',
      scenario: 'current',
    });
    expect(merged.name).toBe('main 改名');
    expect(merged.scenario).toBe('S0');
  });

  it('任一分支没有 HEAD ⇒ 抛错', () => {
    const commits: CommitMap = new Map([
      ['v1', makeVersion('v1', null, 'main', makeCard())],
    ]);
    const branches: BranchMap = new Map([
      ['main', makeBranch('main', 'v1')],
      ['dev', makeBranch('dev', null)],
    ]);
    expect(() => resolveConflicts(commits, branches, 'main', 'dev', {})).toThrow();
  });

  it('返回的是新对象，改它不影响原提交', () => {
    const { commits, branches } = setupConflict();
    const merged = resolveConflicts(commits, branches, 'main', 'dev', {});
    merged.name = '外部改';
    expect(commits.get('v2')!.snapshot.name).toBe('main 改名');
  });
});
