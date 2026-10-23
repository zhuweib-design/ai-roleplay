/**
 * lorebook-world-gen — 世界生成结果到条目的纯转换（R4-3 拆分）
 *
 * 从 `stores/lorebook.ts` 切出。这里只做 `GeneratedWorld` / `GeneratedRegion[]`
 * 到 `LorebookEntry[]` 的映射与解析失败分类，不发起请求、不写 store、不落盘——
 * 那些留在 store 的 `generateRandomWorldbook` / `extendWorldbook`。
 */
import { t } from '@/i18n';
import type { LorebookEntry } from '@/core/lorebook';
import {
  type GeneratedRegion,
  type GeneratedWorld,
  describeWorldParseFailure,
} from '@core/world-generator';

/**
 * 世界创建解析失败时，按"哪一步失败 + 证据"给出可定位的提示。
 *
 * 旧写法是统一一句"无法解析 AI 返回的世界数据"，用户拿不到任何可行动信息；
 * 而这句话背后至少有五种成因（空返回 / 不是 JSON / 被输出上限截断 / 顶层字段不对 /
 * 大区缺 title），处理方式各不相同，所以把分类和证据一起报出来。
 */
export function describeWorldParseError(raw: string): string {
  const f = describeWorldParseFailure(raw);
  const params = {
    chars: f.chars,
    preview: f.preview,
    keys: f.keys.join('、'),
    count: f.regionCount,
  };
  switch (f.kind) {
    case 'empty':
      return t('lb.genParseEmpty');
    case 'not-json':
      return t('lb.genParseNotJson', params);
    case 'broken-json':
      return t('lb.genParseBroken', params);
    case 'no-world':
      return t('lb.genParseNoWorld', { keys: params.keys, preview: params.preview, chars: params.chars });
    case 'no-regions':
      return t('lb.genParseNoRegions', { keys: params.keys, preview: params.preview, chars: params.chars });
    case 'region-shape':
      return t('lb.genParseRegionShape', { count: params.count, keys: params.keys });
    default:
      return t('lb.genParseFailed');
  }
}

/**
 * 将 GeneratedWorld 转换为 LorebookEntry[]（含层级关系）
 *
 * 层级映射：
 * - world → Lorebook.worldDescription
 * - region (GeneratedRegion) → LorebookEntry(hierarchyLevel=1, parentId=null)
 * - subArea (GeneratedSubArea) → LorebookEntry(hierarchyLevel=2, parentId=region.id)
 *
 * @returns [regionEntries, subAreaEntries]（按顺序合并即为完整 entries）
 */
export function generatedWorldToEntries(generated: GeneratedWorld): LorebookEntry[] {
  const entries: LorebookEntry[] = [];
  let order = 100;

  for (const region of generated.regions) {
    const regionId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
    entries.push({
      id: regionId,
      title: region.title,
      keys: region.keys,
      content: region.content,
      strategy: 'keyword',
      probability: 100,
      insertionOrder: order,
      insertionPosition: 'afterCharDefs',
      depth: 4,
      group: '',
      enabled: true,
      logic: 'AND_ANY',
      hierarchyLevel: 1,
      parentId: null,
    });
    order += 10;

    for (const sub of region.subAreas) {
      const subId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
      entries.push({
        id: subId,
        title: sub.title,
        keys: sub.keys,
        content: sub.content,
        strategy: 'keyword',
        probability: 100,
        insertionOrder: order,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 2,
        parentId: regionId,
      });
      order += 10;
    }
  }

  return entries;
}

/**
 * 将扩展生成的 GeneratedRegion[] 转换为 LorebookEntry[]
 *
 * 若 region 含 subAreas，则 region 作为大区（level=1）+ subAreas 作为子区域（level=2，parentId=region）
 * 若 region 无 subAreas，则作为顶层条目（level=0）插入
 */
export function generatedRegionsToEntries(
  regions: GeneratedRegion[],
  baseOrder = 100
): LorebookEntry[] {
  const entries: LorebookEntry[] = [];
  let order = baseOrder;

  for (const region of regions) {
    const hasSubAreas = region.subAreas.length > 0;
    const regionId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
    const regionLevel = hasSubAreas ? 1 : 0;

    entries.push({
      id: regionId,
      title: region.title,
      keys: region.keys,
      content: region.content,
      strategy: 'keyword',
      probability: 100,
      insertionOrder: order,
      insertionPosition: 'afterCharDefs',
      depth: 4,
      group: '',
      enabled: true,
      logic: 'AND_ANY',
      hierarchyLevel: regionLevel,
      parentId: null,
    });
    order += 10;

    for (const sub of region.subAreas) {
      const subId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
      entries.push({
        id: subId,
        title: sub.title,
        keys: sub.keys,
        content: sub.content,
        strategy: 'keyword',
        probability: 100,
        insertionOrder: order,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 2,
        parentId: regionId,
      });
      order += 10;
    }
  }

  return entries;
}
