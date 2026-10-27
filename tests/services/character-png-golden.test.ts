/**
 * B6 拆分护栏：PNG 嵌入式角色卡编解码的输出指纹（搬之前记，搬完必须同一个值）
 *
 * `backup-service.ts` 720 行里最独立的一段是 PNG tEXt 编解码（计划原文点名
 * 519-718 行），要把它搬成单独模块。这段是纯字节工艺：CRC32 表、chunk 装配、
 * base64(V2 JSON) 的嵌入与扫描，**任何一处算错都会改变产物字节**，而界面只
 * 显示"已导出"，看不出坏在哪。所以钉成 sha256：
 * - 正例钉两样：PNG 产物的字节指纹（导出侧全链路）、读回来的角色卡 JSON 指纹
 *   （导入侧全链路）。`exportV2Card` 不写时间戳也不摇随机数，产物可复现。
 * - 负例钉"实际会怎样"：只有签名、截断、谎报 chunk 长度三种坏输入各自的落点。
 *
 * 语言钉成 zh：错误文案走 `t()`，不钉就跟 navigator 语言走，跨平台不稳定。
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { setLocale } from '@/i18n';
import { exportCharacterPng, importCharacterPng } from '@/services/backup-service';
import type { CharacterCard } from '@core/character-card';

/** 搬前后必须一致的六组读数（3 种卡形 × 导出字节 / 导入读回，2026-10-27 在搬之前的实现上实测） */
const EXPECTED: Record<string, string> = {
  '无头像卡-字节': 'f5e62f72d7514a18d9c293b0945addfcc4a57fdf06d5be3c2104b75979d915fc',
  '无头像卡-读回': '40c7bb4abecda428a3a861c04a6fdd11c27f24285063bcb6813759a943436be9',
  '中文长文本卡-字节': 'cbcff8d0f22843dc7a8f9acd2f769c2488e1b42cf297ac85b7645ef4eddd738f',
  '中文长文本卡-读回': '72db5928fc85b2697803e6ddcbe417156e675a17d22e65b1cacf99ed2688c827',
  '带扩展字段卡-字节': 'c47e1eb53a9ebdf18642ccaa824a82153075d3be93e4d941301e325a2cdccb03',
  '带扩展字段卡-读回': '5c7b9c9385e6d0c166dd6a0523dc7022723f8ffefbfec1c68dd3a445c890347e',
};

const ISO_DATE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * 读回的卡片有两处天生就是每轮不同的：`importV2Card` 重新生成一个 UUID 当
 * 角色卡 id，并把 createdAt / updatedAt 盖成当前时间。直接压指纹必然每轮都变
 * ——那是量具在抖，不是产物在抖（实测：抹掉时间戳仍不稳，加上 id 才稳）。
 * 抹平这两样以后，剩下的结构与内容仍然全程受钉。
 */
function sha256Json(value: unknown): string {
  return sha256(JSON.stringify(value).replace(ISO_DATE, 'D').replace(UUID, 'UUID'));
}

function sha256(data: Uint8Array | string): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? data : Buffer.from(data))
    .digest('hex');
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'card-1',
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

/** 各种会踩到边界的卡片形状 */
const PLAIN = makeCard();
const LONG_CJK = makeCard({
    name: '春山藏玉·第七夜',
    description: '一段足够长的中文描述，用来把 tEXt chunk 推过多字节边界。'.repeat(60),
    personality: '温柔、克制、会记账',
    firstMessage: '「你终于来了。」她说，顺手把灯芯挑亮了一格。',
    exampleMessages: '<character>你好</character>\n<user>好久不见</user>',
    alternateGreetings: ['第一句', '第二句', '第三句'],
    tags: ['奇幻', '治愈', '长文本'],
    attributes: { profession: '记录员', level: 42, experience: 7 },
});
const WITH_EXT = makeCard({
    name: 'Ext Card',
    avatar: '',
    characterNote: { text: '作者注：这一张带扩展字段', depth: 3, role: 'system' },
    talkativeness: 88,
    ext: { model: 'gpt-4o-mini', profileId: 'p-1', temperature: 0.7, maxTokens: 1024 },
  });

