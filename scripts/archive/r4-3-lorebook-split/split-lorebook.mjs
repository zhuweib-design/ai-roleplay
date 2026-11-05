/**
 * R4-3 生成器：把 stores/lorebook.ts 的纯逻辑块搬到三个模块，宿主保留 store 装配。
 *
 * 铁律（R4-2/R3-5 教训）：
 * - 基准只读归档副本 scripts/archive/r4-3-lorebook-split/lorebook.orig.ts.txt
 * - slice 越界/反参/切空一律抛错
 * - 改写全部带计数断言
 * - 段落替换用归档基准行号切 old 文本，再 host.replace（不能用当前行号）
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVE = 'scripts/archive/r4-3-lorebook-split/lorebook.orig.ts.txt';
const TARGET = 'src/stores/lorebook.ts';
const src = readFileSync(ARCHIVE, 'utf8');
const lines = src.split('\n');

function slice(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > lines.length) {
    throw new Error(`slice 参数非法：${a}-${b}（文件共 ${lines.length} 行）`);
  }
  const out = lines.slice(a - 1, b).join('\n');
  if (out.trim() === '') throw new Error(`slice ${a}-${b} 切出空串`);
  return out;
}

let host = src;

function replaceOrigLines(a, b, repl) {
  const old = slice(a, b);
  if (!host.includes(old)) throw new Error(`宿主段 ${a}-${b}（归档基准）未命中`);
  host = host.replace(old, repl);
}

function sub(from, to, expect = 1) {
  const n = host.split(from).length - 1;
  if (n !== expect) throw new Error(`锚 "${from.slice(0, 60)}" 命中 ${n} 次，期望 ${expect}`);
  host = host.split(from).join(to);
}

// ── 1. import 段：删掉搬走的依赖，加回三个模块 ──
replaceOrigLines(1, 33, `import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import {
  type Lorebook,
  type LorebookEntry,
  type LorebookCreateInput,
  type LorebookEntryCreateInput,
  type WorldDescription,
  type WorldUserProfile,
  validateLorebook,
} from '@/core/lorebook';
import { mergeKeptLocal } from '@/core/store-merge';
import { saveBlob, describeSaveResult } from '@/utils/save-blob';
import type { WorldTemplateId } from '@core/world-generator';
import {
  type HierarchyTreeNode,
  buildEntryTree,
  canSetEntryParent,
  applyEntryParent,
  getEntryChildren,
  getEntryDescendants,
  getEntryAncestors,
  moveEntryToLevelIn,
  reorderEntryInLevel,
} from './lorebook-hierarchy';
import { serializeLorebook, parseLorebookImport } from './lorebook-io';
import { runGenerateRandomWorldbook, runExtendWorldbook } from './lorebook-world-gen-run';
import type { EntryOpsContext } from './lorebook-entries';
import {
  runAddEntry,
  runUpdateEntry,
  runDeleteEntry,
  runDuplicateEntry,
  runMoveEntry,
  runToggleEntry,
} from './lorebook-entries';
// 类型与纯函数的公开面：拆分后调用方仍从本模块取，零改动
export type { HierarchyTreeNode };
export {
  getEntryChildren,
  getEntryDescendants,
  getEntryAncestors,
  buildEntryTree,
} from './lorebook-hierarchy';

`);

// ── 2. 删掉搬走的 describeWorldParseError + HierarchyTreeNode interface（原 35-77）──
replaceOrigLines(35, 77, '');

// ── 3. 层级管理块（520-771：注释头 + 8 个函数）→ 保留 store 包装 ──
replaceOrigLines(522, 798, `  // ── F06.6 层级管理（v1.1）──
  // 纯逻辑在 lorebook-hierarchy.ts；这里只负责取书、写提示、落盘。

  function getEntryChildren(
    lorebookId: string,
    parentId: string | null
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryChildrenIn(lb.entries, parentId);
  }

  function getEntryDescendants(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryDescendantsIn(lb.entries, entryId);
  }

  function getEntryAncestors(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryAncestorsIn(lb.entries, entryId);
  }

  /**
   * 检查是否可以将 entryId 的父节点设置为 newParentId
   * （规则见 lorebook-hierarchy.canSetEntryParent）
   */
  function canSetEntryParent(
    lorebookId: string,
    entryId: string,
    newParentId: string | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    return canSetEntryParentIn(lb.entries, entryId, newParentId);
  }

  /**
   * 设置条目的父节点
   * 自动调整该条目及其所有后代的 hierarchyLevel
   * @returns 是否成功
   */
  function setEntryParent(
    lorebookId: string,
    entryId: string,
    newParentId: string | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    if (!canSetEntryParentIn(lb.entries, entryId, newParentId)) {
      lastError.value = t('lb.cannotSetParent');
      return false;
    }

    applyEntryParent(lb.entries, entryId, newParentId);

    // 整体校验
    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.hierarchyValidateFailed', { errors: errors.join('；') });
      return false;
    }

    void persistLorebook(lorebookId);
    lastInfo.value = newParentId === null
      ? t('lb.movedToTop')
      : t('lb.parentSet');
    return true;
  }

  /**
   * 移动条目到指定层级深度
   * - level=0：设为顶层节点（parentId=null）
   * - level>0：仅调整 level，不改变 parentId（实际场景走 setEntryParent）
   * @returns 是否成功
   */
  function moveEntryToLevel(
    lorebookId: string,
    entryId: string,
    level: 0 | 1 | 2
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    // level=0 时设为顶层
    if (level === 0) {
      return setEntryParent(lorebookId, entryId, null);
    }

    const failure = moveEntryToLevelIn(lb.entries, entryId, level);
    if (failure === 'invalid-level') {
      lastError.value = t('lb.levelRange2');
      return false;
    }
    if (failure === 'need-parent') {
      lastError.value = t('lb.moveNeedParent', { level });
      return false;
    }
    if (failure === 'child-level-invalid') {
      const currentParentId = entry.parentId ?? null;
      const parentLevel = currentParentId === null
        ? 0
        : (lb.entries.find((e) => e.id === currentParentId)?.hierarchyLevel ?? 0);
      lastError.value = t('lb.childLevelInvalid', { level, parent: parentLevel });
      return false;
    }

    void persistLorebook(lorebookId);
    lastInfo.value = t('lb.movedToLevel', { level });
    return true;
  }

  /**
   * 在同级中重新排序条目（'up' 或 'down'）
   * 同级指具有相同 parentId 的兄弟节点
   */
  function reorderEntryInLevel(
    lorebookId: string,
    entryId: string,
    direction: 'up' | 'down'
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    if (!reorderEntryInLevelIn(lb.entries, entryId, direction)) return false;
    void persistLorebook(lorebookId);
    return true;
  }

  /**
   * 构建树状结构，用于 UI 渲染
   * 返回顶层节点列表，每个节点带 children 数组（递归）
   */
  function buildEntryTree(lorebookId: string): HierarchyTreeNode[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return buildEntryTreeIn(lb.entries);
  }

