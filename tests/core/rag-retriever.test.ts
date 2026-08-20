import { describe, test, expect } from 'vitest';
import {
  extractKeywords,
  retrieveChunks,
  retrieveRelevantChunks,
  buildRagContext,
} from '@core/rag-retriever';
import type { DataBankDocument } from '@core/data-bank';

// ── 测试夹具 ──

function makeDocument(
  id: string,
  name: string,
  chunks: string[]
): DataBankDocument {
  return {
    id,
    name,
    scope: 'global',
    chunks: chunks.map((content, index) => ({
      id: `${id}-${index}`,
      documentId: id,
      index,
      content,
      tokenCount: content.length,
    })),
    fileSize: 100,
    mimeType: 'text/plain',
    createdAt: '2026-07-22T00:00:00Z',
    updatedAt: '2026-07-22T00:00:00Z',
  };
}

describe('RAG 关键词检索器 (F09.2)', () => {
  describe('extractKeywords 关键词提取', () => {
    test('从中文消息提取关键词', () => {
      const messages = ['勇者在森林中遇到了精灵法师'];
      const keywords = extractKeywords(messages);
      expect(keywords.length).toBeGreaterThan(0);
      // 应包含一些相关双字组合
      expect(keywords.some((k) => k.includes('勇者') || k.includes('森林'))).toBe(true);
    });

    test('从英文消息提取关键词', () => {
      const messages = ['The wizard cast a fireball spell'];
      const keywords = extractKeywords(messages);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('wizard');
      expect(keywords).toContain('fireball');
    });

    test('过滤停用词', () => {
      const messages = ['这个是什么东西'];
      const keywords = extractKeywords(messages);
      // 停用词不应出现在结果中
      expect(keywords).not.toContain('这个');
      expect(keywords).not.toContain('什么');
    });

    test('空消息返回空数组', () => {
      expect(extractKeywords([])).toEqual([]);
      expect(extractKeywords([''])).toEqual([]);
    });

    test('多条消息合并提取', () => {
      const messages = ['讨论魔法', '魔法师很强', '法师使用魔法'];
      const keywords = extractKeywords(messages, 5);
      expect(keywords.length).toBeLessThanOrEqual(5);
      // "魔法" 应该高频出现
      expect(keywords.some((k) => k.includes('魔法'))).toBe(true);
    });

    test('限制最大关键词数', () => {
      const messages = ['苹果 香蕉 橙子 葡萄 西瓜 草莓 蓝莓 樱桃 柠檬 桃子'];
      const keywords = extractKeywords(messages, 3);
      expect(keywords.length).toBeLessThanOrEqual(3);
    });
  });

  describe('retrieveChunks 文档检索', () => {
    test('关键词匹配返回相关块', () => {
      const doc = makeDocument('d1', '魔法指南', [
        '魔法是一种超自然力量',
        '火球术是最基础的攻击魔法',
        '烹饪美食需要新鲜食材',
      ]);
      const results = retrieveChunks([doc], ['魔法', '火球']);
      expect(results.length).toBeGreaterThan(0);
      // 匹配的块应在结果中
      expect(results.some((r) => r.chunk.content.includes('魔法'))).toBe(true);
    });

    test('无匹配返回空数组', () => {
      const doc = makeDocument('d1', '文档', ['内容是关于烹饪的']);
      const results = retrieveChunks([doc], ['魔法', '武器']);
      expect(results).toEqual([]);
    });

    test('无关键词返回空数组', () => {
      const doc = makeDocument('d1', '文档', ['内容']);
      const results = retrieveChunks([doc], []);
      expect(results).toEqual([]);
    });

    test('无文档返回空数组', () => {
      const results = retrieveChunks([], ['关键词']);
      expect(results).toEqual([]);
    });

    test('按得分降序排序', () => {
      const doc = makeDocument('d1', '文档', [
        '魔法 魔法 魔法', // 3 次命中
        '魔法',           // 1 次命中
        '魔法 魔法',      // 2 次命中
      ]);
      const results = retrieveChunks([doc], ['魔法'], 3);
      expect(results).toHaveLength(3);
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
      expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
    });

    test('限制最大结果数', () => {
      const doc = makeDocument('d1', '文档', [
        '魔法内容一',
        '魔法内容二',
        '魔法内容三',
        '魔法内容四',
        '魔法内容五',
      ]);
      const results = retrieveChunks([doc], ['魔法'], 2);
      expect(results).toHaveLength(2);
    });

    test('matchedKeywords 包含命中的关键词', () => {
      const doc = makeDocument('d1', '文档', ['魔法与剑']);
      const results = retrieveChunks([doc], ['魔法', '剑', '盾']);
      expect(results[0]!.matchedKeywords).toContain('魔法');
      expect(results[0]!.matchedKeywords).toContain('剑');
      expect(results[0]!.matchedKeywords).not.toContain('盾');
    });

    test('多个文档混合检索', () => {
      const doc1 = makeDocument('d1', '魔法书', ['魔法咒语']);
      const doc2 = makeDocument('d2', '武器图鉴', ['剑和盾牌']);
      const results = retrieveChunks([doc1, doc2], ['魔法', '剑']);
      expect(results.length).toBeGreaterThanOrEqual(2);
      const docNames = results.map((r) => r.documentName);
      expect(docNames).toContain('魔法书');
      expect(docNames).toContain('武器图鉴');
    });

    test('结果包含文档元数据', () => {
      const doc = makeDocument('d1', '测试文档', ['匹配内容']);
      const results = retrieveChunks([doc], ['匹配']);
      expect(results[0]!.documentId).toBe('d1');
      expect(results[0]!.documentName).toBe('测试文档');
      expect(results[0]!.chunk).toBeDefined();
      expect(results[0]!.score).toBeGreaterThan(0);
    });
  });

  describe('retrieveRelevantChunks 集成检索', () => {
    test('从消息提取关键词并检索', () => {
      const doc = makeDocument('d1', '魔法指南', [
        '火球术是基础魔法',
        '剑术是战士的技能',
      ]);
      const results = retrieveRelevantChunks(
        [doc],
        ['我想学习火球术魔法']
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.content).toContain('火球术');
    });

    test('无文档时返回空', () => {
      const results = retrieveRelevantChunks([], ['消息']);
      expect(results).toEqual([]);
    });

    test('使用 config 控制参数', () => {
      const doc = makeDocument('d1', '文档', [
        '内容一',
        '内容二',
        '内容三',
      ]);
      const results = retrieveRelevantChunks(
        [doc],
        ['内容'],
        { maxChunks: 1 }
      );
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('recentMessageCount 限制消息数', () => {
      const doc = makeDocument('d1', '文档', ['魔法相关内容']);
      // 多条消息，但只有最后 1 条包含关键词
      const messages = ['无关消息一', '无关消息二', '魔法相关'];
      const results = retrieveRelevantChunks(
        [doc],
        messages,
        { recentMessageCount: 1 }
      );
      // 只从最后 1 条消息提取关键词
      expect(results.length).toBeGreaterThan(0);
    });

    test('相同输入命中缓存（返回同一引用），文档更新后失效', () => {
      const doc = makeDocument('d1', '魔法指南', [
        '火球术是基础魔法',
        '剑术是战士的技能',
      ]);
      const messages = ['我想学习火球术魔法'];
      const first = retrieveRelevantChunks([doc], messages);
      expect(first.length).toBeGreaterThan(0);

      // 相同输入：缓存命中，返回同一引用
      const second = retrieveRelevantChunks([doc], messages);
      expect(second).toBe(first);

      // 文档内容更新（updatedAt 变化 → 指纹变化 → 缓存失效）
      const updated = makeDocument('d1', '魔法指南', [
        '火球术是基础魔法（修订版）',
        '剑术是战士的技能',
      ]);
      updated.updatedAt = '2026-08-04T00:00:00.000Z';
      const third = retrieveRelevantChunks([updated], messages);
      expect(third).not.toBe(first);
      // 新文档内容可被检索到
      expect(third[0]!.chunk.content).toContain('修订版');
    });
  });

  describe('buildRagContext 构建注入文本', () => {
    test('构建包含标题和内容的文本', () => {
      const doc = makeDocument('d1', '魔法书', ['火球术是一种攻击魔法']);
      const results = retrieveChunks([doc], ['火球']);
      const context = buildRagContext(results);
      expect(context).toContain('[数据银行检索结果]');
      expect(context).toContain('魔法书');
      expect(context).toContain('火球术是一种攻击魔法');
    });

    test('空结果返回空字符串', () => {
      expect(buildRagContext([])).toBe('');
    });

    test('多段结果用分隔符连接', () => {
      const doc = makeDocument('d1', '文档', ['内容一', '内容二']);
      const results = retrieveChunks([doc], ['内容'], 2);
      const context = buildRagContext(results);
      expect(context).toContain('参考资料 1');
      expect(context).toContain('参考资料 2');
    });
  });
});
