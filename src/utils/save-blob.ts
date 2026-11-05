/**
 * 把 Blob 交给用户存盘（浏览器下载 / WebView 系统保存面板）
 *
 * 为什么需要这个文件：2026-10-14 在安卓模拟器上实测过，APK 的 WebView 里
 * `URL.createObjectURL(blob)` + `<a download>` + `click()` 是**静默无效**的——
 * 不抛错、不报"下载被阻止"、`/sdcard` 全盘搜不到文件、logcat 一条下载记录都没有。
 * 也就是说全仓 9 处导出（备份包、角色卡 PNG、对话 Markdown、审核日志、快捷回复、
 * 世界书、故事、群聊、角色 JSON）在手机上点了都没反应。
 *
 * 2026-10-14 复测订正（重要）：本文件原先那句"同一台 WebView 里
 * `window.showSaveFilePicker()` 能用、会拉起 documentsui"——**不成立**。
 * 这个 API 在这台 WebView（Chrome 133 Android WebView）里是个桩：函数存在、能调用，
 * 但 14ms 就抛 `AbortError: Failed to execute 'showSaveFilePicker' on 'Window':
 * The user aborted a request.`，既不拉起任何界面，logcat 里也没有 CREATE_DOCUMENT/GET_CONTENT。
 * 对照探针（往页面里注入一个按钮、真实触摸触发、完全不经过应用代码）复现同样结果，
 * 所以与用户手势、与"先弹面板再算 Blob"这段顺序都无关。系统侧本身是好的：
 * `adb shell am start -a android.intent.action.CREATE_DOCUMENT ...` 能正常拉起
 * `com.google.android.documentsui/.picker.PickActivity` 保存界面（有截图）。
 *
 * 因此下面 WebView 分支目前是**空转**的：拿到 AbortError ⇒ 返回 'cancelled' ⇒ 界面既不报错也不提示。
 * 要真修得走原生，姊妹项目 `D:\AI_data\xiaoshuo_skill_kaifa\novel-studio` 的做法是自定义
 * Capacitor 插件 `NovelExport`（原生 ACTION_CREATE_DOCUMENT + 分块 base64 落盘，注释里写着
 * "Android WebView 的 blob 下载不一定落盘"），那条路已经在同一台模拟器上产出过文件。
 * 保留本文件的价值：全仓 9 处导出已收敛到这一个入口（`scripts/save-blob-guard.mjs` 守着），
 * 将来接原生只改这一处。
 *
 * 顺序是刻意反过来的：**先弹面板，再算 Blob**。
 * 因为 `showSaveFilePicker()` 要求用户手势，而各导出站点在真正存盘前都要先
 * `await` 一段取数据的异步工作（`exportAll(adapter, …)` 之类）；等完再弹，手势可能已经过期。
 * 先拿到文件句柄、数据算好后再 `createWritable()` 写入，就不依赖那段 await 之后手势还在不在。
 * （这一点在共享模拟器上没能把"await 800ms / 3000ms 后面势是否仍有效"测完，所以按最不依赖它的方式写。）
 *
 * 判定条件用 UA 里的 `; wv)`（安卓 WebView 标记）而不是"有没有 showSaveFilePicker"：
 * 桌面 Chrome 也支持它，但那里的既有行为是"直接落到下载文件夹"，
 * 换成每次弹保存面板是用户没要求的改动。
 */

import { t } from '@/i18n';

/**
 * 存盘结果。
 *
 * 从 `'saved' | 'cancelled'` 扩成对象，是因为两件事只有对象说得清：
 *   1. **落点**：用户要知道文件去哪了（浏览器下载目录 / 系统下载目录 / 选定位置）；
 *   2. **`unsupported`**：安卓 WebView 里 `showSaveFilePicker` 是个桩（14ms 抛
 *      AbortError，见文件头），把它归进 `cancelled` 的后果是——用户点了导出，
 *      界面既不成功也不报错，静默消失。这两种"没存成"必须分开：
 *      `cancelled` 是用户主动取消（不该提示），`unsupported` 是环境做不到（必须说清）。
 */
export type SaveOutcomeKind = 'saved' | 'cancelled' | 'unsupported';

/** 落点类型：决定文案，也决定用户该去哪里找文件 */
export type SaveLocation = 'picker' | 'download' | 'system-download';

export interface SaveOutcome {
  outcome: SaveOutcomeKind;
  /** 建议文件名（回显用；不是磁盘上的完整路径——浏览器拿不到） */
  filename: string;
  location: SaveLocation;
}

