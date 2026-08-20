/**
 * story-templates 单元测试 (T-08 故事引擎模板库)
 *
 * 覆盖：
 * - STORY_TEMPLATES 包含通用 + 4 类题材模板
 * - 每个模板字段完整性（名称/描述/风格引导/类型候选）
 * - 模板 ID 唯一性
 * - getTemplateMeta 缺省/未知 ID 回退通用模板
 * - createEmptyResult 可携带 templateId
 */
import { describe, test, expect } from 'vitest';
import { STORY_TEMPLATES, getTemplateMeta, type StoryTemplateId } from '@core/story-templates';
import { createEmptyResult } from '@core/story-types';

describe('story-templates (T-08 模板库)', () => {
  test('包含通用 + 4 类题材模板', () => {
    const ids = STORY_TEMPLATES.map((tmpl) => tmpl.id);
    expect(ids).toContain('generic');
    expect(ids).toContain('fantasy');
    expect(ids).toContain('sci-fi');
    expect(ids).toContain('modern');
    expect(ids).toContain('apocalypse');
    expect(STORY_TEMPLATES.length).toBe(5);
  });

  test('模板 ID 唯一', () => {
    const ids = STORY_TEMPLATES.map((tmpl) => tmpl.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('每个题材模板字段完整', () => {
    for (const tmpl of STORY_TEMPLATES) {
      expect(tmpl.name.length).toBeGreaterThan(0);
      expect(tmpl.description.length).toBeGreaterThan(0);
      expect(tmpl.styleGuide.length).toBeGreaterThan(0);
      expect(tmpl.worldTypes.length).toBeGreaterThan(0);
      expect(tmpl.sceneTypes.length).toBeGreaterThan(0);
      expect(tmpl.eventTypes.length).toBeGreaterThan(0);
    }
  });

  test('4 类题材模板提供人物原型', () => {
    for (const id of ['fantasy', 'sci-fi', 'modern', 'apocalypse'] as const) {
      const tmpl = getTemplateMeta(id);
      expect(tmpl.characterArchetypes.length).toBeGreaterThan(0);
    }
  });

  test('getTemplateMeta 返回对应模板', () => {
    expect(getTemplateMeta('fantasy').styleGuide).toContain('剑与魔法');
    expect(getTemplateMeta('sci-fi').styleGuide).toContain('赛博朋克');
    expect(getTemplateMeta('apocalypse').styleGuide).toContain('生存');
  });

  test('getTemplateMeta 缺省回退通用模板', () => {
    const tmpl = getTemplateMeta();
    expect(tmpl.id).toBe('generic');
    expect(tmpl.worldTypes).toContain('奇幻');
  });

  test('getTemplateMeta 未知 ID 回退通用模板', () => {
    const tmpl = getTemplateMeta('unknown' as StoryTemplateId);
    expect(tmpl.id).toBe('generic');
  });

  test('题材模板风格引导互不相同', () => {
    const guides = STORY_TEMPLATES.filter((tmpl) => tmpl.id !== 'generic')
      .map((tmpl) => tmpl.styleGuide);
    expect(new Set(guides).size).toBe(guides.length);
  });

  test('createEmptyResult 可携带 templateId', () => {
    const result = createEmptyResult('test.txt', 'standard', 100, 1, 'fantasy');
    expect(result.templateId).toBe('fantasy');
  });

  test('createEmptyResult 未传 templateId 时为 undefined', () => {
    const result = createEmptyResult('test.txt', 'standard', 100, 1);
    expect(result.templateId).toBeUndefined();
  });
});
