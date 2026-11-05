/**
 * saveBlob 的分支与"没存成也得分清是哪一种"
 *
 * 每条都对应一次实测过的行为差异（见 src/utils/save-blob.ts 顶部）：
 * - 桌面/PWA：保持既有 `<a download>`，不去碰用户习惯的"直接进下载文件夹"；
 * - 安卓 WebView：`showSaveFilePicker` 是**桩**（14ms 抛 AbortError，不拉界面）
 *   ⇒ 报 `unsupported` 并说清"去哪找"，不再静默；
 * - 面板真的弹过、用户点取消 ⇒ 报 `cancelled`，调用方不得报"已导出"；
 * - 面板路径下 Blob 是**面板弹出之后**才算的（用户手势要留给 showSaveFilePicker）。
 *
 * 本轮（DEV_PLAN C2）的关键变化：**AbortError 不再一律等于"用户取消"**。
 * 桩与真取消靠耗时区分（14ms vs 真人不可能这么快），阈值 250ms。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveBlob, isAndroidWebView, detectSaveEnv, describeSaveResult } from '@/utils/save-blob';

const WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.F3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function setUA(ua: string) {
  vi.stubGlobal('navigator', { userAgent: ua });
}

/** 记录调用顺序的假保存面板 */
function fakePicker(order: string[], opts: { throws?: Error; delayMs?: number } = {}) {
  return vi.fn(async ({ suggestedName }: { suggestedName: string }) => {
    order.push(`picker:${suggestedName}`);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.throws) throw opts.throws;
    return {
      createWritable: async () => ({
        write: async (blob: Blob) => order.push(`write:${blob.size}`),
        close: async () => order.push('close'),
      }),
    };
  });
}

function abortError(): Error {
  return Object.assign(new Error('user aborted'), { name: 'AbortError' });
}

describe('isAndroidWebView', () => {
  it('认得出 WebView 的 "; wv)" 标记，且不误认桌面 Chrome', () => {
    expect(isAndroidWebView(WEBVIEW_UA)).toBe(true);
    expect(isAndroidWebView(DESKTOP_UA)).toBe(false);
    expect(isAndroidWebView('')).toBe(false);
  });
});

describe('detectSaveEnv', () => {
  it('三端各认一遍：WebView / Tauri / 普通浏览器', () => {
    expect(detectSaveEnv(WEBVIEW_UA)).toBe('android-webview');
    // Tauri 的 UA 与普通浏览器一致，靠注入的全局标记区分
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(detectSaveEnv(DESKTOP_UA)).toBe('tauri');
    vi.stubGlobal('window', {});
    expect(detectSaveEnv(DESKTOP_UA)).toBe('browser');
  });
});

