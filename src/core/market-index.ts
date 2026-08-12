/**
 * 社区市场 v1 索引 (T-11)
 *
 * 市场 v1 采用「GitHub 仓库索引」形态(无后端):
 * - 一个 JSON 清单文件列出可下载项(角色卡/世界书/模板)
 * - 每项含直链 url + sha256 哈希,安装时校验完整性
 * - 清单格式版本化,校验器拒绝未知字段与非法条目
 *
 * 设计:
 * - validateMarketIndex:解析并校验清单(幂等,返回条目列表或错误)
 * - verifyFileHash:Web Crypto SHA-256 校验下载文件(防篡改/损坏)
 */

/** 清单格式版本 */
export const MARKET_INDEX_VERSION = 1;

/** 可下载项类型 */
export type MarketIndexItemType = 'character' | 'lorebook' | 'template';

/** 清单条目 */
export interface MarketIndexItem {
  /** 全局唯一 ID(推荐 UUID) */
  id: string;
  /** 类型 */
  type: MarketIndexItemType;
  /** 显示名称 */
  name: string;
  /** 版本号(semver) */
  version: string;
  /** 作者 */
  author: string;
  /** 一句话描述 */
  description?: string;
  /** 文件直链(https) */
  url: string;
  /** SHA-256 十六进制(小写) */
  sha256: string;
  /** 文件大小(字节) */
  size: number;
  /** 分类标签 */
  tags?: string[];
  /** 更新时间(ISO) */
  updatedAt: string;
}

/** 清单文件结构 */
export interface MarketIndexFile {
  version: number;
  /** 仓库名(用于展示) */
  name: string;
  items: MarketIndexItem[];
}

/** 校验结果 */
export interface MarketIndexResult {
  ok: boolean;
  items: MarketIndexItem[];
  errors: string[];
}

/** 校验单个条目,返回错误信息数组(空=合法) */
export function validateMarketItem(item: unknown, idx: number): string[] {
  const errors: string[] = [];
  if (typeof item !== 'object' || item === null) {
    return [`条目 ${idx} 不是对象`];
  }
  const it = item as Partial<MarketIndexItem>;

  if (typeof it.id !== 'string' || it.id.length === 0) {
    errors.push(`条目 ${idx} 缺少 id`);
  }
  if (it.type !== 'character' && it.type !== 'lorebook' && it.type !== 'template') {
    errors.push(`条目 ${idx} type 非法:${String(it.type)}`);
  }
  if (typeof it.name !== 'string' || it.name.length === 0) {
    errors.push(`条目 ${idx} 缺少 name`);
  }
  if (typeof it.version !== 'string' || !/^\d+\.\d+\.\d+/.test(it.version)) {
    errors.push(`条目 ${idx} version 非法:${String(it.version)}`);
  }
  if (typeof it.author !== 'string' || it.author.length === 0) {
    errors.push(`条目 ${idx} 缺少 author`);
  }
  if (typeof it.url !== 'string' || !/^https:\/\//.test(it.url)) {
    errors.push(`条目 ${idx} url 必须为 https 直链`);
  }
  if (typeof it.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(it.sha256)) {
    errors.push(`条目 ${idx} sha256 非法(需 64 位小写十六进制)`);
  }
  if (typeof it.size !== 'number' || it.size <= 0 || !Number.isFinite(it.size)) {
    errors.push(`条目 ${idx} size 非法`);
  }
  if (it.updatedAt !== undefined && typeof it.updatedAt !== 'string') {
    errors.push(`条目 ${idx} updatedAt 非法`);
  }
  return errors;
}

/**
 * 解析并校验市场索引 JSON
 *
 * @param json 任意 JSON(通常来自 fetch 清单 URL)
 * @returns 校验结果;失败时 items 为空,errors 含全部错误
 */
export function validateMarketIndex(json: unknown): MarketIndexResult {
  const errors: string[] = [];

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, items: [], errors: ['清单不是对象'] };
  }
  const file = json as Partial<MarketIndexFile>;

  if (file.version !== MARKET_INDEX_VERSION) {
    errors.push(`清单版本不支持:${String(file.version)}(当前支持 v${MARKET_INDEX_VERSION})`);
  }
  if (typeof file.name !== 'string' || file.name.length === 0) {
    errors.push('清单缺少 name');
  }
  if (!Array.isArray(file.items)) {
    errors.push('清单缺少 items 数组');
  }

  const items: MarketIndexItem[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(file.items)) {
    file.items.forEach((item, idx) => {
      const itemErrors = validateMarketItem(item, idx);
      if (itemErrors.length > 0) {
        errors.push(...itemErrors);
        return;
      }
      const it = item as MarketIndexItem;
      if (seenIds.has(it.id)) {
        errors.push(`条目 ${idx} id 重复:${it.id}`);
        return;
      }
      seenIds.add(it.id);
      items.push(it);
    });
  }

  return { ok: errors.length === 0, items, errors };
}

/**
 * 计算文件 SHA-256(十六进制小写)
 * 用于安装前校验下载内容与清单哈希一致
 */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    data instanceof Uint8Array ? (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 校验下载内容与清单条目哈希一致
 * @returns true=一致;false=不匹配或输入非法
 */
export async function verifyMarketItemHash(
  item: Pick<MarketIndexItem, 'sha256'>,
  data: ArrayBuffer | Uint8Array
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(item.sha256)) return false;
  const actual = await sha256Hex(data);
  return actual === item.sha256;
}

