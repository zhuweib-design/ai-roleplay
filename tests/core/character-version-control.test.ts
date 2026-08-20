/**
 * character-version-control 单元测试 (模块4)
 *
 * 覆盖：
 * - generateVersionId 唯一性
 * - isValidBranchName 合法性
 * - CharacterRepository 初始化/提交/历史
 * - 分支：创建/切换/删除/锁定
 * - 差异对比：added/removed/modified
 * - 合并：自动成功/冲突检测/冲突解决
 * - 回滚
 * - 操作锁：获取/释放/过期/冲突
 * - 序列化往返
 * - VersionControlEngine 多仓库管理
 */
import { describe, test, expect } from 'vitest';
import {
  VersionControlEngine,
  CharacterRepository,
  generateVersionId,
  isValidBranchName,
  TRACKED_FIELDS,
  type VersionAuthor,
  type OperationLock,
} from '@core/character-version-control';
import type { CharacterCard } from '@core/character-card';

// ── 测试夹具 ──

const AUTHOR_A: VersionAuthor = { name: 'Alice' };
const AUTHOR_B: VersionAuthor = { name: 'Bob' };

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

function makeRepo(
  characterId: string = 'char-1',
  card: CharacterCard = makeCard(),
  author: VersionAuthor = AUTHOR_A
): CharacterRepository {
  const repo = new CharacterRepository(characterId);
  repo.initialize(card, author, '初始版本');
  return repo;
}

// ── 工具函数 ──

describe('generateVersionId', () => {
  test('返回 8 字符字符串', () => {
    const id = generateVersionId();
    expect(id).toHaveLength(8);
    expect(typeof id).toBe('string');
  });

  test('连续调用产生不同值（极高概率）', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateVersionId());
    }
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe('isValidBranchName', () => {
  test('合法名称', () => {
    expect(isValidBranchName('main')).toBe(true);
    expect(isValidBranchName('dev')).toBe(true);
    expect(isValidBranchName('feature-1')).toBe(true);
    expect(isValidBranchName('rewrite_v2')).toBe(true);
    expect(isValidBranchName('a')).toBe(true);
    expect(isValidBranchName('ABC123')).toBe(true);
  });

  test('拒绝空字符串', () => {
    expect(isValidBranchName('')).toBe(false);
  });

  test('拒绝首字符为数字或特殊符号', () => {
    expect(isValidBranchName('1abc')).toBe(false);
    expect(isValidBranchName('-abc')).toBe(false);
    expect(isValidBranchName('_abc')).toBe(false);
    expect(isValidBranchName(' abc')).toBe(false);
  });

  test('拒绝空格与中文', () => {
    expect(isValidBranchName('my branch')).toBe(false);
    expect(isValidBranchName('开发分支')).toBe(false);
  });

  test('拒绝超长名称（>32）', () => {
    expect(isValidBranchName('a'.repeat(33))).toBe(false);
    expect(isValidBranchName('a'.repeat(32))).toBe(true);
  });
});

describe('TRACKED_FIELDS', () => {
  test('包含至少 14 个追踪字段', () => {
    expect(TRACKED_FIELDS.length).toBeGreaterThanOrEqual(14);
  });

  test('包含核心字段 name/description/personality', () => {
    const paths = TRACKED_FIELDS.map((f) => f.path);
    expect(paths).toContain('name');
    expect(paths).toContain('description');
    expect(paths).toContain('personality');
  });

  test('支持嵌套字段（attributes.level）', () => {
    const paths = TRACKED_FIELDS.map((f) => f.path);
    expect(paths).toContain('attributes.level');
    expect(paths).toContain('attributes.profession');
  });
});

// ── CharacterRepository：初始化与提交 ──

describe('CharacterRepository.initialize', () => {
  test('创建默认 main 分支与初始提交', () => {
    const repo = new CharacterRepository('char-1');
    repo.initialize(makeCard(), AUTHOR_A, '初始');

    const branches = repo.listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0]!.name).toBe('main');
    expect(branches[0]!.isDefault).toBe(true);
    expect(branches[0]!.headId).not.toBeNull();
  });

  test('初始提交的 parentId 为 null', () => {
    const repo = makeRepo();
    const head = repo.getHead();
    expect(head).not.toBeNull();
    expect(head!.parentId).toBeNull();
    expect(head!.message).toBe('初始版本');
  });

  test('重复 initialize 不覆盖已存在的 main 分支', () => {
    const repo = makeRepo();
    const headBefore = repo.getHead()!.id;
    repo.initialize(makeCard({ name: '新名字' }), AUTHOR_A, '再次初始化');
    // 仍会 commit 一个新版本，但 main 分支保持
    const branches = repo.listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0]!.name).toBe('main');
    // head 应该已经是新提交
    expect(repo.getHead()!.id).not.toBe(headBefore);
  });
});