describe('saveBlob', () => {
  beforeEach(() => {
    // 假 objectURL 用 '#'：jsdom 对 `<a download>` 的点击会当成"跨文档导航"并打印
    // Not-implemented 报错，那噪声会混进 CI 日志（blob: 前缀正是触发它的原因）。
    // 下载动作本身改由下面的 click 监听断言，测的仍是"真的点了带 download 的锚点"。
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => '#'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** 装一个 document 级监听，捕获点击到的锚点属性 */
  function captureAnchorClick() {
    const seen: Array<{ download: string | null; href: string }> = [];
    const on = (ev: Event) => {
      const a = (ev.target as HTMLElement).closest?.('a');
      if (a) seen.push({ download: a.getAttribute('download'), href: a.getAttribute('href') ?? '' });
    };
    document.addEventListener('click', on);
    return { seen, off: () => document.removeEventListener('click', on) };
  }

  it('非 WebView：走 <a download>，即使 window 上有 showSaveFilePicker 也不碰它', async () => {
    setUA(DESKTOP_UA);
    const picker = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const create = vi.fn(() => new Blob(['abc'], { type: 'text/plain' }));
    const cap = captureAnchorClick();

    const outcome = await saveBlob('a.txt', create);
    cap.off();

    expect(outcome).toEqual({ outcome: 'saved', filename: 'a.txt', location: 'download' });
    expect(picker).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(cap.seen).toEqual([{ download: 'a.txt', href: '#' }]);
    // 锚点必须已经不在 DOM 里（旧的下载实现就是靠这个避免残留）
    expect(document.querySelector('a[download="a.txt"]')).toBeNull();
  });

  it('WebView：先弹面板再算 Blob，写入后返回 saved（落点 picker）', async () => {
    setUA(WEBVIEW_UA);
    const order: string[] = [];
    const picker = fakePicker(order);
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const create = vi.fn(() => {
      order.push('makeBlob');
      return new Blob(['hello'], { type: 'text/plain' });
    });

    const outcome = await saveBlob('备份.json', create);

    expect(outcome).toEqual({ outcome: 'saved', filename: '备份.json', location: 'picker' });
    expect(picker).toHaveBeenCalledWith({ suggestedName: '备份.json' });
    // 这条顺序断言才是"手势安全"的证据：面板在前，算数据在后
    expect(order).toEqual(['picker:备份.json', 'makeBlob', 'write:5', 'close']);
  });

  it('WebView 里面板是桩（立刻抛 AbortError）⇒ unsupported，不是 cancelled', async () => {
    setUA(WEBVIEW_UA);
    vi.stubGlobal('window', { showSaveFilePicker: fakePicker([], { throws: abortError() }) });
    const create = vi.fn(() => new Blob(['x']));
    const cap = captureAnchorClick();

    const outcome = await saveBlob('a.json', create);
    cap.off();

    // 关键：以前这里回 'cancelled' ⇒ 调用方按约定不提示 ⇒ 用户点了导出毫无反应
    expect(outcome.outcome).toBe('unsupported');
    expect(outcome.location).toBe('system-download');
    // 兜底仍会试一次锚点（在真的能下载的 WebView 上它是有用的）
    expect(cap.seen).toEqual([{ download: 'a.json', href: '#' }]);
  });

  it('WebView 里面板真的弹过、用户点了取消（耗时 ≥250ms）⇒ cancelled，且不生成数据', async () => {
    setUA(WEBVIEW_UA);
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      showSaveFilePicker: fakePicker([], { throws: abortError(), delayMs: 400 }),
    });
    const create = vi.fn(() => new Blob(['x']));

    const pending = saveBlob('a.json', create);
    // 推进假时钟：让 picker 内部的 400ms 定时器到点
    await vi.advanceTimersByTimeAsync(400);
    const outcome = await pending;

    expect(outcome.outcome).toBe('cancelled');
    expect(create).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('WebView 但面板根本没实现（非 AbortError）⇒ 同样如实报 unsupported', async () => {
    setUA(WEBVIEW_UA);
    const notSupported = Object.assign(new Error('not implemented'), { name: 'NotSupportedError' });
    vi.stubGlobal('window', { showSaveFilePicker: fakePicker([], { throws: notSupported }) });
    const cap = captureAnchorClick();

    const outcome = await saveBlob('a.json', () => new Blob(['x']));
    cap.off();

    expect(outcome.outcome).toBe('unsupported');
    expect(cap.seen).toEqual([{ download: 'a.json', href: '#' }]);
  });
});

describe('describeSaveResult · 三端文案', () => {
  it('取消 ⇒ 不提示（返回 null）', () => {
    expect(
      describeSaveResult({ outcome: 'cancelled', filename: 'a.json', location: 'picker' })
    ).toBeNull();
  });

  it('浏览器：说清落在下载目录', () => {
    const r = describeSaveResult(
      { outcome: 'saved', filename: 'a.json', location: 'download' },
      'browser'
    );
    expect(r?.type).toBe('success');
    expect(r?.message).toContain('a.json');
    expect(r?.message).toContain('浏览器下载目录');
  });

  it('Tauri：同一落点但文案不叫"浏览器"（那一端没有浏览器这个概念）', () => {
    const r = describeSaveResult(
      { outcome: 'saved', filename: 'a.json', location: 'download' },
      'tauri'
    );
    expect(r?.message).toContain('系统下载目录');
    expect(r?.message).not.toContain('浏览器');
  });

  it('安卓 WebView：不说"已保存"，而是说清去哪找', () => {
    const r = describeSaveResult(
      { outcome: 'unsupported', filename: 'a.json', location: 'system-download' },
      'android-webview'
    );
    expect(r?.type).toBe('info');
    expect(r?.message).toContain('不支持选择保存位置');
    expect(r?.message).toContain('a.json');
    expect(r?.message).not.toContain('已保存');
  });
});
