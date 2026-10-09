/**
 * 加载在飞时的写入，不得用"还没读到存档的默认值"盖掉已存设置（M9-a）
 *
 * 与 M2-b8 那条是同一片故障域、两种机制：那条管**两次写之间**的顺序，
 * 这一条管**写与首帧加载之间**的顺序。`App.vue` 是在 `onMounted` 里才 `await loadFromStorage()`，
 * 也就是说界面已经挂好、按钮已经能点，而存档还在读——这期间任何一次
 * `void persistSettings()` 写的都是内存里的默认值（`apiProfiles: []`），
 * 落盘后用户的模型配置就没了。表现与 M2-b8 一模一样：刷新后芯片说
 * "还没有可用的模型配置"，而 IndexedDB 里曾经有。
 *
 * 浏览器侧的复现路径是 e2e 满并发下的 `ux-event-trace`（重载 → 立刻在随机事件页点"保存配置"），
 * 这里用"加载不返回"的假适配器把同一个窗口在 jsdom 里钉死。
 *
 * 第二条用例是 `it.fails`：同一个窗口里还有另一半没修的问题（加载完成后，存档会把用户
 * 在这期间做的改动盖回去）。把它钉成断言而不是注释，是为了让它被修好的那天必须有人来改这里。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

interface Snapshot {
  theme?: string;
  apiProfiles?: unknown[];
  activeApiProfileId?: string | null;
}

const STORED: Snapshot = {
  theme: 'dark',
  apiProfiles: [{ id: 'p1', name: '网关甲', provider: 'openai', baseUrl: 'http://x/v1', apiKey: 'k', model: 'm' }],
  activeApiProfileId: 'p1',
};

function makeAdapter(holdLoad: boolean) {
  const writes: Snapshot[] = [];
  let releaseLoad!: () => void;
  const adapter = {
    loadSettings: () =>
      holdLoad
        ? new Promise<Snapshot>((resolve) => {
            releaseLoad = () => resolve(STORED);
          })
        : Promise.resolve(STORED),
    saveSettings: (payload: Snapshot) => {
      writes.push({
        theme: payload.theme,
        apiProfiles: payload.apiProfiles,
        activeApiProfileId: payload.activeApiProfileId,
      });
      return Promise.resolve();
    },
  } as never;
  return { adapter, writes, release: () => releaseLoad() };
}

describe('persistSettings 与首帧加载的先后', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('存档还没读回来时发起的写入要等加载落地，不能抹掉已存的模型配置', async () => {
    const { adapter, writes, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    // 用户在首帧就动了开关（e2e 里是随机事件页的"保存配置"）
    settings.setTheme('light');
    expect(writes.length, '加载未完成就落盘，写的是没有存档的默认值').toBe(0);

    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    expect(writes.length, '加载完成后要补上那次写入').toBeGreaterThanOrEqual(1);
    const last = writes[writes.length - 1] as Snapshot;
    // 盖掉的话这里就是 0 个配置
    expect(last.apiProfiles?.length, '已存的模型配置不能被默认值抹掉').toBe(1);
    expect(last.activeApiProfileId).toBe('p1');
  });

  it('没有加载在飞时，写入仍然同步发起（M2-b8 的既有语义）', () => {
    const { adapter, writes } = makeAdapter(false);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);
    settings.setTheme('oled');

    expect(writes.length, '空闲时的第一次写必须同步发起').toBe(1);
    expect(writes[0]?.theme).toBe('oled');
  });

  it('首次启动（没有存档）时，加载自己那次默认值写入不能把自己等死', async () => {
    // 这条是防回归的：闸门实现成"任何写入都等加载"时，首启分支里的
    // `await persistSettings()` 会等一个由它自己才完成的加载 ⇒ 应用启动即卡死
    // （全量 e2e 表现为 45/70 超时）。
    const writes: Snapshot[] = [];
    const adapter = {
      loadSettings: () => Promise.resolve(undefined),
      saveSettings: (payload: Snapshot) => {
        writes.push(payload);
        return Promise.resolve();
      },
    } as never;
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const settled = await Promise.race([
      settings.loadFromStorage().then(() => 'done'),
      new Promise((r) => setTimeout(() => r('timeout'), 1000)),
    ]);

    expect(settled, 'loadFromStorage 没有结束').toBe('done');
    expect(writes.length, '首启要把默认快照落一次盘').toBe(1);
  });

  it.fails('已知边界：加载期间用户改的那一项，会被随后落地的存档盖回去', async () => {
    const { adapter, writes, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    settings.setTheme('light');
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    // 期望的是"用户的动作赢"（他刚点过），现状是"存档赢"（loadFromStorage 无条件覆盖）
    expect(writes[writes.length - 1]?.theme).toBe('light');
  });
});
