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
| CI 的 E2E 里有 1 条 flaky | group 3/4 报 `1 flaky`：`e2e/ux-modal-describedby-version.spec.ts` 的 `switchBranch()` 里"切换到此分支"按钮点击在 60 秒超时后重试通过（`locator.click: Test timeout of 60000ms exceeded`，该文件 131/135 行）。run 对着看：本轮之前的 `#117`（`2324ffe`）与 `#120`（`f47b95f`）这条 0 flaky、50 项直接全过；本轮的 `#122`（`db25809`）、`#123`（`7c4e6bf`）与合并 README 之后的 `#128`（`4914206`）**三次各出现 1 次** flaky（49 通过 + 1 重试通过）。也就是说这条在当前代码上是可复现的（3/3），不是偶发一次。**两组读数之间我没有改过这条用例，也没改它所在分组的文件清单**（本轮新增的那条 e2e 落在 group 1：52 → 53），所以既不能判定为本轮引入，也不能排除；单独记在下面"已知未闭环"，不用"job 绿"混过去。**2026-10-19 已收**（改成先读 `.badge.current` 状态，见下面"已知未闭环"的首条） |
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

## 收口读数（合并、标签、Release 与安装包）

| 项 | 值 |
| --- | --- |
| PR #7 | head `f8b7027` → 合并提交 `aef30ff`（merge commit，非 squash） |
| 合并前门禁 | run #124（id 38894488649，提交 `f8b7027`）6 个 job 全 success |
| 合并后 master | run #125（提交 `aef30ff`）success |
| 标签 | 附注标签 `v1.1.1`，`refs/tags/v1.1.1^{}` = `aef30ff` |
| Release 对象 | 新建两个：`v1.1.0`（id 414902351，无资产，只有自动生成的源码归档）与 `v1.1.1`（id 414902372） |
| 安卓包 | 本机 `installer/AI酒馆-1.1.1-debug.apk`，27,335,537 字节（26.1 MiB），sha256 `3f64b6b381de17ba1840ebdff2caf810abeaa3c69456b234769afc6f0f4834`。**2026-10-16 曾以 `AI-roleplay-1.1.1-debug.apk` 挂到 v1.1.1 Release 上并下载回来 `cmp` 逐字节一致；2026-10-19 按用户要求从 Release 撤下**（资产删除返回 204，原下载链接现在 404，Release 页面本身仍在）；本机产物保留 |
| 安装包策略（2026-10-19 定） | **之后不再上传任何安装包**：Release 只保留自动生成的源码归档。`v1.1.1` 的正文已改成这句话；`v0.2.0` 上历史遗留的 6 个桌面产物（exe / msi / appimage + 三个 .sig）同一天撤下，至此全部 Release 资产数为 0（两条老下载链接实测 404）。为此加了机器检查 `check:no-release-assets`（CI 两步），判据含"挂任何资产即红"，并用一个外部有资产的公开仓库跑实路验证它不是空转、自检 5 项覆盖空/非空两类 |
| 签名的诚实说法 | 这是 **debug 签名**包（gradle 自动生成 debug keystore），用于自测与真机验证，不是正式发布签名；Release 正文里也这么写了 |

出包与上传过程中撞到的两个坑，记下来免得下次重查：

- `aapt dump badging` 打不开中文文件名的包（`Illegal byte sequence` ⇒ 报"找不到 AndroidManifest.xml"）。
  先把包复制成 ASCII 名再读，就读到了 `versionCode='3' versionName='1.1.1'`。
- Release 资产上传不能用 `upload_url` 原样拼参数：API 返回的是**未展开的 URI 模板**
  `…/assets{?name,label}`，拼 `&name=` 会 400。要先把 `{…}` 去掉再带 `?name=`，改完即 201。

## 已知未闭环

