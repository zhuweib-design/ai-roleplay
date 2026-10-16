# 1.1.0 发布证据记录

本记录只写**跑出来的读数**，每条都注明是在哪台机器、哪个提交、哪条命令上取的。
上一版同名单文件见 `docs/dev/release-evidence-1.0.0.md`（形状沿用它的"已执行 / 尚需真实环境"两段，
本版把读数拆细了，因为这一版有两条红必须交代清楚）。

## 0. 对应提交与运行

| 项 | 值 |
| --- | --- |
| 提交 | `2324ffe6090d2a1a046262811f2b4b0e344bb0aa`（`docs(G): PROJECT_INDEX 重生成到 v1.1.0…`） |
| 分支 / PR | `feat/ux-ia-guided-flow` → PR #6 → `master` |
| CI run | #117，id `38874790990`，事件 `pull_request`，结论 **success** |
| 本机证据包 | `node scripts/release-evidence-pack.mjs --write`，生成于 2026-10-16 16:49（本地时区），落点 `artifacts/release-evidence/v1.1.0/`（`artifacts/` 被 gitignore，故此文件是它的可读副本） |
| 证据包汇总 | 15 项：9 passed / 1 failed / 5 skipped |
| 证据包的 `workingTreeClean` | **false**——如实记录。不干净的原因是工作区里有另一会话留下的 13 个未跟踪探针脚本（`tmp-*.mjs`）与两份未跟踪评审文档，以及本次为抽取结论行而改的 `scripts/release-evidence-pack.mjs`；这三类都不参与被测代码 |

## 1. 已执行（本机，`npm run <脚本>`，HEAD = `2324ffe`）

| 门禁 | 结果 | 耗时 | 关键读数 |
| --- | --- | --- | --- |
| `test`（unit-integration） | passed | 60.2s | Test Files 211 passed / 2 skipped（213）；Tests **4043 passed / 3 skipped**（4046）；Vitest Duration 59.08s |
| `build`（vue-tsc + vite） | passed | 21.6s | 产物 `dist` 58.2 MB（含 vendored ort wasm 26.8 MB，非首屏传输量） |
| `check:csp` | passed | 0.7s | 构建产物含 CSP meta、关键指令齐备、无内联 script |
| `check:ort` | passed | 0.7s | onnxruntime 不在首屏依赖图内 |
| `i18n:check:strict` | passed | 0.8s | **src 全部 219 个文件**无硬编码中文 UI 文案残留 |
| `a11y:contrast` | passed | 0.7s | 语义配对全达标；实际扫描 **506 处 `color×background` 配对**，不达标 67 处 = 基线 67（零余量棘轮），分布在 13 个文件；9 款主题，阈值 AA ≥ 4.5:1 |
| `runtime:db:schema:check` | passed | 0.7s | Runtime Schema 与代码无漂移 |
| `snapshot:migration:check` | passed | 0.7s | 快照迁移计划一致 |
| `typecheck` | passed | 17.3s | `vue-tsc --noEmit` 干净 |
| `lint` | **failed** | 90.4s | 见第 3 节：错误全部落在未跟踪的一次性探针脚本里 |

注：`a11y:contrast` 是**静态扫描**（读 `tokens.css` / `themes.css` 的真实变量再扫样式），
所以 0.7 秒是正常值，不是空跑；它的自检项 `a11y:contrast:self-test` 在 CI 里单独跑过（见第 2 节）。

另注：`npm test` 在同一提交上单跑复现过一次（`npx vitest run`，100.22s），通过/跳过数与证据包里
完全一致（4043 passed / 3 skipped、211 files / 2 skipped），所以表里那条 59.08s 不是命中缓存的旧结果，
只是并发与冷启动造成的耗时差。

## 2. 已执行（CI run #117，干净检出，同一提交）

| job | 结论 | 关键读数 |
| --- | --- | --- |
| Quality Gates | success | 含 `Lint (eslint .)` → **success**（这条是第 3 节判断的依据）；`Contrast audit` 与 `Contrast guard self-test` success；`Test + coverage gate (78/73/78/78)` success |
| 同上 · 测试汇总 | — | Tests 4039 passed / 7 skipped（4046），Test Files 212 passed / 1 skipped，Duration 131.47s |

