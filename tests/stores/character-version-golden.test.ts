/**
 * B6 拆分护栏：character-version store 的行为指纹（拆分前先记，搬完必须同一个值）
 *
 * 与 community-market 那道护栏同一套办法（见 tests/stores/community-market-golden.test.ts
 * 的头注释）：拆 store 的风险不在算法而在接线——对外成员漏一个、ref 传成 .value、
 * 少 bump 一次 tick、少落一次盘，都是"看起来一样、实际不同"。
 *
 * 这一版尤其要紧的是 **tick**：`versionTick` 是让引擎那批命令式对象（仓库/分支/提交）
 * 能被 computed 看见的唯一通道，历史上就修过"toast 说已创建、列表还是旧内容"的缺陷
 * （见 character-version.ts 里 branches 的注释）。搬成工厂后哪个动作漏 bump，
 * 指纹里对应那一步的 branches/history 读数当场就不对。
 *
 * 判据只记确定性可观测量：
 * - 语言钉成 zh（`detectLocale()` 读 navigator，不钉就跟着操作系统走）；
 * - 8 字符短哈希版本 id（`generateVersionId` = 时间戳 36 进制 + 4 位随机）归一化成 ID，
 *   ISO 时间戳归一化成 D；对象键递归排序后再序列化，免得属性书写顺序误伤。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { setActivePinia, createPinia } from 'pinia';
import { setLocale } from '@/i18n';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useCharacterStore } from '@/stores/character';
import type { StorageAdapter } from '@storage/storage-adapter';
import type { CharacterCard } from '@core/character-card';
import { seedCharacter } from '../helpers/character-fixtures';

/** 拆分前后必须保持不变的指纹（拆分前 733 行实现实测，连跑三次同值） */
const EXPECTED_FINGERPRINT = '59b511e2d23b102056a2c7ddf150bc1fa26145c5e1e0ca131bd58e802596a88b';

// ── 夹具 ──

/** 记录型存储桩件：store 只用得到快照两法，按序记下每次写 */
function makeStubAdapter() {
  const data = new Map<string, unknown>();
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

const ISO_DATE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
/** 版本 id 是 8 字符小写字母数字短哈希（parentId 同形，null 保持 null） */
const SHORT_HASH = /\b[a-z0-9]{8}\b/g;

function redact(value: string): string {
  return value.replace(ISO_DATE, 'D').replace(SHORT_HASH, 'ID');
}

/** 递归排序键，使序列化结果与属性书写顺序无关；只归一化字符串值，不动键名 */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = canon((value as Record<string, unknown>)[k]);
    return out;
  }
  return typeof value === 'string' ? redact(value) : value;
}