describe('CharacterRepository.commit', () => {
  test('在 main 分支上链式提交', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    const v2 = repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, '修改名称');
    const v3 = repo.commit(makeCard({ name: 'v3' }), AUTHOR_A, '再次修改');

    expect(v2.parentId).toBe(v1.id);
    expect(v3.parentId).toBe(v2.id);
    expect(repo.getHead()!.id).toBe(v3.id);
    expect(repo.getTotalCommits()).toBe(3);
  });

  test('提交记录作者信息', () => {
    const repo = makeRepo();
    const v = repo.commit(makeCard(), AUTHOR_B, 'Bob 修改');
    expect(v.author.name).toBe('Bob');
  });

  test('提交时释放本人持有的锁', () => {
    const repo = makeRepo();
    repo.acquireLock('*', AUTHOR_A);
    expect(repo.activeLocks).toHaveLength(1);
    repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, '修改');
    expect(repo.activeLocks).toHaveLength(0);
  });

  test('他人持有全字段锁时拒绝提交', () => {
    const repo = makeRepo();
    repo.acquireLock('*', AUTHOR_B);
    expect(() =>
      repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, '尝试提交')
    ).toThrow(/被.*编辑/);
  });

  test('分支锁定时拒绝提交', () => {
    const repo = makeRepo();
    const branch = repo.branches.get('main')!;
    branch.locked = true;
    expect(() =>
      repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, '尝试提交')
    ).toThrow(/已锁定/);
  });
});

// ── 分支管理 ──

describe('CharacterRepository.createBranch', () => {
  test('从当前分支创建新分支并继承 HEAD', () => {
    const repo = makeRepo();
    repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, '在 main 提交');
    const dev = repo.createBranch('dev', AUTHOR_A);

    expect(dev.name).toBe('dev');
    expect(dev.headId).toBe(repo.branches.get('main')!.headId);
    expect(dev.isDefault).toBe(false);
  });

  test('从指定分支创建', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-v1' }), AUTHOR_A, 'dev 提交');
    // 从 main 创建（而非从 dev）
    const feat = repo.createBranch('feat', AUTHOR_A, 'main');
    expect(feat.headId).toBe(repo.branches.get('main')!.headId);
  });

  test('拒绝非法分支名', () => {
    const repo = makeRepo();
    expect(() => repo.createBranch('123abc', AUTHOR_A)).toThrow(/非法/);
    expect(() => repo.createBranch('my branch', AUTHOR_A)).toThrow(/非法/);
  });

  test('拒绝已存在的分支名', () => {
    const repo = makeRepo();
    expect(() => repo.createBranch('main', AUTHOR_A)).toThrow(/已存在/);
  });

  test('源分支不存在时抛错', () => {
    const repo = makeRepo();
    expect(() =>
      repo.createBranch('dev', AUTHOR_A, 'nonexistent' as never)
    ).toThrow(/不存在/);
  });
});

