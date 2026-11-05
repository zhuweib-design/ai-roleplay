/**
 * 可选下载包（社区市场目录）的完整性守卫
 *
 * 产品口径（Q2）：安装包与首启**不带任何角色**，内置角色包改为「可选下载包」——
 * 用户在社区市场里按需下载。仓库里的 `market/` 就是这份包的目录与内容。
 *
 * 这条守卫盯的是「改了卡片忘了改清单」这一类**静默失败**：
 * - `size` / `sha256` 对不上 ⇒ 下载能成功、校验必失败，界面只报一句“校验失败”，
 *   看不出是清单过期还是网络被篡改；
 * - 卡片文件在 `market/cards/` 里但没登记 ⇒ 用户在市场里根本看不到它；
 * - 登记了但文件不存在 ⇒ 点下载直接 404。
 *
 * 这三种都能在提交前用本机文件算出来，没理由等到用户点下载才暴露。
 * 哈希按 **LF 字节** 计算：GitHub raw 提供的是仓库 blob（LF），而 Windows 检出
 * 可能是 CRLF，所以先把换行归一化再算，避免平台差异造成假红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseMarketIndex, parseCharacterItem, type MarketIndexItem } from '@/core/market-index';
import { importV2Card } from '@/core/character-card';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MARKET_DIR = path.join(ROOT, 'market');
/** 下载直链的发布位置：`main` 分支是市场专用镜像（见 D-1） */
const RAW_BASE = 'https://raw.githubusercontent.com/zhuweib-design/ai-roleplay/main/market/';

const rawIndex = readFileSync(path.join(MARKET_DIR, 'index.json'), 'utf8');

/** 读出条目对应文件的发布字节（已把 CRLF 归一化成 LF） */
function publishedBytes(item: MarketIndexItem): Buffer {
  const relative = item.url.startsWith(RAW_BASE) ? item.url.slice(RAW_BASE.length) : '';
  const file = path.join(MARKET_DIR, relative);
  return Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('社区市场目录：可选下载包', () => {
  const manifest = parseMarketIndex(rawIndex);

  it('清单本身可解析（结构非法时 parseMarketIndex 返回 null）', () => {
    expect(manifest, 'market/index.json 结构非法：缺 version/updatedAt/items 或条目缺必填字段').not.toBeNull();
  });

  it('至少收录四个角色，够得上“一个包”', () => {
    const characters = manifest!.items.filter((i) => i.type === 'character');
    expect(characters.length).toBeGreaterThanOrEqual(4);
  });

  it('条目 id 唯一、名称非空', () => {
    const ids = manifest!.items.map((i) => i.id);
    expect(new Set(ids).size, `重复 id：${ids.join(', ')}`).toBe(ids.length);
    for (const item of manifest!.items) {
      expect(item.name.trim(), `${item.id} 没有名称`).not.toBe('');
      expect(item.license.trim(), `${item.id} 缺许可证`).not.toBe('');
    }
  });

  it('每个条目都指向 main 镜像，且指向的文件确实存在', () => {
    for (const item of manifest!.items) {
      expect(
        item.url.startsWith(RAW_BASE),
        `${item.id} 的下载地址不在发布位置：${item.url}`
      ).toBe(true);
      expect(() => publishedBytes(item), `${item.id} 指向的文件不存在`).not.toThrow();
    }
  });

  it('size 与 sha256 都与发布字节一致（改了卡片就必须重算清单）', () => {
    for (const item of manifest!.items) {
      const bytes = publishedBytes(item);
      expect(bytes.length, `${item.id} 的 size 与文件不一致（清单 ${item.size}，实际 ${bytes.length}）`).toBe(item.size);
      expect(sha256(bytes), `${item.id} 的 sha256 与文件不一致`).toBe(item.sha256);
    }
  });

  it('每个条目都能被导入成一张有开场白的角色卡', () => {
    for (const item of manifest!.items) {
      if (item.type !== 'character') continue;
      const content: unknown = JSON.parse(publishedBytes(item).toString('utf8'));
      expect(parseCharacterItem(content), `${item.id} 不是合法的角色卡内容`).not.toBeNull();
      const card = importV2Card(content);
      expect(card.name.trim(), `${item.id} 的角色卡没有名字`).not.toBe('');
      expect(card.firstMessage.trim(), `${item.id} 没有开场白，装进库后点进去是空白`).not.toBe('');
    }
  });

  it('market/cards/ 下没有未登记的文件（漏登记 = 用户看不到）', () => {
    const registered = new Set(
      manifest!.items
        .map((i) => i.url.replace(RAW_BASE, ''))
        .filter((f) => f.startsWith('cards/'))
    );
    for (const file of readdirSync(path.join(MARKET_DIR, 'cards'))) {
      expect(registered.has(`cards/${file}`), `market/cards/${file} 没有写进 index.json`).toBe(true);
    }
  });

  it('守卫本身不是空转：改动一个字节就应当对不上', () => {
    const item = manifest!.items[0]!;
    const bytes = publishedBytes(item);
    const tampered = Buffer.concat([bytes, Buffer.from('\n', 'utf8')]);
    expect(sha256(tampered)).not.toBe(item.sha256);
  });
});