两侧跳过的集合**刚好互补**，这一点是核过的：本机跳过的是 PG 门控的 3 项
（`tests/runtime/postgres-group.integration.test.ts` 2 项、`postgres-runtime.integration.test.ts` 1 项，
因为本机没有 `RUNTIME_PG_TEST_URL`），而 `tests/core/onnx-real-model.test.ts` 的 7 项在本机是真跑的；
CI 反过来——有 postgres:16 服务所以那 3 项跑了，但没有 ONNX 模型文件所以那 7 项跳过。
并集 4046 项里，每一项都至少在一侧通过过。
| 同上 · 覆盖率 | — | All files：statements **82.64** / branches 76.49 / functions 84.22 / lines 84.75，四项均高于阈值 78/73/78/78 |
| E2E group 1/4 | success | Running 52 tests → **52 passed**（2.8m） |
| E2E group 2/4 | success | Running 73 tests → **73 passed**（3.1m） |
| E2E group 3/4 | success | Running 50 tests → **50 passed**（3.2m） |
| E2E group 4/4 | success | Running 66 tests → **66 passed**（2.8m） |
| Tauri Build (desktop binary) | success | `tauri build --no-bundle` 通过，不生成也不上传安装包 |

四组相加 **241 项 = 与 `e2e/shard-groups.mjs` 登记的用例数一致**，无重试、无跳过
（四份 job 日志里 `retry` / `flaky` / `skipped` 命中数均为 0）。这 241 也是那条对账守卫
（`tests/tooling/e2e-shard-groups.test.ts`）要求"每个 spec 恰好属于一组"能成立的前提。

本机单 worker 全量的读数另记在分片文件里，一并留着以便对比：`MEASURED_AT 2026-10-16T06:37:25Z`、
`MEASURED_CASES 241`、`MEASURED_TOTAL_SEC 882.5`（约 14.7 分钟）、`SOURCE_COMMIT b6f5f72`。

端到端**没有**在本机以 `--full` 重跑：`--write` 默认把 `e2e-desktop` / `e2e-mobile` 记为 skipped
（全量串行 15 分钟且吃内存，本机还会和并行的单测互相拖慢）。E2E 的发布结论以 CI 的 4 组为准，
这条判定本身写在证据包的 `known-issues.md` 里，不拿本机的部分结果冒充全量。

## 3. 本机那条红的解剖（`lint`）

`npm run lint` = `eslint .`，它会扫工作区里**所有**文件，包括未跟踪的。逐文件把
`eslint . -f json` 的报告与 `git ls-files` 对账后的结果：

```
仓库内文件条数        : 560
已跟踪文件里的 error  : 0
未跟踪文件里的 error  : 6   tmp-deep2.mjs tmp-deep3.mjs tmp-deep5.mjs tmp-deep6.mjs
warning 合计          : 8   （与既有告警基线一致，未新增）
```

那 6 条是 `no-unused-vars` 与一条 `no-empty`，来自另一次会话留在仓库根的一次性 CDP 探针脚本，
不属于 1.1.0 的内容，也不在版本控制里；CI 在干净检出上跑同一条命令得到 success（第 2 节）。
处置：不替别的会话删文件，也不为了本机变绿去改 `eslint` 配置。等那几个 `tmp-*.mjs` 被它自己的
会话清掉，本机 `eslint .` 自然回到 0 error。

顺带一条与第 15.15 节同型的经验：**未跟踪文件会让本机门禁红，但不会让 CI 红**，
所以"本机红"要先分诊是内容问题还是工作区卫生问题，判据就是上面那次对账。

## 4. 尚需真实环境执行（证据包里是 skipped，不是通过）

