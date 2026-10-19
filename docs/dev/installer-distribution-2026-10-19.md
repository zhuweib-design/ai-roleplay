# 安装包分发决策记录（2026-10-19）

这份文档回答一个问题：**为什么 GitHub Releases 上一个安装包都找不到，是不是漏传或误删？**
答案是：不是。这是 2026-10-19 明确定下的策略，且已由机器检查长期守住。

## 1. 决策

本仓库与 GitHub Releases **都不承载安装包**。

- 安装包不进 git：由 `.gitignore` 的 `installer/` 规则与 `check:no-artifact` 守卫挡在仓库外。
- 安装包不挂 GitHub Releases：由 `check:no-release-assets` 守卫守住（Release 的 `assets` 数组非空即红）。
- GitHub Release 只保留自动生成的 **Source code (zip / tar.gz)**。它们是归档链接，不在 `assets` 数组里，
  所以不会被上面那条门禁误伤。
- 需要安装包 = 从源码本地构建：安卓 `node scripts/android-apk.mjs`，桌面 `npm run tauri:build`，
  Web 端 `npm run build` 后静态托管（流程见 [`web-deployment-sop.md`](web-deployment-sop.md)）。

理由（按重要性）：

1. 仓库是**公开**的。27 MB 量级的包一旦进了 git 历史，删掉记录也瘦不回来，每个克隆的人都要背着的体积。
2. 出包脚本每次构建都产一份新包，历史会不断堆积。
3. 挂出去的 debug 包用 debug 签名，不具备"这是官方发布物"的可信度；把它当分发渠道反而误导。
4. 留旧包在 Release 上，用户装到过期版本的风险高于收益——本仓库版本号同时有四处落点，
   过期包比过期文档更容易被误用。

## 2. 时间线（每个读数都可复核）

| 日期 | 事实 | 复核方式 |
|---|---|---|
| 2026-09-26 | 桌面端**起**不再上传安装包与更新器清单（0.3.1 那次发布开始） | 提交 `fa30b40`；`git show fa30b40 --stat` |
| 早于本记录 | `v0.2.0` 上残留 6 个桌面产物，是更早使用 automation 上传时期的产物 | 下表资产 ID 与撤下前读数 |
| 2026-10-16 | 曾手工把安卓 debug 包（1.1.1）挂到 `v1.1.1` Release 上，当时按"走 Releases 分发"的旧口径执行 | [`release-notes-1.1.1.md`](release-notes-1.1.1.md) 的"收口读数" |
| 2026-10-19 | 按用户要求撤下该 APK；同日又撤下 `v0.2.0` 的 6 个遗留产物，并把"之后不再上传任何安装包"定为长期策略 | 下表删除读数；`git log --oneline` 中的 `check:no-release-assets` 提交 |

撤下当天犯过一次记录错误（把"挂包"和"撤包"写成同一天），已改正。事实是：挂包 10-16、CHANGELOG 回填 10-17、撤包与定策略 10-19。

## 3. 撤下的 7 个资产清单

ID 是唯一可靠标识（GitHub API 的 release asset id）。名称里的产品名含中文（`src-tauri/tauri.conf.json` 的
`productName` 为 `AI 酒馆`），当时在 Windows 控制台输出里被折叠成了点，因此下表按 ASCII 尾巴记录名称、
以 ID 为准；大小为撤下前一次 API 列表读数，保留一位小数。

| 所属 Release | Release ID | 资产 ID | 名称（ASCII 尾） | 大小 |
|---|---|---|---|---|
| `v1.1.1` | 414902372 | 647163752 | `AI-roleplay-1.1.1-debug.apk` | 26.1 MB |
| `v0.2.0` | 375416263 | 526991801 | `_0.2.0_x64-setup.exe` | 12.8 MB |
| `v0.2.0` | 375416263 | 526991832 | `_0.2.0_x64-setup.exe.sig` | 0.0 MB |
| `v0.2.0` | 375416263 | 526991756 | `_0.2.0_x64_zh-CN.msi` | 13.7 MB |
| `v0.2.0` | 375416263 | 526991787 | `_0.2.0_x64_zh-CN.msi.sig` | 0.0 MB |
| `v0.2.0` | 375416263 | 526989206 | `_aarch64.app.tar.gz` | 13.5 MB |
| `v0.2.0` | 375416263 | 526989276 | `_aarch64.app.tar.gz.sig` | 0.0 MB |

