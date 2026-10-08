/**
 * 全局测试环境 setup（Phase G4）
 *
 * 内容：
 * 1. fake-indexeddb：让依赖 IndexedDB 的 store 在 jsdom 下可运行
 * 2. File.text() polyfill：jsdom 部分版本缺失
 * 3. matchMedia / IntersectionObserver / ResizeObserver polyfill：Vue 组件挂载所需
 * 4. 加载全局 CSS：让 axe-core 可验证部分样式相关规则（如颜色对比度）
 */
import 'fake-indexeddb/auto';

// ── File.text() polyfill ──
if (typeof File !== 'undefined' && !File.prototype.text) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (File.prototype as any).text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// ── Blob.arrayBuffer() polyfill（jsdom 部分版本缺失，F13 PNG 测试需要） ──
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Blob.prototype as any).arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ── matchMedia polyfill ──
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ── IntersectionObserver polyfill ──
if (typeof IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverStub,
  });
}

// ── ResizeObserver polyfill ──
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverStub,
  });
}

// ── 全局指令注册 ──
// 应用侧在 src/main.ts 里 app.directive(...) 注册的全局指令，组件测试用 mount() 时
// 拿不到（Vue 只会报 "Failed to resolve directive" 然后静默跳过），
// 于是 v-tip 挂的 aria-describedby、v-range 写的 --range-pct 在测试里全部消失。
// 在这里统一注册，测试与运行时看到的是同一套指令。
import { config } from '@vue/test-utils';
import { vTip } from '../src/core/tip';
import { vRange } from '../src/core/range-fill';

config.global.directives = {
  ...(config.global.directives ?? {}),
  tip: vTip,
  range: vRange,
};

// ── 加载全局样式（供 axe-core 颜色对比度等规则使用） ──
import '../src/styles/tokens.css';
import '../src/styles/themes.css';
import '../src/styles/base.css';
import '../src/styles/layout.css';
import '../src/styles/responsive.css';