describe('CharacterRepository.switchBranch', () => {
  test('切换当前分支', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    expect(repo.currentBranch).toBe('dev');
  });

  test('切换到不存在的分支抛错', () => {
    const repo = makeRepo();
    expect(() => repo.switchBranch('nope')).toThrow(/不存在/);
  });

  test('切换到锁定的分支抛错', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.branches.get('dev')!.locked = true;
    expect(() => repo.switchBranch('dev')).toThrow(/已锁定/);
  });
});

describe('CharacterRepository.deleteBranch', () => {
  test('删除非默认分支', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.deleteBranch('dev');
    expect(repo.branches.has('dev')).toBe(false);
  });

  test('拒绝删除默认分支 main', () => {
    const repo = makeRepo();
    expect(() => repo.deleteBranch('main')).toThrow(/默认分支/);
  });

  test('拒绝删除当前所在分支', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    expect(() => repo.deleteBranch('dev')).toThrow(/当前所在分支/);
  });

  test('删除不存在的分支抛错', () => {
    const repo = makeRepo();
    expect(() => repo.deleteBranch('nope')).toThrow(/不存在/);
  });
});

// ── 历史与查询 ──

describe('CharacterRepository.getBranchHistory', () => {
  test('返回 HEAD 到初始的倒序链', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    const v2 = repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, 'msg2');
    const v3 = repo.commit(makeCard({ name: 'v3' }), AUTHOR_A, 'msg3');

    const history = repo.getBranchHistory('main');
    expect(history).toHaveLength(3);
    expect(history[0]!.id).toBe(v3.id);
    expect(history[1]!.id).toBe(v2.id);
    expect(history[2]!.id).toBe(v1.id);
  });

  test('分支不存在的空数组', () => {
    const repo = makeRepo();
    expect(repo.getBranchHistory('nope')).toEqual([]);
  });

  test('不同分支历史独立', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-v1' }), AUTHOR_A, 'dev 提交');

    const mainHistory = repo.getBranchHistory('main');
    const devHistory = repo.getBranchHistory('dev');
    expect(mainHistory).toHaveLength(1);
    expect(devHistory).toHaveLength(2);
    expect(devHistory[0]!.branch).toBe('dev');
  });
});

describe('CharacterRepository.findCommonAncestor', () => {
  test('两个分支的共同祖先为分叉点', () => {
    const repo = makeRepo();
    const baseCommit = repo.getHead()!;
    // 在 main 提交之前创建 dev 分支，使 dev 与 main 从 baseCommit 分叉
    repo.createBranch('dev', AUTHOR_A);
    repo.commit(makeCard({ name: 'main-v2' }), AUTHOR_A, 'main 提交');
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-v1' }), AUTHOR_A, 'dev 提交');

    const mainHead = repo.branches.get('main')!.headId!;
    const devHead = repo.branches.get('dev')!.headId!;
    const ancestor = repo.findCommonAncestor(mainHead, devHead);
    expect(ancestor).toBe(baseCommit.id);
  });

  test('同一 HEAD 时直接返回', () => {
    const repo = makeRepo();
    const head = repo.getHead()!;
    const ancestor = repo.findCommonAncestor(head.id, head.id);
    expect(ancestor).toBe(head.id);
  });

  test('无共同祖先返回 null', () => {
    const repo = makeRepo();
    // 用一个不存在的 ID 测试
    expect(repo.findCommonAncestor('nonexistent', 'nonexistent')).toBeNull();
  });
});

// ── 差异对比 ──