`);

// ── 4. 导出/导入（802-981：exportLorebook / importLorebookFile / downloadLorebook）──
replaceOrigLines(800, 981, `  /**
   * 导出 Lorebook 为 JSON（兼容 SillyTavern）
   * 序列化细节见 lorebook-io.serializeLorebook
   */
  function exportLorebook(id: string): string | null {
    const lb = lorebooks.value.find((l) => l.id === id);
    if (!lb) {
      lastError.value = t('lb.exportNotFound');
      return null;
    }
    return serializeLorebook(lb);
  }

  /**
   * 从 JSON 文件导入 Lorebook
   * 层级恢复规则见 lorebook-io.parseLorebookImport
   */
  async function importLorebookFile(file: File): Promise<string | null> {
    lastError.value = null;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Parameters<typeof parseLorebookImport>[0];
      const parsed = parseLorebookImport(json, file.name);

      const id = \`lorebook-\${Date.now()}\`;
      const now = new Date().toISOString();
      const lb: Lorebook = {
        id,
        name: parsed.name,
        description: '',
        entries: parsed.entries,
        scope: 'global',
        worldDescription: parsed.worldDescription,
        userProfile: parsed.userProfile,
        createdAt: now,
        updatedAt: now,
      };

      const errors = validateLorebook(lb);
      if (errors.length > 0) {
        lastError.value = t('lb.importValidateFailed', { errors: errors.join('；') });
        return null;
      }

      lorebooks.value.unshift(lb);
      currentLorebookId.value = id;
      await persistLorebook(id);
      lastInfo.value = t('lb.imported', { name: lb.name });
      return id;
    } catch (err) {
      lastError.value = t('lb.importFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * 导出世界书 JSON 给用户存盘
   *
   * @returns true 表示真的存下了；false = 找不到 / 用户在系统保存面板取消（都不得报"已导出"）
   */
  async function downloadLorebook(id: string): Promise<boolean> {
    const json = exportLorebook(id);
    if (json === null) return false;
    const lb = lorebooks.value.find((l) => l.id === id);
    const safeName = (lb?.name ?? 'lorebook').replace(/[^\\w\\u4e00-\\u9fa5-]/g, '_');
    const outcome = await saveBlob(\`\${safeName}.json\`, () => new Blob([json], { type: 'application/json' }));
    const saved = describeSaveResult(outcome);
    if (!saved) return false;
    lastInfo.value = saved.message;
    return true;
  }

`);

