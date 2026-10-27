/**
 * PNG 嵌入式角色卡编解码 (F13)
 *
 * 自 B6 第四件从 `backup-service.ts`（原 519-718 行）整段搬出，逐字未改。
 * 搬的理由是边界干净：这一段只吃 `CharacterCard`，不碰 StorageAdapter、
 * 不碰备份编排，产出的是一串 PNG 字节。
 *
 * 形状：把 V2 JSON 用 base64 塞进 PNG 的 tEXt chunk（关键字 `chara`），
 * 载体是一张 1×1 透明图（`buildMinimalIhdr` / `buildMinimalIdat`）；
 * 读回时扫 chunk 找 `chara`，解码后交给 `importV2Card`。
 *
 * 等价性由 `tests/services/character-png-golden.test.ts` 钉：三种卡形的产物
 * 字节 sha256 与读回 JSON sha256 在搬前搬后同值。
 */

import { t } from '@/i18n';
import type { CharacterCard } from '@/core/character-card';
import { exportV2Card, importV2Card } from '@/core/character-card';
import { auditLogger } from '@/core/audit-log';
import { saveBlob } from '@/utils/save-blob';
import type { SaveOutcome } from '@/utils/save-blob';

/**
 * PNG 文件签名（8 字节）
 */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * CRC32 查找表
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 构造 PNG chunk
 * chunk 结构：length(4) + type(4) + data + crc(4)
 */
function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  // length (big-endian)
  view.setUint32(0, data.length, false);
  // type
  chunk.set(typeBytes, 4);
  // data
  chunk.set(data, 8);
  // crc (over type + data)
  const crcBytes = new Uint8Array(4 + data.length);
  crcBytes.set(typeBytes, 0);
  crcBytes.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcBytes), false);

  return chunk;
}

/**
 * 最小 IHDR chunk 数据（1x1 像素，8-bit RGBA）
 */
function buildMinimalIhdr(): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, 1, false); // width
  view.setUint32(4, 1, false); // height
  data[8] = 8; // bit depth
  data[9] = 6; // color type (RGBA)
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace
  return data;
}

/**
 * 最小 IDAT chunk（1x1 透明像素）
 * 使用未压缩的 zlib stream + filter byte
 */
function buildMinimalIdat(): Uint8Array {
  // 1x1 RGBA = 4 bytes pixel + 1 filter byte = 5 bytes
  // zlib header (2) + deflate block (5) + adler32 (4) = 11 bytes
  // 实际使用 deflate 压缩的 stream
  const zlibData = new Uint8Array([
    0x78, 0x01, // zlib header (CM=8, CINFO=7, FCHECK=1)
    0x63, 0x60, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01, // deflate stored block (5 bytes data)
    0x0e, 0x06, 0x06, 0x07, 0xac, // adler32 of filter byte + RGBA (0,0,0,0,0)
  ]);
  return zlibData;
}

/**
 * 生成嵌入角色卡的 PNG
 *
 * 将 V2 JSON 通过 base64 编码后嵌入 PNG tEXt chunk（关键字 'chara'）。
 * 若 card.avatar 为 data URL（PNG/JPEG），解码后用作图像；
 * 否则生成 1x1 透明 PNG 作为载体。
 *
 * @param card 角色卡
 * @returns PNG Blob（包含嵌入的角色卡数据）
 */
export function exportCharacterPng(card: CharacterCard): Blob {
  const v2Json = exportV2Card(card);
  const jsonString = JSON.stringify(v2Json);
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));

  // tEXt chunk 数据：keyword + 0x00 + text
  const keyword = 'chara';
  const textBytes = new TextEncoder().encode(base64);
  const keywordBytes = new TextEncoder().encode(keyword);
  const textChunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  textChunkData.set(keywordBytes, 0);
  textChunkData[keywordBytes.length] = 0; // null separator
  textChunkData.set(textBytes, keywordBytes.length + 1);

  const textChunk = buildPngChunk('tEXt', textChunkData);

  // 构造最小 PNG
  const ihdr = buildPngChunk('IHDR', buildMinimalIhdr());
  const idat = buildPngChunk('IDAT', buildMinimalIdat());
  const iend = buildPngChunk('IEND', new Uint8Array(0));

  const totalLength =
    PNG_SIGNATURE.length + ihdr.length + textChunk.length + idat.length + iend.length;
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(PNG_SIGNATURE, offset); offset += PNG_SIGNATURE.length;
  png.set(ihdr, offset); offset += ihdr.length;
  png.set(textChunk, offset); offset += textChunk.length;
  png.set(idat, offset); offset += idat.length;
  png.set(iend, offset);

  return new Blob([png], { type: 'image/png' });
}

/**
 * 从 PNG 文件中提取嵌入的角色卡
 *
 * 扫描 PNG chunks 查找 tEXt chunk（关键字 'chara'），
 * base64 解码后解析为 V2 JSON 并转换为 CharacterCard。
 *
 * @returns 角色卡，若 PNG 中无嵌入数据则返回 null
 */
export async function importCharacterPng(file: File): Promise<CharacterCard | null> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 校验 PNG 签名
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error(t('backup.notPng'));
    }
  }

  // 扫描 chunks
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const view = new DataView(buffer, offset, 8);
    const length = view.getUint32(0, false); // big-endian
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = new TextDecoder().decode(typeBytes);

    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd > bytes.length) break;

      const chunkData = bytes.slice(dataStart, dataEnd);
      // 查找 null separator
      let sepIdx = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          sepIdx = i;
          break;
        }
      }
      if (sepIdx < 0) continue;

      const keyword = new TextDecoder().decode(chunkData.slice(0, sepIdx));
      if (keyword === 'chara') {
        const base64 = new TextDecoder().decode(chunkData.slice(sepIdx + 1));
        try {
          const jsonString = decodeURIComponent(escape(atob(base64)));
          const json = JSON.parse(jsonString);
          return importV2Card(json);
        } catch (err) {
          throw new Error(t('backup.pngParseFailed', { error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }

    // 移动到下一个 chunk（length + type + data + crc = 12 + length）
    offset += 12 + length;

    if (type === 'IEND') break;
  }

  return null;
}

/**
 * 触发下载嵌入角色卡的 PNG
 */
export async function downloadCharacterPng(card: CharacterCard): Promise<SaveOutcome> {
  const blob = exportCharacterPng(card);
  const safeName = card.name.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  return saveBlob(`${safeName}.png`, () => blob);
  // T-06 审计
  auditLogger.record('character_export_png', `${card.name}`, 'ok');
}