describe('CharacterRepository.diffVersions', () => {
  test('完全相同返回 identical=true', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    const v2 = repo.commit(makeCard(), AUTHOR_A, '无变更');
    const diff = repo.diffVersions(v1.id, v2.id);
    expect(diff.identical).toBe(true);
    expect(diff.changes).toBe(0);
    expect(diff.fields).toEqual([]);
  });

  test('检测 name 修改（modified 类型）', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!.id;
    const v2 = repo.commit(
      makeCard({ name: '改后名称' }),
      AUTHOR_A,
      '改名'
    ).id;
    const diff = repo.diffVersions(v1, v2);
    expect(diff.changes).toBeGreaterThan(0);
    const nameDiff = diff.fields.find((f) => f.path === 'name');
    expect(nameDiff).toBeDefined();
    expect(nameDiff!.type).toBe('modified');
    expect(nameDiff!.oldValue).toBe('初始角色');
    expect(nameDiff!.newValue).toBe('改后名称');
  });

  test('检测 description 字段 added（旧值为空）', () => {
    const repo = new CharacterRepository('char-1');
    const emptyCard = makeCard({ description: '' });
    repo.initialize(emptyCard, AUTHOR_A, '初始');
    const v1 = repo.getHead()!.id;
    const v2 = repo.commit(
      makeCard({ description: '新描述' }),
      AUTHOR_A,
      '加描述'
    ).id;
    const diff = repo.diffVersions(v1, v2);
    const descDiff = diff.fields.find((f) => f.path === 'description');
    expect(descDiff).toBeDefined();
    expect(descDiff!.type).toBe('added');
  });

  test('检测字段 removed（新值为空）', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!.id;
    const v2 = repo.commit(
      makeCard({ description: '' }),
      AUTHOR_A,
      '清空描述'
    ).id;
    const diff = repo.diffVersions(v1, v2);
    const descDiff = diff.fields.find((f) => f.path === 'description');
    expect(descDiff).toBeDefined();
    expect(descDiff!.type).toBe('removed');
  });

  test('检测 attributes.level 嵌套字段修改', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!.id;
    const v2 = repo.commit(
      makeCard({ attributes: { profession: '战士', level: 5, experience: 100 } }),
      AUTHOR_A,
      '升级'
    ).id;
    const diff = repo.diffVersions(v1, v2);
    const levelDiff = diff.fields.find((f) => f.path === 'attributes.level');
    expect(levelDiff).toBeDefined();
    expect(levelDiff!.newValue).toBe(5);
  });

  test('版本不存在时抛错', () => {
    const repo = makeRepo();
    expect(() => repo.diffVersions('nonexistent', repo.getHead()!.id)).toThrow();
  });

  test('fromId/toId 在 diff 中正确反映', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    const v2 = repo.commit(makeCard({ name: 'new' }), AUTHOR_A, 'msg');
    const diff = repo.diffVersions(v1.id, v2.id);
    expect(diff.fromId).toBe(v1.id);
    expect(diff.toId).toBe(v2.id);
  });
});

// ── 合并 ──

describe('CharacterRepository.mergeBranch', () => {
  test('同一 HEAD 时直接成功（无变更）', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    const result = repo.mergeBranch('dev');
    expect(result.success).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.autoResolvedCount).toBe(0);
  });

  test('源分支修改、当前分支未修改 → 自动采用源值', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-修改' }), AUTHOR_A, 'dev 改名');
    repo.switchBranch('main');

    const result = repo.mergeBranch('dev');
    expect(result.success).toBe(true);
    expect(result.autoResolvedCount).toBeGreaterThan(0);
    expect(result.mergedSnapshot!.name).toBe('dev-修改');
  });

  test('当前分支修改、源分支未修改 → 保持当前值', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.commit(makeCard({ name: 'main-修改' }), AUTHOR_A, 'main 改名');
    // dev 仍指向原 HEAD，未改任何字段

    const result = repo.mergeBranch('dev');
    expect(result.success).toBe(true);
    expect(result.mergedSnapshot!.name).toBe('main-修改');
  });

  test('双方修改同一字段不同值 → 标记冲突', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-名' }), AUTHOR_A, 'dev 改名');
    repo.switchBranch('main');
    repo.commit(makeCard({ name: 'main-名' }), AUTHOR_A, 'main 改名');

    const result = repo.mergeBranch('dev');
    expect(result.success).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
    const nameConflict = result.conflicts.find((c) => c.path === 'name');
    expect(nameConflict).toBeDefined();
    expect(nameConflict!.currentValue).toBe('main-名');
    expect(nameConflict!.sourceValue).toBe('dev-名');
  });

  test('双方修改不同字段 → 自动合并两边', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-名' }), AUTHOR_A, 'dev 改名');
    repo.switchBranch('main');
    repo.commit(
      makeCard({ description: 'main-新描述' }),
      AUTHOR_A,
      'main 改描述'
    );

    const result = repo.mergeBranch('dev');
    expect(result.success).toBe(true);
    expect(result.mergedSnapshot!.name).toBe('dev-名');
    expect(result.mergedSnapshot!.description).toBe('main-新描述');
  });

  test('源分支不存在抛错', () => {
    const repo = makeRepo();
    expect(() => repo.mergeBranch('nonexistent')).toThrow(/不存在/);
  });

  test('源分支无 HEAD 抛错', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.branches.get('dev')!.headId = null;
    expect(() => repo.mergeBranch('dev')).toThrow(/缺少 HEAD/);
  });
});

