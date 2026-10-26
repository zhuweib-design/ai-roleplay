/**
 * useDeepLinkId 单元测试（M14-a）
 *
 * 这个 composable 收拢了三处视图里各写各的深链时序（M12-a / M13-a 的产物）：
 * URL 里取 id → 等加载闸门 → 等待期间 URL 变了就作废。这里把每一段时序都
 * 变成断言，含 reactive（watch）与一次性（reactive:false）两种模式、params 回落。
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { useDeepLinkId } from '../../src/composables/useDeepLinkId';
import type { DeepLinkKey } from '@/stores/deep-link-gate';

type Log = string[];

interface Case {
  /** M16-b 起 key 受登记表约束，夹具也用它，免得测的是一个编译不过的写法 */
  key: DeepLinkKey;
  reactive?: boolean;
  withMissing?: boolean;
}

function makeView(test: Case, log: Log) {
  return defineComponent({
    setup() {
      useDeepLinkId({
        key: test.key,
        load: async () => {
          log.push('load');
        },
        onResolved: (id) => {
          log.push(`resolved:${id}`);
        },
        onMissing: test.withMissing
          ? () => {
              log.push('missing');
            }
          : undefined,
        reactive: test.reactive,
      });
      return () => h('div');
    },
  });
}

const ROUTES = [
  { path: '/', component: { template: '<div />' } },
  { path: '/story', component: { template: '<div />' } },
  { path: '/item/:id', component: { template: '<div />' } },
];

async function mountAt(test: Case, url: string): Promise<{ router: Router; log: Log }> {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push(url);
  await router.isReady();
  const log: Log = [];
  mount(makeView(test, log), { global: { plugins: [router] } });
  await flushPromises();
  return { router, log };
}

describe('useDeepLinkId', () => {
  it('URL 带键：等闸门完成后把 id 交给 onResolved', async () => {
    const { log } = await mountAt({ key: 'story' }, '/story?story=abc');
    expect(log).toEqual(['load', 'resolved:abc']);
  });

  it('URL 无键：走 onMissing，不触发加载', async () => {
    const { log } = await mountAt({ key: 'story', withMissing: true }, '/story');
    expect(log).toEqual(['missing']);
  });

  it('等待期间 URL 又变了：旧的那次作废，新的那次生效', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push('/story?story=old');
    await router.isReady();
    const log: Log = [];
    mount(makeView({ key: 'story' }, log), { global: { plugins: [router] } });
    await flushPromises();
    expect(log).toEqual(['load', 'resolved:old']);

    await router.push('/story?story=new');
    await flushPromises();
    expect(log).toEqual(['load', 'resolved:old', 'load', 'resolved:new']);
  });

  it('闸门等待期间 URL 被换成别的值：这一次 onResolved 不得执行', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push('/story?story=slow');
    await router.isReady();
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const log: Log = [];
    mount(
      defineComponent({
        setup() {
          useDeepLinkId({
            key: 'story',
            load: () => held,
            onResolved: (id) => {
              log.push(`resolved:${id}`);
            },
          });
          return () => h('div');
        },
      }),
      { global: { plugins: [router] } }
    );
    await flushPromises();
    expect(log, '闸门没过就不该解析').toEqual([]);

    // 闸门悬着的时候用户换目标：旧解析必须作废；新目标等同一个闸门，过了之后生效
    await router.push('/story?story=other');
    release();
    await flushPromises();
    expect(log, '作废的那次不能把旧 id 灌进来').toEqual(['resolved:other']);
  });

  it('reactive:false：只在挂载时解析一次，URL 后来变了也不理', async () => {
    const { router, log } = await mountAt({ key: 'story', reactive: false }, '/story?story=once');
    expect(log).toEqual(['load', 'resolved:once']);
    await router.push('/story?story=again');
    await flushPromises();
    expect(log).toEqual(['load', 'resolved:once']);
  });

  it('query 缺失时回落到 params（/item/:id 的编辑页形态）', async () => {
    const { log } = await mountAt({ key: 'id' }, '/item/char-9');
    expect(log).toEqual(['load', 'resolved:char-9']);
  });
});