/**
 * 桩式 AbortError 的判定阈值（毫秒）。
 *
 * 安卓 WebView 的 showSaveFilePicker 实测 14ms 抛 AbortError；真人点取消不可能
 * 这么快。250ms 给足余量——真机上若出现"点取消被当成不支持"，先看这个数。
 */
const STUB_ABORT_MS = 250;

/** 当前存盘环境：决定文案口径（三端各不相同，别用一句话糊住） */
export type SaveEnv = 'tauri' | 'android-webview' | 'browser';

export function detectSaveEnv(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): SaveEnv {
  if (isAndroidWebView(ua)) return 'android-webview';
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    return 'tauri';
  }
  return 'browser';
}

/** 是否处在安卓 WebView（Capacitor 壳）里 —— 只有它需要走系统保存面板 */
export function isAndroidWebView(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /;\s*wv\)/.test(ua);
}

type SavePicker = (options: { suggestedName: string }) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

/**
 * 存一个 Blob。
 *
 * @param filename 建议文件名（含扩展名）
 * @param makeBlob 数据生产者；WebView 路径下它在面板弹出来之后才被调用
 */
export async function saveBlob(filename: string, makeBlob: () => Blob | Promise<Blob>): Promise<SaveOutcome> {
  const env = detectSaveEnv();
  const picker = env === 'android-webview'
    ? ((window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker ?? null)
    : null;

  if (picker) {
    let handle: Awaited<ReturnType<SavePicker>> | null = null;
    const startedAt = Date.now();
    try {
      handle = await picker({ suggestedName: filename });
    } catch (err) {
      /*
       * 这里**不能**一律把 AbortError 当成"用户取消"。
       *
       * 安卓 WebView 的 showSaveFilePicker 是桩：函数存在、能调用，14ms 就抛
       * AbortError，既不拉界面也没有 logcat 记录（文件头记着对照探针的结论）。
       * 把它归成 cancelled，界面按约定"取消了不报已导出"就静默了——这就是
       * "点了导出没反应"的成因。
       *
       * 区分方式用**耗时**：桩在十几毫秒内就抛（实测 14ms），而真人从"面板弹出"
       * 到"点取消"不可能这么快。250ms 是两者之间一个宽松的分界。
       * （不用"有没有拿到 handle"判断——两者都拿不到。）
       */
      const aborted = (err as Error)?.name === 'AbortError';
      const elapsed = Date.now() - startedAt;
      if (aborted && elapsed >= STUB_ABORT_MS) {
        // 面板真的弹过、用户真的点了取消
        return { outcome: 'cancelled', filename, location: 'picker' };
      }
      // 桩（或该 WebView 根本没实现）：锚点兜底 + **如实回报 unsupported**
      await anchorDownload(filename, makeBlob);
      return { outcome: 'unsupported', filename, location: 'system-download' };
    }
    if (handle) {
      const writable = await handle.createWritable();
      const blob = await makeBlob();
      await writable.write(blob);
      await writable.close();
      return { outcome: 'saved', filename, location: 'picker' };
    }
  }

  await anchorDownload(filename, makeBlob);
  // 浏览器与 Tauri(WebView2) 都走这条：落到各自的下载目录。
  // Tauri 这一端拿不到完整路径——全仓没有通用的"保存到用户选定路径"的 Rust 命令，
  // 新增要连原生一起验证；所以文案只说"下载目录"，不编造路径（见 DEV_PLAN C2 边界）。
  return { outcome: 'saved', filename, location: 'download' };
}

/** 锚点下载：浏览器与 WebView2 的既有路径（安卓 WebView 里它是静默无效的，见文件头） */
async function anchorDownload(filename: string, makeBlob: () => Blob | Promise<Blob>): Promise<void> {
  const blob = await makeBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 把存盘结果翻成一句人话（三端文案各自成立）。
 *
 * 返回 `null` 表示**不要提示**：用户主动取消，弹一句"已取消"只是噪音。
 * 其余情况一律要说，且说清"文件在哪"或"为什么没成"。
 */
export function describeSaveResult(
  result: SaveOutcome,
  env: SaveEnv = detectSaveEnv()
): { type: 'success' | 'info' | 'error'; message: string } | null {
  if (result.outcome === 'cancelled') return null;

  if (result.outcome === 'unsupported') {
    return {
      type: 'info',
      message: t('save.unsupportedWebView', { name: result.filename }),
    };
  }

  // saved：按落点分文案，三端不共用一句话
  if (result.location === 'picker') {
    return { type: 'success', message: t('save.savedPicked', { name: result.filename }) };
  }
  if (env === 'tauri') {
    return { type: 'success', message: t('save.savedTauri', { name: result.filename }) };
  }
  return { type: 'success', message: t('save.savedBrowser', { name: result.filename }) };
}
