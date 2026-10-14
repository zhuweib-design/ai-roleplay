/**
 * saveBlob 的三条分支与"取消不报成功"
 *
 * 每条都对应一次实测过的真机行为差异（见 src/utils/save-blob.ts 顶部）：
 * - 桌面/ PWA：保持既有 `<a download>`，不去碰用户习惯的"直接进下载文件夹"；
 * - 安卓 WebView：`<a download>` 静默无效 ⇒ 必须走系统保存面板；
 * - 面板被用户取消 ⇒ 回 'cancelled'，调用方不得报"已导出"；
 * - 面板路径下 Blob 是**面板弹出之后**才算的（用户手势要留给 showSaveFilePicker）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveBlob, isAndroidWebView } from '@/utils/save-blob';

const WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.F3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function setUA(ua: string) {
  vi.stubGlobal('navigator', { userAgent: ua });
}

/** 记录调用顺序的假保存面板 */
function fakePicker(order: string[], opts: { throws?: Error } = {}) {
  return vi.fn(async ({ suggestedName }: { suggestedName: string }) => {
    order.push(`picker:${suggestedName}`);
    if (opts.throws) throw opts.throws;
    return {
      createWritable: async () => ({
        write: async (blob: Blob) => order.push(`write:${blob.size}`),
        close: async () => order.push('close'),
      }),
    };
  });
}

describe('isAndroidWebView', () => {
  it('认得出 WebView 的 "; wv)" 标记，且不误认桌面 Chrome', () => {
    expect(isAndroidWebView(WEBVIEW_UA)).toBe(true);
    expect(isAndroidWebView(DESKTOP_UA)).toBe(false);
    expect(isAndroidWebView('')).toBe(false);
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

    expect(outcome).toBe('saved');
    expect(picker).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(cap.seen).toEqual([{ download: 'a.txt', href: '#' }]);
    // 锚点必须已经不在 DOM 里（旧的下载实现就是靠这个避免残留）
    expect(document.querySelector('a[download="a.txt"]')).toBeNull();
  });

  it('WebView：先弹面板再算 Blob，写入后返回 saved', async () => {
    setUA(WEBVIEW_UA);
    const order: string[] = [];
    const picker = fakePicker(order);
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const create = vi.fn(() => {
      order.push('makeBlob');
      return new Blob(['hello'], { type: 'text/plain' });
    });

    const outcome = await saveBlob('备份.json', create);

    expect(outcome).toBe('saved');
    expect(picker).toHaveBeenCalledWith({ suggestedName: '备份.json' });
    // 这条顺序断言才是"手势安全"的证据：面板在前，算数据在后
    expect(order).toEqual(['picker:备份.json', 'makeBlob', 'write:5', 'close']);
  });

  it('WebView 里用户取消面板：返回 cancelled，且根本不生成数据', async () => {
    setUA(WEBVIEW_UA);
    const abort = Object.assign(new Error('user aborted'), { name: 'AbortError' });
    vi.stubGlobal('window', { showSaveFilePicker: fakePicker([], { throws: abort }) });
    const create = vi.fn(() => new Blob(['x']));

    const outcome = await saveBlob('a.json', create);

    expect(outcome).toBe('cancelled');
    expect(create).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('WebView 但面板其实没实现（非 AbortError）：落回下载路径，别把功能整个弄没', async () => {
    setUA(WEBVIEW_UA);
    const notSupported = Object.assign(new Error('not implemented'), { name: 'NotSupportedError' });
    vi.stubGlobal('window', { showSaveFilePicker: fakePicker([], { throws: notSupported }) });
    const cap = captureAnchorClick();

    const outcome = await saveBlob('a.json', () => new Blob(['x']));
    cap.off();

    expect(outcome).toBe('saved');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(cap.seen).toEqual([{ download: 'a.json', href: '#' }]);
  });
});
