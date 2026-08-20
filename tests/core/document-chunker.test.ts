import { describe, test, expect } from 'vitest';
import { chunkDocument, buildChunks } from '@core/document-chunker';
import { MAX_CHUNK_LENGTH } from '@core/data-bank';

describe('文档分块器 (F09.1)', () => {
  describe('chunkDocument 基础分块', () => {
    test('按双换行分割段落', async () => {
      const text = '第一段内容\n\n第二段内容\n\n第三段内容';
      const chunks = chunkDocument(text);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toBe('第一段内容');
      expect(chunks[1]).toBe('第二段内容');
      expect(chunks[2]).toBe('第三段内容');
    });

    test('单个短段落保持不变', async () => {
      const text = '这是一个短段落。';
      const chunks = chunkDocument(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('这是一个短段落。');
    });

    test('空文本返回空数组', async () => {
      expect(chunkDocument('')).toEqual([]);
      expect(chunkDocument('   ')).toEqual([]);
    });

    test('null/undefined 返回空数组', async () => {
      expect(chunkDocument(null as unknown as string)).toEqual([]);
      expect(chunkDocument(undefined as unknown as string)).toEqual([]);
    });

    test('过滤空段落', async () => {
      const text = '段落一\n\n\n\n段落二';
      const chunks = chunkDocument(text);
      expect(chunks).toHaveLength(2);
    });

    test('去除段落首尾空白', async () => {
      const text = '  有空白的段落  \n\n  另一段  ';
      const chunks = chunkDocument(text);
      expect(chunks[0]).toBe('有空白的段落');
      expect(chunks[1]).toBe('另一段');
    });
  });

  describe('超长段落切分', () => {
    test('超过 maxChunkLength 的段落被切分', async () => {
      const longPara = '这是一段很长的文字。'.repeat(200); // 约 2000 字
      const text = longPara;
      const chunks = chunkDocument(text, { maxChunkLength: 500 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(500);
      }
    });

    test('默认 maxChunkLength 为 MAX_CHUNK_LENGTH (2000)', async () => {
      const text = '短文本';
      const chunks = chunkDocument(text);
      expect(chunks).toHaveLength(1);
      expect(MAX_CHUNK_LENGTH).toBe(2000);
    });

    test('超长段落按句号切分并合并', async () => {
      // 每句 5 字符（"第一句话。"），maxLen=12 时合并 2 句后超限
      const text = '第一句话。第二句话。第三句话。第四句话。第五句话。';
      const chunks = chunkDocument(text, { maxChunkLength: 12 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(12);
      }
    });

    test('单个超长句子按长度强制切分', async () => {
      const longSentence = '字'.repeat(300);
      const text = longSentence;
      const chunks = chunkDocument(text, { maxChunkLength: 100 });
      expect(chunks.length).toBe(3);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
    });

    test('混合长短段落', async () => {
      const short = '短段落';
      const long = '长段落内容。'.repeat(100);
      const text = `${short}\n\n${long}\n\n${short}`;
      const chunks = chunkDocument(text, { maxChunkLength: 50 });
      expect(chunks.length).toBeGreaterThan(3);
    });
  });

  describe('自定义选项', () => {
    test('自定义分隔符', async () => {
      const text = '段落一---段落二---段落三';
      const chunks = chunkDocument(text, { separator: '---' });
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toBe('段落一');
    });

    test('自定义 maxChunkLength', async () => {
      const text = '短文本但限制很小';
      const chunks = chunkDocument(text, { maxChunkLength: 3 });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('buildChunks 元数据生成', () => {
    test('为分块生成 ID 和序号', async () => {
      const rawChunks = ['内容一', '内容二', '内容三'];
      const chunks = await buildChunks('doc-1', rawChunks);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]!.id).toBe('doc-1-0');
      expect(chunks[1]!.id).toBe('doc-1-1');
      expect(chunks[2]!.id).toBe('doc-1-2');
      expect(chunks[0]!.documentId).toBe('doc-1');
      expect(chunks[0]!.index).toBe(0);
      expect(chunks[1]!.index).toBe(1);
    });

    test('包含 token 计数', async () => {
      const rawChunks = ['Hello world', '你好世界'];
      const chunks = await buildChunks('doc-1', rawChunks);
      expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
      expect(chunks[1]!.tokenCount).toBeGreaterThan(0);
    });

    test('空数组返回空', async () => {
      const chunks = await buildChunks('doc-1', []);
      expect(chunks).toEqual([]);
    });

    test('content 正确映射', async () => {
      const rawChunks = ['内容 A', '内容 B'];
      const chunks = await buildChunks('doc-1', rawChunks);
      expect(chunks[0]!.content).toBe('内容 A');
      expect(chunks[1]!.content).toBe('内容 B');
    });
  });
});