- iOS Safari 的键盘避让仍只有单测形状，无设备可跑（与 1.1.0 同）。
- 安卓导出按钮仍是死按钮，需要原生插件才能修（与 1.1.0 同）。
- `worldEntries` 的死路径为兼容旧备份/导入暂未清理。
- `PROJECT_INDEX.md` 里 `src/` 下仍有约 70 个文件的用途是"待确认"，需要一次专门的人工核对。
- 有一条 e2e 用例在 CI 上 flaky：`e2e/ux-modal-describedby-version.spec.ts` 的 `switchBranch()`
  —— **2026-10-19 已收**。根因确认不是等待时长：那个按钮是 `v-if="b.name !== currentBranch"`，
  已经是当前分支时压根不渲染，而 `switchBranch()` 无条件等它可点，状态没收敛时这一次点击就把
  60 秒用例预算烧光。改成先读卡片上的 `.badge.current` 计数、已是当前分支就不等按钮，
  所有预算仍是 10 秒（没有靠加超时压绿）。读数：单文件 `--workers=1 --repeat-each=3` 双核 12 条全过；
  反向故障注入（把状态判断删掉、第二次仍调用它）稳定报 `toBeEnabled` 找不到元素，证明省掉那次等待才是牙；
  全量单 worker 287 条里这条 spec 四个用例全绿（webkit 13.8 秒，原先撞 60 秒）。
- 同一次全量单 worker 跑（287 条 / 18.2 分钟）另有 4 条红，**都不是上面那条改动引入**；
  其中 `save-outcome` 一条已于同日修掉（见下），另外 3 条 mobile 用例 **2026-10-23 已修**：
  - 3 条在 `mobile-functional` 项目且隔离复现稳定红：`character-crud`、`backup-restore`
    都停在 `点角色卡 → /character/:id/edit` 这一步（拿到的是 `/character`），
    `worldbook-flow` 停在"改名后 `.lorebook-item` 应可见"（实际是 hidden）。
    归因清楚：`d305372`（2026-10-18，角色卡详情抽屉，批次 1-5）把窄屏点卡的交互换成了开抽屉，
    `6226986`（三级改两级）动了世界书列表的滚动容器，而这三个 spec 自 `7b74e36` 之后一行没改。
    也就是说属"实现按新设计改了、用例还按旧设计断"，要更新的是用例，得先确认新交互里"进编辑器"的入口。
    2026-10-23 处理：逐条按视口分叉改用例（`(page.viewportSize()?.width ?? 1280) <= 640` 判窄屏，
    沿用 `e2e/chat-flow.spec.ts` 既有先例，比探测 DOM 少了挂载时序竞态）：`character-crud` 两处
    "进编辑"改窄屏点卡开抽屉 → 点抽屉内"编辑"；`backup-restore` 删除前同样处理；`worldbook-flow`
    列表与条目树两级在窄屏断 `toHaveCount(1)`（存在）而非 `toBeVisible()`（可见），因为两级互换下
    每级都有一处"看不见"是设计本身。三条用例未被排除、断言未被放宽。读数：全量 287 条 / 0 失败 /
    EXIT=0 / 11.0 分钟；定向复跑 6/6、单跑 9/9。
  - `save-outcome`「Tauri 桌面」**2026-10-19 已修**。报错是断言拿到了
    `保存设置失败：window.__TAURI_INTERNALS__.invoke is not a function` 这条提示。成因有两层：
    `storage-factory` 在启动时就按 `__TAURI_INTERNALS__` 选适配器，用例那个空对象桩没有 `invoke`，
    于是设置的读与写都弹错；而提示是**只显示队首的一条队列**（`src/utils/toast-service.ts`），
    错误提示活 5 秒，负载一高就把被测的"已保存"压在后面迟迟不上屏，5 秒 expect 超时后拿到的是那句报错。
    修法两处：标记改到启动之后再打（`detectSaveEnv()` 是点导出时才读，够触发文案分叉），
    断言改成锁定"含'已保存'的那一条提示"而不是屏幕上任意一条。
    读数：合成负载（12 个自旋进程）下先复现——旧形状连跑 4 次红 1 次、报错与全量同一条；
    改后同负载 4 次 0 次；产品文案故障注入双向验牙——把 `save.savedTauri` 改成"浏览器下载目录"
    时 `toContainText('系统下载目录')` 红，保留"系统下载目录"再补一句"就是浏览器的下载目录"时
    `not.toContainText('浏览器')` 红（zh.ts 改前备份、改后逐字节 cmp 还原，工作区无残留）。
    两处诚实的边界：其一，无负载单跑时旧形状也复现不出那句报错（连跑 3 次只记录到成功提示），
    所以这是间歇缺陷，因果链靠全量与负载下那句报错本身成立；其二，我一度加过一条"整场没弹过 IPC 报错"的
    MutationObserver 闩作为反向判据，但它在旧形状下也抓不到那条报错（属空跑），已撤回不入库。

