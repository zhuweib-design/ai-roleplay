/**
 * benchmark — 性能基准 (T-10) 测试
 *
 * 覆盖：
 * - 三项基准可运行且返回结构完整(含 pass/budget/detail)
 * - RAG 基准在 jsdom 下通过硬预算(500ms)
 * - 历史持久化:保存后新实例可读;清空生效
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAllBenchmarks,
  loadBenchmarkHistory,
  clearBenchmarkHistory,
} from '@core/benchmark';

describe('benchmark (T-10)', () => {
  beforeEach(() => {
    clearBenchmarkHistory();
  });

  it('runAllBenchmarks 返回 3 项完整结果', async () => {
    const results = await runAllBenchmarks();
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toMatchObject({
        name: expect.any(String),
        pass: expect.any(Boolean),
        detail: expect.any(String),
        ts: expect.any(String),
      });
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
    // 三项名称覆盖
    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('RAG'))).toBe(true);
    expect(names.some((n) => n.includes('窗口'))).toBe(true);
    expect(names.some((n) => n.includes('Token'))).toBe(true);
  });

  it('RAG 基准包含预算且通过(jsdom 下远低于硬预算)', async () => {
    const results = await runAllBenchmarks();
    const rag = results.find((r) => r.name.includes('RAG'));
    expect(rag).toBeDefined();
    expect(rag!.budgetMs).toBe(500);
    expect(rag!.pass).toBe(true);
  });

  it('历史持久化并可清空', async () => {
    await runAllBenchmarks();
    const history = loadBenchmarkHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]).toHaveLength(3);

    clearBenchmarkHistory();
    expect(loadBenchmarkHistory()).toHaveLength(0);
  });
});