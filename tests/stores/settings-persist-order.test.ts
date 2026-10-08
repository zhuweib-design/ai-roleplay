/**
 * 设置写入必须串行（M2-b8 · 关闭 §七 #20）
 *
 * 复现的真实故障：在设置页连点"新建配置 / 激活"，多次 `void persistSettings()` 并发跑；
 * 先发起的那一次带的快照更旧，却可能**后**完成，于是把新状态覆盖掉 ——
 * 刷新后就绪芯片说"还没有可用的模型配置"，而 IndexedDB 里明明有配置。
 *
 * 这里用一个"第一次写慢、后续写快"的假适配器把顺序钉死：
 * 串行化 ⇒ 最后落盘的是最新快照；不串行 ⇒ 最后落盘的是旧快照（缺陷复现）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

describe('persistSettings 串行化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('两次连写：后发起的写入必须最后落盘', async () => {
    const writes: Array<{ activeApiProfileId: string | null; profileCount: number }> = [];
    let first = true;

    const adapter = {
      async saveSettings(payload: { activeApiProfileId: string | null; apiProfiles: unknown[] }) {
        if (first) {
          first = false;
          // 第一次写"慢"：模拟 IndexedDB 事务排队
          await new Promise((r) => setTimeout(r, 25));
        }
        writes.push({
          activeApiProfileId: payload.activeApiProfileId,
          profileCount: payload.apiProfiles.length,
        });
      },
    } as never;

    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    // ① 新建第一个配置（addApiProfile 会自动激活它 ⇒ 写 #1：p1 / 1 个）
    settings.addApiProfile({ id: 'p1', name: '网关甲', provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k', model: 'm' } as never);
    // ② 紧接着新建第二个并手动切过去（写 #2：p2 / 2 个）
    settings.addApiProfile({ id: 'p2', name: '网关乙', provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k', model: 'm' } as never);
    settings.setActiveApiProfile('p2');

    await new Promise((r) => setTimeout(r, 150));

    expect(writes.length).toBeGreaterThanOrEqual(3);
    // 关键断言：最后落盘的那一次必须带着最终状态（激活 p2、两个配置）
    expect(writes[writes.length - 1]).toEqual({ activeApiProfileId: 'p2', profileCount: 2 });
    // 空闲时的第一次写要**同步发起**（既有语义，quick-reply 那组用例靠它），
    // 且它带的是当时的旧快照 —— 串行化保证它一定最先落盘。
    expect(writes[0]).toEqual({ activeApiProfileId: 'p1', profileCount: 1 });
    // 快照只能"更新或持平"，绝不允许旧的排在新的后面（不串行时这里必红）
    const counts = writes.map((w) => w.profileCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
});
