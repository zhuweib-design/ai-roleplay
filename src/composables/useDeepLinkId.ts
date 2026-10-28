import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { ensureDeepLinkLoaded, type DeepLinkKey } from '@/stores/deep-link-gate';
import { logger } from '@/utils/logger';

/**
 * 深链记录 id 的唯一入口（M14-a；M16-b 起闸门由登记表给）。
 *
 * 起因链：M12-a 发现版本页在读库完成前解析 `?char=`，把历史悄悄写到了 mock 种子角色
 * 身上；M13-a 把"先等 store 读完再解析"推广到三处视图并立了静态守卫。守卫只能查
 * "文件里有没有等闸门"，等的方式仍各写各的——下一个加 `?group=` 的人多半会抄错。
 * 所以把整段时序收进这一个 composable：URL 里取 id、等加载闸门、等待期间 URL 变了
 * 就作废这一次，全是这里的职责；视图只提供"读完后拿这个 id 做什么"。
 *
 * M16-b 关掉剩下那个错法：调用方可以给 `load` 传**别的库**的闸门（键对了、等错了库，
 * 深链静默不命中也不报错）。现在 `key` 是登记过的键名（`DeepLinkKey`），不传 `load` 时
 * 闸门由 `src/stores/deep-link-gate.ts` 的登记表决定；确实要等多个库的视图才自己传
 * （版本页就是那一条例外）。
 *
 * 守卫（tests/views/deep-link-store-gate.test.ts）要求：凡是按 URL 记录 id 找数据的
 * 视图，那个键必须由某次 `useDeepLinkId({ key: '<同一个键>' })` 接住——键写错、写成
 * 变量、或干脆自己 await 闸门，都算违规。
 */
export interface DeepLinkIdOptions {
  /** URL 键（query 优先，缺省回落到 params，如 /character/:id/edit 的 `id`）；必须是登记过的键 */
  key: DeepLinkKey;
  /**
   * 对应 store 的加载闸门。省略时用登记表里这个键归属的库（推荐：少一个写错的机会）。
   * 只有在确实要等多个库时才自己传（如版本页要等版本仓库 + 角色库）。
   */
  load?: () => Promise<void>;
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
  const gate = load ?? (() => ensureDeepLinkLoaded(key));

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
    void gate()
      .then(() => {
        if (readId() !== id) return; // 等待期间用户又跳了，旧的那次作废
        onResolved(id);
      })
      .catch((err) => {
        // 走到这里只可能是编程错误（键没登记、或库自己把读库炸了）。
        // 记下来而不是静默不命中：静默正是 M12-a 那次难查的原因。
        logger.error('DeepLink', `深链键 ${key} 的加载闸门失败`, err);
      });
  }

  if (reactive) {
    watch(() => route.query[key] ?? route.params[key], apply, { immediate: true });
  } else {
    apply();
  }
}