describe('CharacterRepository.resolveConflicts', () => {
  test('选择 source 时采用源分支值', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-名' }), AUTHOR_A, 'dev 改名');
    repo.switchBranch('main');
    repo.commit(makeCard({ name: 'main-名' }), AUTHOR_A, 'main 改名');

    const merged = repo.resolveConflicts('dev', { name: 'source' });
    expect(merged.name).toBe('dev-名');
  });

  test('选择 current 时保留当前分支值', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-名' }), AUTHOR_A, 'dev 改名');
    repo.switchBranch('main');
    repo.commit(makeCard({ name: 'main-名' }), AUTHOR_A, 'main 改名');

    const merged = repo.resolveConflicts('dev', { name: 'current' });
    expect(merged.name).toBe('main-名');
  });

  test('混合选择（部分 current 部分 source）', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(
      makeCard({ name: 'dev-名', description: 'dev-描述' }),
      AUTHOR_A,
      'dev 改两个字段'
    );
    repo.switchBranch('main');
    repo.commit(
      makeCard({ name: 'main-名', description: 'main-描述' }),
      AUTHOR_A,
      'main 改两个字段'
    );

    const merged = repo.resolveConflicts('dev', {
      name: 'source',
      description: 'current',
    });
    expect(merged.name).toBe('dev-名');
    expect(merged.description).toBe('main-描述');
  });
});

// ── 回滚 ──

describe('CharacterRepository.rollbackTo', () => {
  test('回滚到指定版本（创建新提交而非破坏历史）', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, 'v2');
    repo.commit(makeCard({ name: 'v3' }), AUTHOR_A, 'v3');
    expect(repo.getTotalCommits()).toBe(3);

    const rollback = repo.rollbackTo(v1.id, AUTHOR_A, '回到 v1');
    expect(rollback.message).toContain('回到 v1');
    expect(rollback.snapshot.name).toBe('初始角色');
    expect(repo.getTotalCommits()).toBe(4); // 历史未被删除
    expect(repo.getHead()!.snapshot.name).toBe('初始角色');
  });

  test('回滚到不存在的版本抛错', () => {
    const repo = makeRepo();
    expect(() => repo.rollbackTo('nonexistent', AUTHOR_A)).toThrow(/不存在/);
  });

  test('未指定 message 时使用默认信息', () => {
    const repo = makeRepo();
    const v1 = repo.getHead()!;
    repo.commit(makeCard({ name: 'v2' }), AUTHOR_A, 'v2');
    const rollback = repo.rollbackTo(v1.id, AUTHOR_A);
    expect(rollback.message).toContain('回滚');
    expect(rollback.message).toContain(v1.id);
  });
});

// ── 操作锁 ──

