/**
 * Runtime 的服务端入口：只有跑在 Node / 宿主进程里的代码才从这里导入。
 *
 * 浏览器侧一律走 `./index`。这条边界由 `tests/tooling/runtime-entry-boundary.test.ts`
 * 守着：从 `src/main.ts` 出发的静态可达集合里出现下面任何一个文件，判据就红。
 * 拆之前这些模块挂在 `index.ts` 里，"前端不会被打进去"全靠 tree-shaking 兜底；
 * tree-shaking 是构建器的善意，不是契约。
 *
 * 为什么 `runtime-http.ts` / `runtime-group-http.ts` 还留在 index：
 * 这两个文件同时装着浏览器客户端（`HttpRuntimeApi`）与服务端 handler，
 * 整文件挪到服务端入口会把客户端一起带走。要彻底分开得先按客户端/服务端拆文件，
 * 那是下一步（B2 的续），不在这里靠"挪 barrel"制造一个跑不起来的中间状态。
 */
export * from './runtime-http-handler';
export * from './runtime-group-http-handler';
export * from './postgres-store';
export * from './postgres-executor';
export * from './postgres-group-runtime';
export * from './server-runtime';
