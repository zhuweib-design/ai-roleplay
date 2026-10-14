/**
 * 把 Blob 交给用户存盘（浏览器下载 / WebView 系统保存面板）
 *
 * 为什么需要这个文件：2026-10-14 在安卓模拟器上实测过，APK 的 WebView 里
 * `URL.createObjectURL(blob)` + `<a download>` + `click()` 是**静默无效**的——
 * 不抛错、不报"下载被阻止"、`/sdcard` 全盘搜不到文件、logcat 一条下载记录都没有。
 * 也就是说全仓 9 处导出（备份包、角色卡 PNG、对话 Markdown、审核日志、快捷回复、
 * 世界书、故事、群聊、角色 JSON）在手机上点了都没反应。
 * 同一台 WebView 里 `window.showSaveFilePicker()` 是能用的（实测会拉起
 * `com.google.android.documentsui` 的保存界面），所以这里在它上面改走那条路。
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