describe('CharacterRepository.acquireLock', () => {
  test('同一作者可重复获取相同锁', () => {
    const repo = makeRepo();
    expect(repo.acquireLock('*', AUTHOR_A)).toBe(true);
    expect(repo.acquireLock('*', AUTHOR_A)).toBe(true);
  });

  test('不同作者获取相同锁失败', () => {
    const repo = makeRepo();
    repo.acquireLock('*', AUTHOR_A);
    expect(repo.acquireLock('*', AUTHOR_B)).toBe(false);
  });

  test('不同作者获取不同字段锁成功', () => {
    const repo = makeRepo();
    repo.acquireLock('name', AUTHOR_A);
    expect(repo.acquireLock('description', AUTHOR_B)).toBe(true);
  });

  test('全字段锁阻止他人获取任何字段锁', () => {
    const repo = makeRepo();
    repo.acquireLock('*', AUTHOR_A);
    expect(repo.acquireLock('name', AUTHOR_B)).toBe(false);
    expect(repo.acquireLock('description', AUTHOR_B)).toBe(false);
  });

  test('字段锁不阻止他人获取其他字段锁', () => {
    const repo = makeRepo();
    repo.acquireLock('name', AUTHOR_A);
    expect(repo.acquireLock('description', AUTHOR_B)).toBe(true);
  });
});

describe('CharacterRepository.releaseLock', () => {
  test('释放锁后他人可获取', () => {
    const repo = makeRepo();
    repo.acquireLock('*', AUTHOR_A);
    repo.releaseLock('*', AUTHOR_A);
    expect(repo.acquireLock('*', AUTHOR_B)).toBe(true);
  });

  test('释放不存在锁不抛错', () => {
    const repo = makeRepo();
    expect(() => repo.releaseLock('name', AUTHOR_A)).not.toThrow();
  });
});

describe('CharacterRepository.releaseAllLocks', () => {
  test('释放指定作者的全部锁', () => {
    const repo = makeRepo();
    repo.acquireLock('name', AUTHOR_A);
    repo.acquireLock('description', AUTHOR_A);
    repo.acquireLock('tags', AUTHOR_B);
    repo.releaseAllLocks(AUTHOR_A);
    expect(repo.activeLocks).toHaveLength(1);
    expect(repo.activeLocks[0]!.holder.name).toBe('Bob');
  });
});

describe('CharacterRepository.purgeExpiredLocks', () => {
  test('清理已过期的锁', () => {
    const repo = makeRepo();
    // 获取一个 1ms 过期的锁
    repo.acquireLock('*', AUTHOR_A, 1);
    // 等待过期
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const purged = repo.purgeExpiredLocks();
        expect(purged).toBe(1);
        expect(repo.activeLocks).toHaveLength(0);
        resolve();
      }, 10);
    });
  });
});

// ── 序列化 ──

describe('CharacterRepository.toJSON/fromJSON', () => {
  test('序列化往返保持数据一致', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    repo.switchBranch('dev');
    repo.commit(makeCard({ name: 'dev-v1' }), AUTHOR_A, 'dev 提交');
    repo.switchBranch('main');
    repo.acquireLock('name', AUTHOR_B);

    const json = repo.toJSON();
    const restored = CharacterRepository.fromJSON(json);

    expect(restored.characterId).toBe(repo.characterId);
    expect(restored.currentBranch).toBe(repo.currentBranch);
    expect(restored.branches.size).toBe(repo.branches.size);
    expect(restored.commits.size).toBe(repo.commits.size);
    expect(restored.activeLocks).toHaveLength(repo.activeLocks.length);

    const restoredBranches = restored.listBranches();
    expect(restoredBranches.map((b) => b.name).sort()).toEqual(
      ['dev', 'main'].sort()
    );
  });

  test('反序列化后可继续提交', () => {
    const repo = makeRepo();
    const json = repo.toJSON();
    const restored = CharacterRepository.fromJSON(json);
    const headBefore = restored.branches.get('main')!.headId;
    const v = restored.commit(makeCard({ name: 'v2' }), AUTHOR_A, '继续');
    expect(v.parentId).toBe(headBefore);
    expect(restored.branches.get('main')!.headId).toBe(v.id);
  });

  test('空 activeLocks 数组（旧版数据兼容）', () => {
    const repo = makeRepo();
    const json = repo.toJSON();
    delete (json as { activeLocks?: OperationLock[] }).activeLocks;
    const restored = CharacterRepository.fromJSON(json);
    expect(restored.activeLocks).toEqual([]);
  });
});

