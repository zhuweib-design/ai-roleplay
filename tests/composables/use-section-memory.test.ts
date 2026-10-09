/**
 * 折叠段开合记忆（M7-d）
 *
 * 要钉的是"两种意图别混"这一件事：
 * - 没点过 → 用调用方给的推导默认（M7-a 的"还没填就自动展开"属于这一类）；
 * - 点过 → 用户的选法优先，哪怕它和推导默认相反。
 * 外加两条容易写错的：写要真的落盘（否则刷新就丢，等于没做），
 * 以及加载时脏值必须丢掉（存储是用户可改的文件，不能假定它干净）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useSectionMemory } from '@/composables/useSectionMemory';

beforeEach(() => setActivePinia(createPinia()));

describe('useSectionMemory', () => {
  it('没点过时用推导默认，且默认会随数据变化重算', () => {
    const filled = ref(false);
    const open = useSectionMemory('probe.auto', () => !filled.value);

    expect(open.value).toBe(true);
    filled.value = true;
    // "填好了就收起"必须是活的，不是挂载时一次性快照
    expect(open.value).toBe(false);
  });

  it('点过之后记忆优先，哪怕与推导默认相反', () => {
    const open = useSectionMemory('probe.user', () => true);

    open.value = false;
    expect(open.value).toBe(false);
    expect(useSettingsStore().uiSectionOpen['probe.user']).toBe(false);
  });

  it('写一次就落盘一次，重复写同一个值不多写', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const settings = useSettingsStore();
    settings.setStorageAdapter({
      async loadSettings() {
        return null;
      },
      async saveSettings(payload: Record<string, unknown>) {
        writes.push(payload);
      },
    } as never);

    const open = useSectionMemory('probe.persist', () => false);
    open.value = true;
    open.value = true;
    open.value = false;
    await new Promise((r) => setTimeout(r, 60));

    const seen = writes.map((w) => (w.uiSectionOpen as Record<string, boolean>)?.['probe.persist']);
    // 只有两次真实变化：true、false（第三次赋值 same-value 被 early return 挡掉）
    expect(seen.filter((v) => v === true)).toHaveLength(1);
    expect(seen).toEqual([true, false]);
  });

  it('加载时丢掉非 boolean 的脏值，保留正常的', async () => {
    const settings = useSettingsStore();
    settings.setStorageAdapter({
      async loadSettings() {
        // 注意：loadFromStorage 把"完全没有已知字段"当首次启动整段跳过，
        // 所以夹具必须带一个它认得的字段（真机快照永远带 theme/fontSize）
        return {
          theme: 'dark',
          uiSectionOpen: { keep: true, drop: 'yes', n: 1, also: false },
        };
      },
      async saveSettings() {},
    } as never);

    await settings.loadFromStorage();
    expect(settings.uiSectionOpen).toEqual({ keep: true, also: false });
  });

  it('两个段各记各的，互不覆盖', () => {
    const a = useSectionMemory('probe.a', () => false);
    const b = useSectionMemory('probe.b', () => false);

    a.value = true;
    expect(a.value).toBe(true);
    expect(b.value).toBe(false);
  });
});
