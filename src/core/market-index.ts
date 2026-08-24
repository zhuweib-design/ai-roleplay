/**
 * 社区市场远程索引引擎 (G8 / T-11)
 *
 * 将「社区市场」从本地 Mock 升级为 GitHub 仓库索引：
 * - 从 GitHub 仓库拉取 JSON 清单（market/index.json）
 * - 清单列出可下载条目：角色卡 / 世界书 / 故事题材模板
 * - 直链下载条目内容并校验 SHA-256，哈希不符拒绝安装
 *
 * 网络依赖：
 * - 仅在用户主动进入远程市场并触发加载时请求网络
 * - 离线/失败时回退本地 Mock 市场，不影响既有功能
 */

// i18n-ignore-start  // 模型面/数据结构内容，非 UI 文案

/** 条目类型 */
export type MarketItemType = 'character' | 'worldbook' | 'template';

/** 清单条目 */
export interface MarketIndexItem {
  /** 条目 ID（唯一） */
  id: string;
  /** 条目类型 */
  type: MarketItemType;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 标签 */
  tags: string[];
  /** 作者 */
  author: string;
  /** 版本号 */
  version: string;
  /** 内容字节数 */
  size: number;
  /** SHA-256（十六进制小写） */
  sha256: string;
  /** 内容直链 */
  url: string;
}

/** 市场清单 */
export interface MarketIndexManifest {
  /** 清单版本 */
  version: number;
  /** 更新时间（ISO 8601） */
  updatedAt: string;
  /** 条目列表 */
  items: MarketIndexItem[];
}

/** 下载的条目内容（安装时使用） */
export interface DownloadedMarketItem {
  /** 对应清单条目 */
  item: MarketIndexItem;
  /** 校验通过的原始文本 */
  rawText: string;
  /** 解析后的内容对象 */
  content: unknown;
}

/** 默认清单地址（本仓库） */
export const DEFAULT_MARKET_INDEX_URL =
  'https://raw.githubusercontent.com/zhuweib-design/ai-roleplay/main/market/index.json';

/** 清单大小上限（512KB，防御异常清单） */
export const MAX_MANIFEST_BYTES = 512 * 1024;
/** 条目内容大小上限（4MB，防御超大条目） */
export const MAX_ITEM_BYTES = 4 * 1024 * 1024;

// ── 纯函数：清单解析（可单测） ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * 解析并校验市场清单文本
 * @returns 合法清单；结构非法时返回 null
 */
export function parseMarketIndex(rawText: string): MarketIndexManifest | null {
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (typeof data.version !== 'number' || !isString(data.updatedAt)) return null;
  if (!Array.isArray(data.items)) return null;

  const items: MarketIndexItem[] = [];
  for (const rawItem of data.items) {
    if (!isRecord(rawItem)) return null;
    const item: MarketIndexItem = {
      id: isString(rawItem.id) ? rawItem.id : '',
      type: isString(rawItem.type) && ['character', 'worldbook', 'template'].includes(rawItem.type)
        ? (rawItem.type as MarketItemType)
        : 'character',
      name: isString(rawItem.name) ? rawItem.name : '',
      description: isString(rawItem.description) ? rawItem.description : '',
      tags: Array.isArray(rawItem.tags) ? rawItem.tags.filter(isString) : [],
      author: isString(rawItem.author) ? rawItem.author : '',
      version: isString(rawItem.version) ? rawItem.version : '',
      size: typeof rawItem.size === 'number' ? rawItem.size : 0,
      sha256: isString(rawItem.sha256) ? rawItem.sha256.toLowerCase() : '',
      url: isString(rawItem.url) ? rawItem.url : '',
    };
    // 必填字段缺失 → 整清单非法
    if (!item.id || !item.sha256 || !item.url) return null;
    items.push(item);
  }

  return { version: data.version, updatedAt: data.updatedAt, items };
}

// ── 网络层 ──

/** 拉取清单（带大小上限） */
export async function fetchMarketIndex(
  url: string = DEFAULT_MARKET_INDEX_URL
): Promise<MarketIndexManifest | null> {
  const text = await fetchText(url, MAX_MANIFEST_BYTES);
  return parseMarketIndex(text);
}

/** 下载进度回调（received/total 为字节数，total 未知时为 -1） */
export type DownloadProgressFn = (
  received: number,
  total: number
) => void;

/**
 * 下载条目内容并校验 SHA-256
 * @param onProgress 流式进度回调（每读到一块触发；Content-Length 缺失时 total=-1）
 * @returns 校验通过的下载内容；哈希不符或解析失败返回 null
 */
export async function downloadMarketItem(
  item: MarketIndexItem,
  onProgress?: DownloadProgressFn
): Promise<DownloadedMarketItem | null> {
  const rawText = await fetchText(item.url, MAX_ITEM_BYTES, onProgress);
  const expectedHex = item.sha256.toLowerCase();
  if (expectedHex) {
    const ok = await verifySha256Hex(new TextEncoder().encode(rawText), expectedHex);
    if (!ok) return null;
  }
  let content: unknown;
  try {
    content = JSON.parse(rawText);
  } catch {
    return null;
  }
  return { item, rawText, content };
}

/** 读取文本：流式读取并上报进度；限制字节数，超限或请求失败抛错 */
async function fetchText(
  url: string,
  maxBytes: number,
  onProgress?: DownloadProgressFn
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  // 流式读取（支持进度上报）；无响应体流时回退一次性读取
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const total = res.headers.get('content-length')
      ? Number(res.headers.get('content-length'))
      : -1;
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (received > maxBytes) throw new Error('content too large');
        onProgress?.(received, total);
      }
    } finally {
      reader.releaseLock();
    }
    if (chunks.length === 0) return '';
    return new TextDecoder().decode(concatChunks(chunks));
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new Error('content too large');
  }
  return new TextDecoder().decode(buf);
}

/** 拼接 Uint8Array 块数组 */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// ── SHA-256 校验 ──

/**
 * 校验字节序列的 SHA-256 是否等于期望值（十六进制小写）
 */
export async function verifySha256Hex(
  bytes: Uint8Array,
  expectedHex: string
): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === expectedHex.toLowerCase();
}

// ── 内容类型解析 ──

/** 条目内容为角色卡时解析为 CharacterCard 兼容对象 */
export function parseCharacterItem(content: unknown): Record<string, unknown> | null {
  if (!isRecord(content) || !isString(content.name)) return null;
  return content as Record<string, unknown>;
}

/** 条目内容为世界书时解析为 Lorebook 兼容对象 */
export function parseWorldbookItem(content: unknown): Record<string, unknown> | null {
  if (!isRecord(content) || !isString(content.name) || !Array.isArray(content.entries)) {
    return null;
  }
  return content as Record<string, unknown>;
}

/** 条目内容为故事模板时解析为模板对象 */
export function parseTemplateItem(content: unknown): Record<string, unknown> | null {
  if (!isRecord(content) || !isString(content.id) || !isString(content.name)) return null;
  return content as Record<string, unknown>;
}
// i18n-ignore-end
