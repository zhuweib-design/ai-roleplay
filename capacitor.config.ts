import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置（Android 优先）
 *
 * webDir 指 vite 构建产物 `dist/`，`cap sync` 时拷进 `android/app/src/main/assets/public`。
 *
 * `androidScheme: 'https'` ⇒ 页面 origin 是 `https://localhost`。这影响两件事：
 * 1. `crypto.subtle`（密钥/主密码加密）必须在安全上下文里，https 满足；
 * 2. 服务商返回的 `Access-Control-Allow-Origin` 要能对上这个 origin —— 已实测有的服务商
 *    会原样回显请求的 Origin（deepseek / 智谱对 `https://localhost` 都回显），
 *    但也有的是按 `http://localhost` 白名单放行的，所以 origin 一变，跨域结论可能要重测。
 *
 * `allowMixedContent` 必须开：origin 是 https，而用户自填的本地推理服务（Ollama 等）
 * 是 `http://127.0.0.1:11434`，不开就被 WebView 按混合内容拦掉。
 *
 * **`CapacitorHttp` 这里刻意没有开。** 它会把全局 `fetch` 桥接到原生网络栈、绕过 WebView 的
 * CORS——代价是所有请求都脱离浏览器网络栈（中止语义、流式读法、超时行为都要重验）。
 * 本仓 2026-10-14 的桌面浏览器实测是"主流 endpoint 多数放行"，但该读数是走系统代理拿到的，
 * 与手机直连的网络路径不同，不足以支撑"全局改道"这个决定。所以顺序是：
 * 先出 debug APK 装真机，用一条确定不放行的地址（如 `https://open.bigmodel.cn/paas/v4`，
 * 这条在桌面浏览器里就拦）验一次；真机也拦 ⇒ 再开这个开关并把流式读法重验一遍。
 */
const config: CapacitorConfig = {
  appId: 'com.zhuweib.airoleplay',
  appName: 'AI 酒馆',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