// ── 5. （世界生成转换函数已由第 10 步整块覆盖，本步废弃）──


// ── 6b. 条目动作 371-520 → lorebook-entries.ts 执行体 + 薄包装 ──
replaceOrigLines(371, 520, `  /**
   * 在当前 Lorebook 末尾新增条目
   * @returns 新条目 id（失败返回 null）
   */
  function addEntry(
    lorebookId: string,
    input?: Partial<LorebookEntryCreateInput>
  ): string | null {
    return runAddEntry(entryOpsCtx(), lorebookId, input);
  }

  /** 更新条目（patch 部分字段） */
  function updateEntry(
    lorebookId: string,
    entryId: string,
    patch: Partial<LorebookEntry>
  ): boolean {
    return runUpdateEntry(entryOpsCtx(), lorebookId, entryId, patch);
  }

  /** 删除条目 */
  function deleteEntry(lorebookId: string, entryId: string): void {
    runDeleteEntry(entryOpsCtx(), lorebookId, entryId);
  }

  /** 复制条目（追加到末尾） */
  function duplicateEntry(lorebookId: string, entryId: string): string | null {
    return runDuplicateEntry(entryOpsCtx(), lorebookId, entryId);
  }

  /**
   * 拖拽排序：将 fromId 移到 toId 之前/之后
   * @param position 'before' | 'after'
   */
  function moveEntry(
    lorebookId: string,
    fromId: string,
    toId: string,
    position: 'before' | 'after'
  ): void {
    runMoveEntry(entryOpsCtx(), lorebookId, fromId, toId, position);
  }

  /** 切换条目启用状态 */
  function toggleEntry(lorebookId: string, entryId: string): void {
    runToggleEntry(entryOpsCtx(), lorebookId, entryId);
  }

`);

// ── 6c. 注入条目动作的 ctx 工厂（放在 setStorageAdapter 之后、Lorebook 动作之前）──
sub(
  '  // ── Lorebook 动作 ──',
  '  /** 条目动作执行体的状态引用（引用不复制数据） */\n  function entryOpsCtx(): EntryOpsContext {\n    return { lorebooks, currentEntryId, lastError, persistLorebook };\n  }\n\n  // ── Lorebook 动作 ──'
);

