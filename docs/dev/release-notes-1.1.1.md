# AI 酒馆 1.1.1 发布说明

发布日期：2026-10-16
上一版本：1.1.0（同日发布，标签 `v1.1.0` 指向合并提交 `25da9ab`）

补丁版只有一处界面缺陷和一次工程收口，所以这一份把"发布说明"与"逐项证据"合在同一个文件里
（1.0.0 / 1.1.0 那样拆两份的惯例适用于内容量大的版本）。

## 为什么要单开一版，而不是塞回 1.1.0

`v1.1.0` 已经推成公开标签，指向的是当时那条合并提交。把后来的修改塞进一个已经发布的版本号，
等于让同一个版本号对应两种不同内容——谁装了哪个包、界面上该看到什么，全都对不上。
所以按仓库 `CHANGELOG.md` 顶部自己写的规则（修订版本用于兼容性修复），走 1.1.1。

## 用户能看见的变化

设置 → 关于那一行终于显示真实版本号。原先三个平台（桌面 / 网页 / 安卓）都显示"版本：—"，
因为组件里的 `appVersion` 声明后从未赋值，而模板用 `appVersion || '—'` 兜底。
现在它显示的是 `package.json` 的版本（这一版即 1.1.1），与安装包、桌面端配置同源。

其余是看不见的：仓库根的一次性探针脚本不再被产品门禁扫描，也不会再被误提交进仓库。

## 数据兼容

- 无数据库迁移、无 schema 变更、无字段语义变更。
- 不新增也不删除任何持久化键； IndexedDB 与 localStorage 的读写路径未被触碰。
- 1.1.0 旧数据在 1.1.1 下照常读取；反过来装回 1.1.0 也不受影响（本次改动全在构建期与界面文案层）。

## 验证结果（本机实测，证据包在 `artifacts/release-evidence/v1.1.1/`，提交 `40df75f`、工作树干净）

| 项目 | 结果 |
| --- | --- |
| `npm test` | 4047 项通过 / 3 跳过 / 0 失败（212 文件通过、2 跳过），68.6 秒 |
| 类型检查 `vue-tsc --noEmit` | 通过，12.8 秒 |
| `npm run lint` | **通过，0 error / 8 条既有 warning**，81.9 秒 —— 1.1.0 那次"本机红、CI 绿"的差值这次没有再出现 |
| 构建 | 通过，20.3 秒；`dist` 58.2 MB（含 vendored ort wasm 26.8 MB） |
| 静态门禁 | `check:csp` / `check:ort` / `runtime:db:schema:check` / `snapshot:migration:check` / `i18n:check:strict`（src 219 个文件）/ `a11y:contrast`（506 处配对扫描，67 处存量 = 基线）全部 exit=0 |
| 证据包汇总 | 15 项：10 passed / **0 failed** / 5 skipped（skip 的都是外部依赖，见下） |
| 关于页版本号断言 | 单测 3 条 + 真实浏览器 1 条，两条链都做过头故障注入实测：把组件回退成 `ref('')` 时，单测红在 `expected '…版本：—…' to contain '版本：1.1.0'`，e2e 红在同一条 `toContainText(APP_VERSION)` |
| `docs` 源码登记守卫 | 3 条全绿；把登记前缀改成不存在的目录后，"未登记源码"与"登记项必须还指得到源码"两条同时红（实测过） |
| CI（PR #7，run #122，提交 `db25809`） | 6 个 job 全 success：Quality Gates（含 `Lint (eslint .)` 与覆盖率 82.64 / 76.49 / 84.22 / 84.75，213 文件通过 / 1 跳过）、E2E 四组 53 + 73 + 50 + 66 = **242 项全通过**、Tauri `--no-bundle` |
| CI 的 E2E 里有 1 条 flaky | group 3/4 报 `1 flaky`：`e2e/ux-modal-describedby-version.spec.ts` 的 `switchBranch()` 里"切换到此分支"按钮点击在 60 秒超时后重试通过（`locator.click: Test timeout of 60000ms exceeded`，该文件 131/135 行）。四次 run 对着看：`#117`（`2324ffe`）与 `#120`（`f47b95f`）这条 0 flaky、50 项直接全过；`#122`（`db25809`）与 `#123`（`7c4e6bf`）各出现 1 次 flaky（49 通过 + 1 重试通过）。**两组读数之间我没有改过这条用例，也没改它所在分组的文件清单**（本轮新增的那条 e2e 落在 group 1：52 → 53），所以既不能判定为本轮引入，也不能排除；单独记在下面"已知未闭环"，不用"job 绿"混过去 |
| 安卓真机（本机模拟器 ns36，headless 起、验完关机归还；WebView Chrome 133 / Android 16） | 新包 `installer/AI酒馆-1.1.1-debug.apk` 26.1 MB，`aapt dump badging`：`versionCode='3' versionName='1.1.1'`；解包核对入口哈希 `assets/public/assets/index-DmEoYUGZ.js` 与本机 `dist` 同一份；覆盖安装后运行页读到 **"版本：1.1.1"**、`<html lang>` 为 `zh-CN`、Service Worker 注册数 0、CacheStorage 0、IndexedDB 旧数据仍在（characters 4 / settings 1） |

