import { watch } from 'vue';
import { useRoute } from 'vue-router';

/**
 * 深链记录 id 的唯一入口（M14-a）。
 *
 * 起因链：M12-a 发现版本页在读库完成前解析 `?char=`，把历史悄悄写到了 mock 种子角色
 * 身上；M13-a 把"先等 store 读完再解析"推广到三处视图并立了静态守卫。守卫只能查
 * "文件里有没有等闸门"，等的方式仍各写各的——下一个加 `?group=` 的人多半会抄错。
 * 所以把整段时序收进这一个 composable：URL 里取 id、等加载闸门、等待期间 URL 变了
 * 就作废这一次，全是这里的职责；视图只提供"读完后拿这个 id 做什么"。
 *
 * 守卫（tests/views/deep-link-store-gate.test.ts）要求：凡是按 URL 记录 id 找数据的
 * 视图，源码里必须出现 `useDeepLinkId(`——不允许绕开这里自己 await。
 */
export interface DeepLinkIdOptions {
  /** URL 键（query 优先，缺省回落到 params，如 /character/:id/edit 的 `id`） */
  key: string;
  /** 对应 store 的加载闸门（如 `characterStore.ensureLoaded`） */
  load: () => Promise<void>;
  /** 读库完成且 URL 未变时回调。id 是否真实存在由调用方判断（各页的"找不到"提示不同） */
  onResolved: (id: string) => void;
  /** URL 里没有这个键时回调（此时不做任何加载）。用于"无深链时的默认选中"路径 */
  onMissing?: () => void | Promise<void>;
  /** 监听 URL 变化并重新解析；只在挂载时解析一次的视图传 false（默认 true） */
  reactive?: boolean;
}

export function useDeepLinkId(options: DeepLinkIdOptions): void {
  const route = useRoute();
  const { key, load, onResolved, onMissing, reactive = true } = options;

  function readId(): string | undefined {
    const raw = route.query[key] ?? route.params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  function apply(): void {
    const id = readId();
    if (id === undefined) {
      void onMissing?.();
      return;
    }
    void load().then(() => {
      if (readId() !== id) return; // 等待期间用户又跳了，旧的那次作废
      onResolved(id);
    });
  }

  if (reactive) {
    watch(() => route.query[key] ?? route.params[key], apply, { immediate: true });
  } else {
    apply();
  }
}