| 门禁 | 为什么 skipped | 怎么补 |
| --- | --- | --- |
| `postgres-transaction` | 未设 `RUNTIME_PG_TEST_URL` | 本机可用 `artifacts/pg-embedded/run-pg-tests.mjs` 拉起嵌入式 PG 后自动真实执行；CI 每次都真跑（第 2 节那 4039 项就含它） |
| `migration-restore` | 需真实实例跑 `pg_dump` / `pg_restore` 演练，本机无 Docker | 步骤见 `docs/dev/runtime-database-migration-runbook.md` §5 与 `docs/dev/data-backup-restore.md` §4A.4 |
| `provider-regression` | 需真实 Provider Key（仓库不内置密钥） | 设 `OPENAI_API_KEY`（及可选 `OPENAI_BASE_URL`）后证据包自动跑 `opt-eval --with-api` |
| `e2e-desktop` / `e2e-mobile` | 本机默认不跑全量，见第 2 节说明 | 以 CI run #117 的 241 项为准；要本机复现：`node scripts/release-evidence-pack.mjs --write --full` |

## 5. 已知未闭环（发布时仍然存在，不是"已验证通过"）

- 设置 → 关于那一行的"版本："仍是占位破折号：`SettingsAboutPanel.vue` 里 `appVersion` 声明后从未赋值，
  所以界面上看不到 1.1.0。原因与修法记在 `docs/dev/release-notes-1.1.0.md` 的"版本定位"一节末。
- iOS Safari 的键盘兜底（`--keyboard-inset`）只有按真实数值形状写的单测（Android 形状差值恒为 0、
  iOS 形状 312px 两条负向对照），本机无 iOS 设备可跑。
- 安卓上的导出按钮仍是死按钮：WebView 的 `showSaveFilePicker()` 是 14ms 就抛 AbortError 的桩，
  修它需要写原生插件；当前 9 处导出统一走 `saveBlob()` 单入口，就是为了修的时候只改一处。
- 安装包没有附在 Release 上：仓库有"产物入库"门禁挡二进制，APK 要人工在 GitHub Release 页面上传。
- 群聊页心理活动的排版在真机量过几何，整页人工评审没做。
- `PROJECT_INDEX.md` 里 `src/` 下仍有 73 个文件标"待确认用途"，是 10-07 之后新增的模块；
  逐条核对要读代码，没靠文件名臆测，留作单独一次人工核对。

## 6. 复核方法

```bash
# 本机全套（照 .github/workflows/ci.yml 的 step 清单，不要用记忆挑子集）
node scripts/release-evidence-pack.mjs --write        # 15 项门禁 → artifacts/release-evidence/v1.1.0/
node scripts/release-evidence-pack.mjs --check        # 校验：同一提交、结果文件齐全、无 failed/skipped
node scripts/release-evidence-pack.mjs --check --allow-skipped   # 承认外部依赖缺口时的校验

# 单条复现本机 lint 红的归属
npx eslint . -f json -o /tmp/eslint.json
# 再用 git ls-files 对账：只有未跟踪文件里才有 error（见第 3 节的输出）
```

`--check` 在这台机器上的实际输出（原样，不改写）：

```
[release-evidence-pack] 门禁失败：lint
[release-evidence-pack] 门禁未执行：e2e-desktop（E2E 需 dev server 与浏览器且耗时较长；加 --full 纳入）
[release-evidence-pack] 门禁未执行：e2e-mobile（同上）
[release-evidence-pack] 门禁未执行：postgres-transaction（需要真实 PostgreSQL 实例…）
[release-evidence-pack] 门禁未执行：migration-restore（需要真实 PostgreSQL 实例执行 pg_dump/pg_restore 演练；本机未配置）
[release-evidence-pack] 门禁未执行：provider-regression（需要真实 Provider API Key…）
```

加 `--allow-skipped` 后只剩"门禁失败：lint"一条，且没有报"证据包来自其它 commit"——
说明包确实是在 `2324ffe` 上生成的，没有复用历史结果（§8.3 那条约束）。

`--check` 现在还会在 `manifest.gates[*].summaryLines` 里带上每项的结论行（测试条数、覆盖率、
门禁判定），因为只留 4000 字符输出尾巴时，证据里全是某条单测打进 stderr 的堆栈，
读不出"到底跑过了多少项"。

## 7. 判定

1.1.0 的内容侧证据齐了：本机 15 项里 9 项通过、1 项红的成因已定位到工作区卫生而非代码、
5 项如实标 skipped 并给了补齐路径；CI 在同一提交上 Quality Gates、E2E 四组 241 项、
Tauri 构建全部 success。**可以合并。**