describe('character-version store 行为指纹（B6 拆分护栏）', () => {
  let stub: ReturnType<typeof makeStubAdapter>;

  beforeEach(() => {
    localStorage.clear();
    setLocale('zh');
    setActivePinia(createPinia());
    stub = makeStubAdapter();
  });

  it('整条操作流水的指纹与基线一致', async () => {
    const store = useCharacterVersionStore();
    const charStore = useCharacterStore();
    seedCharacter(charStore as never, { id: 'seraphina', name: 'Seraphina' });
    store.setStorageAdapter(stub.adapter);
    store._resetForTesting();

    const log: Record<string, unknown>[] = [];
    const sample = (step: string, extra: Record<string, unknown> = {}) => {
      const info = store.currentRepoInfo;
      log.push({
        step,
        currentCharacterId: store.currentCharacterId,
        author: store.author.name,
        loaded: store.loaded,
        repos: store.repositories.map((r) => [r.characterId, r.characterName, r.totalCommits, r.currentBranch, r.defaultBranch, r.activeLocks.map((l) => [l.fieldPath, l.holder.name])]),
        tracked: [...store.trackedCharacterIds].sort(),
        hasRepoSeraphina: store.hasRepository('seraphina'),
        hasRepoGhost: store.hasRepository('ghost'),
        repoInfo: info && {
          characterId: info.characterId,
          commits: info.totalCommits,
          branch: info.currentBranch,
          branches: info.branches.map((b) => [b.name, b.isDefault, b.locked]),
        },
        branches: store.branches.map((b) => [b.name, b.isDefault, b.locked, b.createdBy.name]),
        history: store.history.map((v) => [v.branch, v.message, v.author.name, v.snapshot.name, v.snapshot.description]),
        head: store.headVersion ? [store.headVersion.message, store.headVersion.snapshot.name] : null,
        pending: store.pendingConflicts
          ? { source: store.pendingConflicts.sourceBranch, paths: store.pendingConflicts.conflicts.map((c) => c.path) }
          : null,
        hasPending: store.hasPendingConflicts,
        lastError: store.lastError,
        lastInfo: store.lastInfo,
        ...extra,
      });
    };

    sample('00-reset');

    // ── 仓库选择（含"角色不存在"的拒绝路径）──
    expect(store.selectCharacter('ghost')).toBe(false);
    sample('01-select-missing-character');
    expect(store.selectCharacter('seraphina')).toBe(true);
    sample('02-select-character');

    // ── 未选中角色时的六个拒绝路径 ──
    store._resetForTesting();
    sample('03-reset');
    expect(store.commit(makeCard(), '无仓库提交')).toBe(false);
    sample('04-commit-denied');
    expect(store.commitCurrentCharacter('无仓库')).toBe(false);
    sample('05-commit-current-denied');
    expect(store.createBranch('dev')).toBe(false);
    sample('06-create-branch-denied');
    expect(store.switchBranch('dev')).toBe(false);
    sample('07-switch-denied');
    expect(store.deleteBranch('dev')).toBe(false);
    sample('08-delete-denied');
    expect(store.acquireLock('name')).toBe(false);
    sample('09-lock-denied');
    expect(store.rollbackTo('whatever', '回滚')).toBe(false);
    sample('10-rollback-denied');
    expect(store.diffWithHead('whatever')).toBeNull();
    sample('11-diff-head-denied');

    // ── 提交 ──
    store.selectCharacter('seraphina');
    sample('12-selected-again');
    expect(store.commit(makeCard({ name: 'v1 名', description: 'v1 描述' }), '首次提交')).toBe(true);
    sample('13-commit-v1');
    charStore.updateCharacter('seraphina', { description: 'UI 里改过的描述' });
    expect(store.commitCurrentCharacter('来自 UI')).toBe(true);
    sample('14-commit-from-ui');
    expect(store.commit(makeCard({ name: 'v3 名' }), 'v3')).toBe(true);
    sample('15-commit-v3');

    // ── 分支 ──
    expect(store.createBranch('1bad')).toBe(false);
    sample('16-branch-name-invalid');
    expect(store.createBranch('dev')).toBe(true);
    sample('17-branch-dev');
    expect(store.createBranch('dev')).toBe(false);
    sample('18-branch-dup');
    expect(store.switchBranch('dev')).toBe(true);
    sample('19-switch-dev');
    expect(store.switchBranch('ghost')).toBe(false);
    sample('20-switch-ghost');
    expect(store.commit(makeCard({ name: 'dev 名', description: 'v1 描述' }), 'dev 改名')).toBe(true);
    sample('21-commit-on-dev');
    expect(store.switchBranch('main')).toBe(true);
    sample('22-switch-main');

    // ── 差异 ──
    const hist = store.history;
    const diffOut = store.diff(hist[0]!.id, hist[hist.length - 1]!.id);
    log.push({
      step: '23-diff',
      changes: diffOut?.changes ?? null,
      identical: diffOut?.identical ?? null,
      fields: diffOut?.fields.map((f) => [f.path, f.type, f.label]) ?? null,
    });
    const headDiff = store.diffWithHead(hist[0]!.id);
    log.push({ step: '24-diff-head', changes: headDiff?.changes ?? null, fields: headDiff?.fields.map((f) => f.path) ?? null });
    expect(store.diff('nope1234', 'nope5678')).toBeNull();
    sample('25-diff-bad-ids');

    // ── 操作锁（含"他人持有"、"*" 与单字段互斥、过期清理、空清理）──
    expect(store.acquireLock('description')).toBe(true);
    sample('26-lock-held');
    store.setAuthor({ name: '协作者' });
    sample('27-author-switched');
    expect(store.acquireLock('description')).toBe(false);
    sample('28-lock-by-other');
    expect(store.acquireLock('*')).toBe(false);
    sample('29-whole-field-conflicts-with-other-lock');
    expect(store.acquireLock('personality', 0)).toBe(true);
    sample('30-zero-duration-lock');
    expect(store.purgeExpiredLocks()).toBeGreaterThan(0);
    sample('31-purged');
    store.releaseAllLocks();
    sample('32-released-all');
    expect(store.purgeExpiredLocks()).toBe(0);
    sample('33-purge-empty');
    store.releaseLock('description');
    sample('34-other-holder-released-elsewhere');
    store.setAuthor({ name: '本地用户' });
    store.releaseLock('description');
    sample('35-released-one');

    // ── 分支锁：锁住当前分支挡住提交，锁住别的分支挡住切换 ──
    expect(store.toggleBranchLock('dev')).toBe(true);
    sample('34-branch-locked-dev');
    expect(store.switchBranch('dev')).toBe(false);
    sample('35-switch-to-locked-branch');
    expect(store.toggleBranchLock('main')).toBe(true);
    sample('36-branch-locked-main');
    expect(store.commit(makeCard({ name: '锁上提交' }), '锁上提交')).toBe(false);
    sample('37-commit-on-locked-branch');
    expect(store.toggleBranchLock('main')).toBe(true);
    sample('38-main-unlocked');
    expect(store.commit(makeCard({ name: '解锁后提交' }), '解锁后提交')).toBe(true);
    sample('39-commit-after-unlock');
    expect(store.toggleBranchLock('ghost')).toBe(false);
    sample('40-branch-lock-ghost');
    expect(store.toggleBranchLock('dev')).toBe(true);
    sample('41-dev-unlocked');

    // ── 合并：冲突 → 取消 → 冲突 → 选 source → 选 current ──
    store.setAuthor({ name: '本地用户' });
    expect(store.commit(makeCard({ name: 'main 名', description: 'main 描述' }), 'main 改名')).toBe(true);
    sample('42-main-diverged');
    expect(store.mergeBranch('main')).toBe(false);
    sample('43-merge-self');
    expect(store.mergeBranch('ghost')).toBe(false);
    sample('44-merge-ghost');
    expect(store.mergeBranch('dev')).toBe(false);
    sample('45-merge-conflict');
    store.cancelMerge();
    sample('46-merge-cancelled');
    expect(store.resolveConflicts({ name: 'source' })).toBe(false);
    sample('47-resolve-without-pending');
    expect(store.mergeBranch('dev')).toBe(false);
    expect(store.resolveConflicts({ name: 'source' })).toBe(true);
    sample('48-resolved-source');
    expect(store.mergeBranch('dev')).toBe(false);
    expect(store.resolveConflicts({ description: 'current', name: 'current' })).toBe(true);
    sample('49-resolved-current');

    // ── 合并：自动成功（源改了当前没动的字段）──
    expect(store.createBranch('feat')).toBe(true);
    expect(store.switchBranch('feat')).toBe(true);
    expect(store.commit(makeCard({ name: 'main 名', description: 'feat 描述' }), 'feat 改描述')).toBe(true);
    sample('50-commit-on-feat');
    expect(store.switchBranch('main')).toBe(true);
    expect(store.mergeBranch('feat')).toBe(true);
    sample('51-auto-merged');

    // ── 回滚 ──
    expect(store.rollbackTo(store.history[1]!.id, '回滚到 v1 之后')).toBe(true);
    sample('52-rolled-back');
    expect(store.rollbackTo('deadbeef', '回滚不存在的版本')).toBe(false);
    sample('53-rollback-missing');

    // ── 删分支与删仓库 ──
    expect(store.deleteBranch('feat')).toBe(true);
    sample('54-branch-deleted');
    expect(store.deleteBranch('main')).toBe(false);
    sample('55-delete-current-branch');
    expect(store.deleteRepository('seraphina')).toBe(true);
    sample('56-repo-deleted');
    expect(store.deleteRepository('seraphina')).toBe(false);
    sample('57-repo-deleted-again');

    // ── 错误清理 ──
    store.clearLastError();
    store.clearLastInfo();
    sample('58-clear-messages');

    // ── 落盘往返（含"没有 adapter 也照常返回"与迁移信封）──
    store.selectCharacter('seraphina');
    store.commit(makeCard({ name: '待保存', description: '待保存描述' }), '落盘前提交');
    store.createBranch('keepme');
    store.setStorageAdapter(null);
    void store.persistNow();
    sample('59-persist-without-adapter');
    store.setStorageAdapter(stub.adapter);
    await store.persistNow();
    sample('60-persist-now');
    log.push({ step: '61-storage-keys', keys: [...new Set(stub.writes)].sort() });
    log.push({ step: '62-storage-order', writes: stub.writes });
    log.push({ step: '63-snapshot', snapshot: stub.dump() });
    store._resetForTesting();
    sample('64-after-reset');
    await store.loadFromDisk();
    sample('65-after-load');
    log.push({ step: '66-keys-after-load', keys: [...new Set(stub.writes)].sort() });

    const transcript = JSON.stringify(canon(log));
    const fingerprint = createHash('sha256').update(transcript).digest('hex');

    // 指纹之外再留一份采样点数：红的时候先看出是不是漏走了一步
    expect({ fingerprint, steps: log.length }).toEqual({
      fingerprint: EXPECTED_FINGERPRINT,
      steps: 69,
    });
  });

  /**
   * 对外成员清单（return 块 56 行的守卫）
   *
   * 指纹只覆盖流水里读过的成员；这里把全部对外面钉成字面清单，
   * 拆分时漏掉一个没被流水碰到的成员也会点名报出来。
   */
  it('对外成员清单与基线逐字一致', () => {
    const store = useCharacterVersionStore();
    const PINIA_INTERNALS = new Set(['_customProperties', '_getters', '_hmrPayload', '_hotUpdate', '_p']);
    const keys = Object.keys(store)
      .filter((k) => !k.startsWith('$') && !PINIA_INTERNALS.has(k))
      .sort();
    expect(keys).toEqual([
      '_resetForTesting',
      'acquireLock',
      'author',
      'branches',
      'cancelMerge',
      'clearLastError',
      'clearLastInfo',
      'commit',
      'commitCurrentCharacter',
      'createBranch',
      'currentCharacterId',
      'currentRepoInfo',
      'currentRepository',
      'deleteBranch',
      'deleteRepository',
      'diff',
      'diffWithHead',
      'hasPendingConflicts',
      'hasRepository',
      'headVersion',
      'history',
      'lastError',
      'lastInfo',
      'loadFromDisk',
      'loaded',
      'mergeBranch',
      'pendingConflicts',
      'persistNow',
      'purgeExpiredLocks',
      'releaseAllLocks',
      'releaseLock',
      'repositories',
      'resolveConflicts',
      'rollbackTo',
      'selectCharacter',
      'setAuthor',
      'setStorageAdapter',
      'switchBranch',
      'toggleBranchLock',
      'trackedCharacterIds',
    ]);
  });
});