const CASES: Record<string, CharacterCard> = {
  '无头像卡': PLAIN,
  '中文长文本卡': LONG_CJK,
  '带扩展字段卡': WITH_EXT,
};

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * `blob.arrayBuffer()` 的返回类型是 `ArrayBufferLike`（可能是 SharedArrayBuffer 支撑），
 * 而 `BlobPart` 只认 `ArrayBuffer` 支撑的视图。这里收窄一次类型，不改任何字节。
 */
function asPart(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart;
}

describe('PNG 角色卡编解码输出指纹（B6 拆分护栏）', () => {
  it('三种卡形的产物字节与读回 JSON 都与基线一致', async () => {
    setLocale('zh');
    const readings: Record<string, string> = {};

    for (const [name, card] of Object.entries(CASES)) {
      const blob = exportCharacterPng(card);
      const bytes = await bytesOf(blob);
      readings[`${name}-字节`] = sha256(bytes);

      const file = new File([asPart(bytes)], `${name}.png`, { type: 'image/png' });
      const restored = await importCharacterPng(file);
      readings[`${name}-读回`] = sha256Json(restored);
    }

    // 整表比对：红的时候点名是哪一种卡形、导出侧还是导入侧
    expect(readings).toEqual(EXPECTED);
  });

  it('产物确实是可读的 PNG：签名、tEXt 关键字与 round-trip 保字段', async () => {
    setLocale('zh');
    const card = LONG_CJK;
    const bytes = await bytesOf(exportCharacterPng(card));

    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      expect(bytes[i]).toBe(PNG_SIGNATURE[i]);
    }
    const asText = new TextDecoder().decode(bytes);
    expect(asText).toContain('tEXt');
    expect(asText).toContain('chara');
    expect(asText).toContain('IEND');

    const restored = await importCharacterPng(
      new File([asPart(bytes)], 'x.png', { type: 'image/png' }),
    );
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe(card.name);
    expect(restored!.description).toBe(card.description);
    expect(restored!.alternateGreetings).toEqual(card.alternateGreetings);
    // attributes 三个键都要活着回来。这条断言的形状有段来历：我最初给夹具塞了
    // mood / nested 两个 `CharacterAttributes` 里不存在的键，读回只剩 level，
    // 于是记了一条"往返丢字段"的缺陷；类型检查逼我换成合法字段后，三键全在——
    // 丢的是不该存在的键，缺陷在量具不在产品。留这句话是给下一次同样的冲动。
    expect(restored!.attributes).toEqual(card.attributes);
  });

  it('负例钉住现状：非 PNG 报错，纯签名与截断文件都安静返回 null', async () => {
    setLocale('zh');
    await expect(
      importCharacterPng(new File([new Uint8Array([1, 2, 3, 4, 5])], 'a.bin')),
    ).rejects.toThrow('不是有效的 PNG');

    // 只有签名：chunk 循环一次都不进
    const bare = new File([PNG_SIGNATURE], 'bare.png', { type: 'image/png' });
    await expect(importCharacterPng(bare)).resolves.toBeNull();

    // 签名后不足 8 字节：循环条件 offset + 8 <= length 先挡住，读不到首部也不会抛
    const truncated = new File([new Uint8Array([...PNG_SIGNATURE, 0, 0, 0])], 'cut.png');
    await expect(importCharacterPng(truncated)).resolves.toBeNull();

    // 声称长度远超文件真实的首部（65535）：不越界读，直接跳出门外返回 null
    const lying = new File(
      [new Uint8Array([...PNG_SIGNATURE, 0, 0, 255, 255, 0x49, 0x48, 0x44, 0x52])],
      'lie.png',
    );
    await expect(importCharacterPng(lying)).resolves.toBeNull();
  });
});
