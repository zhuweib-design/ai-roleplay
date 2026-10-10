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
 * M9-b 把 M9-a 留下的那条边界转成了正向断言：窗口内用户改过的那几项（只列标量，理由见
 * `USER_WINS_KEYS` 的注释）在存档落地后会被重新应用，不再被静默盖回；集合类字段仍以存档为准。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

interface Snapshot {
  theme?: string;
  fontSize?: number;
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

  it('加载中途落盘的任何一次写，都不得带"还没读到存档"的空 apiProfiles', async () => {
    // 这条钉的是 M9-b 自己踩出来的坑：为了让加载自己的写不被取样，第一版把它做成
    // "不排队、立刻落盘"——而加载是逐字段赋值的，`setTheme(存档值)` 发生在
    // `apiProfiles = 存档值` 之前，于是落了一份半加载的存档（模型配置整组为空）。
    // 现象：刷新后就绪芯片说"还没有可用的模型配置，发送后收不到回复"。
    const writes: Snapshot[] = [];
    let releaseLoad!: () => void;
    const adapter = {
      loadSettings: () =>
        new Promise<Snapshot>((resolve) => {
          releaseLoad = () =>
            resolve({
              // 主题与默认值不同 ⇒ 加载一定会调 setTheme ⇒ 一定会触发一次写入
              theme: 'midnight',
              fontSize: 16,
              apiProfiles: [{ id: 'p1', name: '网关甲', provider: 'openai', baseUrl: 'http://x/v1', apiKey: 'k', model: 'm' }],
              activeApiProfileId: 'p1',
            });
        }),
      saveSettings: (payload: Snapshot) => {
        writes.push({
          theme: payload.theme,
          apiProfiles: payload.apiProfiles,
          activeApiProfileId: payload.activeApiProfileId,
        });
        return Promise.resolve();
      },
    } as never;
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    releaseLoad();
    await loading;
    await new Promise((r) => setTimeout(r, 30));

    expect(writes.length, '加载完成后至少落一次盘').toBeGreaterThanOrEqual(1);
    const halfLoaded = writes
      .map((w, i) => ({ i, count: w.apiProfiles?.length ?? 0 }))
      .filter((x) => x.count === 0);
    expect(halfLoaded, '存在半加载落盘（模型配置被写成空）').toEqual([]);
    expect(settings.theme).toBe('midnight');
  });

  it('加载窗口内用户改过的那一项，不被随后落地的存档盖回（M9-b）', async () => {
    const { adapter, writes, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    settings.setTheme('light');
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    // 用户的动作赢；他刚点过，存档不该把他跳回去
    expect(settings.theme).toBe('light');
    const last = writes[writes.length - 1] as Snapshot;
    expect(last.theme).toBe('light');
    // 同一份存档的其它字段照常落地，不因回写而丢
    expect(last.apiProfiles?.length).toBe(1);
    expect(last.activeApiProfileId).toBe('p1');
  });

  it('回写只针对用户改过的那一项，存档里没被碰过的字段仍以存档为准', async () => {
    const { adapter, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    settings.setFontSize(18);
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    expect(settings.fontSize).toBe(18); // 用户改的：保留
    expect(settings.theme).toBe('dark'); // 没改的：用存档（默认是 dark，故用主题反证）
  });

  it('集合类字段在窗口内的改动仍以存档为准（回写会换掉整批记录，比盖回更糟）', async () => {
    const { adapter, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    // 用户在首帧就新建了一份配置：此时内存里只有它、没有存档那一份
    settings.addApiProfile({
      id: 'p-new',
      name: '窗口内新建',
      provider: 'openai',
      baseUrl: 'http://y/v1',
      apiKey: 'k2',
      model: 'm',
    } as never);
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    // 存档那份必须在（不能被"默认值 + 这一次新增"的快照换掉）
    expect(settings.apiProfiles.map((p) => p.id)).toContain('p1');
  });

  it('加载期间没有任何写入时，回写不产生额外落盘', async () => {
    const { adapter, writes, release } = makeAdapter(true);
    const settings = useSettingsStore();
    settings.setStorageAdapter(adapter);

    const loading = settings.loadFromStorage();
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    // 只有加载末尾那次重断言主题的写（没有用户改动 ⇒ 不额外回写）
    const themeWrites = writes.filter((w) => w.theme === 'dark');
    expect(themeWrites.length).toBeGreaterThanOrEqual(1);
    expect(settings.theme).toBe('dark');
  });
});