// ── VersionControlEngine 多仓库管理 ──

describe('VersionControlEngine', () => {
  test('initRepository 创建并返回仓库', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    const repo = engine.initRepository('char-1', makeCard());
    expect(repo.characterId).toBe('char-1');
    expect(repo.getHead()).not.toBeNull();
  });

  test('重复 initRepository 不覆盖已存在的仓库', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    const repo1 = engine.initRepository('char-1', makeCard({ name: 'v1' }));
    const repo2 = engine.initRepository('char-1', makeCard({ name: 'v2' }));
    expect(repo1).toBe(repo2);
    expect(repo2.getHead()!.snapshot.name).toBe('v1'); // 仍是首次的 v1
  });

  test('getRepository 不存在返回 null', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    expect(engine.getRepository('nope')).toBeNull();
  });

  test('ensureRepository 创建或返回', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    const r1 = engine.ensureRepository('char-1', makeCard());
    const r2 = engine.ensureRepository('char-1', makeCard());
    expect(r1).toBe(r2);
  });

  test('deleteRepository 删除仓库', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    engine.initRepository('char-1', makeCard());
    expect(engine.deleteRepository('char-1')).toBe(true);
    expect(engine.getRepository('char-1')).toBeNull();
    expect(engine.deleteRepository('char-1')).toBe(false);
  });

  test('listRepositories 返回全部仓库信息', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    engine.initRepository('char-1', makeCard({ name: '角色A' }));
    engine.initRepository('char-2', makeCard({ name: '角色B', id: 'char-2' }));

    const list = engine.listRepositories();
    expect(list).toHaveLength(2);
    const names = list.map((r) => r.characterName);
    expect(names).toContain('角色A');
    expect(names).toContain('角色B');
  });

  test('setAuthor 切换当前作者', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    engine.setAuthor(AUTHOR_B);
    expect(engine.getAuthor().name).toBe('Bob');
  });

  test('toJSON/loadFromJSON 全量序列化往返', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    engine.initRepository('char-1', makeCard());
    engine.initRepository('char-2', makeCard({ name: '角色B', id: 'char-2' }));
    const json = engine.toJSON();
    expect(json).toHaveLength(2);

    const engine2 = new VersionControlEngine(AUTHOR_B);
    engine2.loadFromJSON(json);
    expect(engine2.listRepositories()).toHaveLength(2);
  });

  test('loadFromJSON 清空旧数据后加载', () => {
    const engine = new VersionControlEngine(AUTHOR_A);
    engine.initRepository('char-old', makeCard());
    engine.loadFromJSON([
      {
        characterId: 'char-new',
        currentBranch: 'main',
        branches: [],
        commits: [],
        activeLocks: [],
      },
    ]);
    expect(engine.getRepository('char-old')).toBeNull();
    expect(engine.getRepository('char-new')).not.toBeNull();
  });
});

// ── getInfo 综合信息 ──

describe('CharacterRepository.getInfo', () => {
  test('返回完整仓库信息', () => {
    const repo = makeRepo();
    repo.createBranch('dev', AUTHOR_A);
    const info = repo.getInfo();

    expect(info.characterId).toBe('char-1');
    expect(info.characterName).toBe('初始角色');
    expect(info.defaultBranch).toBe('main');
    expect(info.currentBranch).toBe('main');
    expect(info.branches).toHaveLength(2);
    expect(info.totalCommits).toBe(1);
    expect(info.lastCommitAt).not.toBeNull();
    expect(info.activeLocks).toEqual([]);
  });

  test('无 HEAD 时 lastCommitAt 为 null', () => {
    const repo = new CharacterRepository('char-1');
    const info = repo.getInfo();
    expect(info.lastCommitAt).toBeNull();
    expect(info.totalCommits).toBe(0);
  });
});