// ── 6. 尾部纯函数（1376-1469：注释 + 5 个 helper）全删 ──
replaceOrigLines(1376, lines.length, '');

// ── 7. 别名导入：避免 store 内方法与导入函数重名 ──
sub(
  `import {
  type HierarchyTreeNode,
  buildEntryTree,
  canSetEntryParent,
  applyEntryParent,
  getEntryChildren,
  getEntryDescendants,
  getEntryAncestors,
  moveEntryToLevelIn,
  reorderEntryInLevel,
} from './lorebook-hierarchy';`,
  `import {
  type HierarchyTreeNode,
  buildEntryTree as buildEntryTreeIn,
  canSetEntryParent as canSetEntryParentIn,
  applyEntryParent,
  getEntryChildren as getEntryChildrenIn,
  getEntryDescendants as getEntryDescendantsIn,
  getEntryAncestors as getEntryAncestorsIn,
  moveEntryToLevelIn,
  reorderEntryInLevel as reorderEntryInLevelIn,
} from './lorebook-hierarchy';`
);

// ── 8. store 内引用的纯函数（export/import 已改成调用 io；world-gen 两个）──
sub(`      const entries = generatedWorldToEntries(generated);`, `      const entries = generatedWorldToEntries(generated);`, 1);
sub(`      const newEntries = generatedRegionsToEntries(regions, baseOrder);`, `      const newEntries = generatedRegionsToEntries(regions, baseOrder);`, 1);


// ── 10. 世界生成 action 下放为 runner（983-1307 → 两个薄包装）──
replaceOrigLines(983, 1307, `  // ── F06.8 世界观 AI 生成（迭代27）──
  // 执行体在 lorebook-world-gen-run.ts（状态经 WorldGenContext 传入）。

  /** AI 生成新世界（创建模式），失败返回 null */
  function generateRandomWorldbook(
    templateId: WorldTemplateId,
    scope: Lorebook['scope'] = 'global',
    sourceContext?: string,
    characterId?: string
  ): Promise<string | null> {
    return runGenerateRandomWorldbook(
      {
        lorebooks,
        currentLorebookId,
        currentEntryId,
        isGeneratingWorld,
        lastError,
        lastInfo,
        persistLorebook,
      },
      templateId,
      scope,
      sourceContext,
      characterId
    );
  }

  /** AI 扩展现有世界书，返回新增条目数（失败 0） */
  function extendWorldbook(lorebookId: string): Promise<number> {
    return runExtendWorldbook(
      {
        lorebooks,
        currentLorebookId,
        currentEntryId,
        isGeneratingWorld,
        lastError,
        lastInfo,
        persistLorebook,
      },
      lorebookId
    );
  }

`);

// ── 11. 末尾空行归一 + 残留校验 ──
host = host.replace(/\n{3,}/g, '\n\n');
if (!host.endsWith('\n')) host += '\n';

const leftovers = [
  'function logicToNumber',
  'function numberToLogic',
  'function positionToNumber',
  'function numberToPosition',
  'function parseEntryFromJson',
  'export interface HierarchyTreeNode',
  'SillyTavern 格式转换辅助',
];
for (const l of leftovers) {
  if (host.includes(l)) throw new Error(`宿主残留：${l}`);
}
// 搬走的实现体不应再出现在宿主
const movedBodies = [
  'const stack = [entryId];',
  'const nodeMap = new Map<string, HierarchyTreeNode>();',
  'const hierarchy: Record<string, LorebookHierarchyEntry> = {};',
  'let order = 100;',
];
for (const m of movedBodies) {
  if (host.includes(m)) throw new Error(`宿主残留实现：${m}`);
}

writeFileSync(TARGET, host);
console.log(`ok: 归档 ${lines.length} 行 → 宿主 ${host.split('\n').length - 1} 行`);