### 本次新抓到的失败与处置

证据包第一次跑（提交 `c27c6d0`）唯一的红是 `tests/tooling/lint-scope.test.ts`：今天晚些时候
一套静态原型作为设计交付物入库，`docs/design/ai-chat-ui-redesign/` 下 11 个 js/mjs 从此不被 lint，
那条守卫按设计把"这是不是产品代码"的判断逼回来。处置是第三种路径——把判断**显式登记**在守卫里
（写清依据），同时给名单加牙齿：登记项指不到源码时守卫报错，免得名单只增不减地烂掉。
挪进 `scripts/` 与"加回 lint 范围"两个选项都试过理由，都不成立，记在那条用例的注释里。

## 尚需真实环境执行（本机是 skipped，不是通过）

- `postgres-transaction` / `migration-restore`：需要真实 PostgreSQL 实例，本机无 Docker；
  CI 每次跑 `test:coverage` 时带 postgres:16 服务，PG 门控用例在 CI 上真实执行。
- `provider-regression`：需要真实 Provider Key，仓库不内置密钥。
- `e2e-desktop` / `e2e-mobile`：本机 `--write` 不带 `--full` 时不跑全量；
  端到端结论以 GitHub Actions 的 4 组分片为准（见 CHANGELOG 与 PR 的检查状态）。

## 已知未闭环

- iOS Safari 的键盘避让仍只有单测形状，无设备可跑（与 1.1.0 同）。
- 安卓导出按钮仍是死按钮，需要原生插件才能修（与 1.1.0 同）。
- `worldEntries` 的死路径为兼容旧备份/导入暂未清理。
- `PROJECT_INDEX.md` 里 `src/` 下仍有约 70 个文件的用途是"待确认"，需要一次专门的人工核对。
- 有一条 e2e 用例在 CI 上 flaky：`e2e/ux-modal-describedby-version.spec.ts` 的 `switchBranch()`，
  症状是"切换到此分支"按钮点击 60 秒超时、重试才过。本轮两次 run（#122 / #123）各复现 1 次，
  本轮之前的两次（#117 / #120）为 0 次；两组读数之间我没有改过这条用例，也没有改它所在分组的
  文件清单（本轮新增的那条 e2e 落在 group 1），所以既不能判定为本轮引入，也不能排除。
  它被 `retries: 2` 兜住所以 job 仍绿，但"绿"不等于"稳"——收口方式按 15.15 那张网的办法走：
  先量它在单 worker 下的真实耗时，再把等待点改成读存储/读状态，而不是加大超时。
