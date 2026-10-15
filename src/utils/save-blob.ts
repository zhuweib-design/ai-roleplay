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

/** 存盘结果：调用方拿它决定要不要说"已导出"（取消了还报成功，就是界面在撒谎） */
export type SaveOutcome = 'saved' | 'cancelled';

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
  const picker = isAndroidWebView()
    ? ((window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker ?? null)
    : null;

  if (picker) {
    let handle: Awaited<ReturnType<SavePicker>> | null = null;
    try {
      handle = await picker({ suggestedName: filename });
    } catch (err) {
      // 用户取消（AbortError）⇒ 明确回 cancelled，调用方不得报"已导出"
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // 其它异常（例如该 WebView 其实不实现它）落回下载路径，别把功能整个弄没
    }
    if (handle) {
      const writable = await handle.createWritable();
      const blob = await makeBlob();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    }
  }


  const blob = await makeBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return 'saved';
}