删除逐个返回 `204`（6 个桌面资产；APK 单独删除同样返回 `204`）。只删资产，不删 Release 页面。

## 4. 撤下后的实测状态

- 全部 Release 的 `assets` 数为 **0**。
- 原下载链接 `…/releases/download/v1.1.1/AI-roleplay-1.1.1-debug.apk` 现为 **404**；
  Release 页面本身仍 **200**（说明只删包、没删发布）。
- `v1.1.1` 与 `v0.2.0` 的 Release 正文已改写，不再宣称附带下载物。

## 5. 本地产物仍然存在

撤下的是"对外托管"，不是构建产物本身。

- 安卓 debug 包：`installer/AI酒馆-1.1.1-debug.apk`，27,335,537 字节，
  sha256 `3f64b6b381de17ba1840ebdff2caf810abeaa3c6945629b234769afc6f0f4834`
  （与挂到 Release 上那份逐字节一致，当时用 `cmp` 复核过；2026-10-19 再次 `sha256sum` 本地文件，值未变）。
- 同目录下原先还有一份 1.0.0 的旧包，2026-10-19 按用户要求删除（过期包，留着只会误装）。
- `installer/` 被 gitignore，属于本地产物目录，随时可由 `node scripts/android-apk.mjs` 重新生成。

## 6. 复核命令

Git Bash 直接可跑。第 1 条不需要凭据（公开仓库匿名访问）；若被匿名限流，先按第 5 节仓库惯例取 token。

```bash
# 1) 门禁本体：通过则打印"没有任何资产"，退出码 0
node scripts/no-release-assets-guard.mjs; echo "exit=$?"

# 2) 不联网的判据自检（5 例，覆盖空/非空两类）
node scripts/no-release-assets-guard.mjs --self-test; echo "exit=$?"

# 3) 逐个 Release 列出资产数（应全为 0）
curl -s --max-time 40 "https://api.github.com/repos/zhuweib-design/ai-roleplay/releases?per_page=100" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).forEach(r=>console.log(r.tag_name, (r.assets||[]).length)))"

# 4) 抽查一条老下载链接，应为 404
curl -s -o /dev/null -w "%{http_code}\n" --max-time 40 \
  "https://github.com/zhuweib-design/ai-roleplay/releases/download/v1.1.1/AI-roleplay-1.1.1-debug.apk"

# 5) 确认本地包仍在且哈希未变
sha256sum installer/*.apk
```

## 7. 这条门禁不是空跑的

新加判据先证明它会红。用一个**外部**公开仓库跑同一条脚本作负向对照：

```bash
GITHUB_REPOSITORY=microsoft/vscode node scripts/no-release-assets-guard.mjs
```

实测输出 `[no-release-assets] 违反策略：Release 上存在 3 个资产（安装包不上传，见本文件头部说明）`，
并逐条打印 tag / 名称 / 大小 / 下载地址，退出码 1。也就是说：本仓库判它绿，是因为它真的没有资产，
不是因为判据读不到东西。

CI 里占两步（`.github/workflows/ci.yml` 的 `quality-gates`，紧跟"产物入库守卫"之后）：
`No-release-assets guard` 与 `No-release-assets guard self-test`，带 `secrets.GITHUB_TOKEN`
只为避开共享出口 IP 的匿名限流，不改变判据。

## 8. 相关口径落在哪里

- 策略与读数：本文件；`CHANGELOG.md` 的"未发布"段。
- 对外可见的说明：`README.md` / `README-EN.md` 的部署段（安装包不进 git、也不挂 Releases，需要时本地构建）。
- 1.1.1 的发布过程与撤包记录：[`release-notes-1.1.1.md`](release-notes-1.1.1.md)。
- 守卫代码：`scripts/no-release-assets-guard.mjs`（头部注释即决策摘要）。
