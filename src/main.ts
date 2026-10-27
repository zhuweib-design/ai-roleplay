// main.ts — 应用入口

import './styles/tokens.css';
import './styles/themes.css';
// 结构层 token（L1，与主题无关）：只放尺度，不放颜色；单独一个文件是为了
// 让"改名"与"换肤"两件事能被分开评审（见 docs/design/TOKEN_PILOT_2026-10-11.md）
import './styles/tokens-structure.css';
import './styles/base.css';
// 跨组件共享原语（按钮族）：只放「多处逐字同值」的那一份，组件 scoped 规则
// 特异性更高、稳定胜出，所以引入本文件不会改写任何未迁移组件的视觉
import './styles/primitives.css';
import './styles/layout.css';
import './styles/responsive.css';
// 移动端「两级互换」原语（MOBILE_PLAN 批次 1-1）：只在 ≤640 生效，
// 桌面不写任何声明，所以放在 responsive.css 之后、app-global 之前不会改写既有布局
import './styles/m-swap.css';
import './styles/app-global.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import { vRange } from './core/range-fill';
import { vTip } from './core/tip';
import { installPresetInputBehavior } from './core/preset-input';
import { purgeStaleServiceWorker } from './core/native-sw-cleanup';
import { startKeyboardInset } from './core/keyboard-inset';
import App from './App.vue';

// 原生壳：老版本 APK 留下的 Service Worker 会拿旧包，先一次性清掉再挂载
// （新构建已不再注册 SW，所以注销后不会长回来；详见该文件的注释）
if (__NATIVE_SHELL__) void purgeStaleServiceWorker();

const app = createApp(App);
app.use(createPinia());
app.use(router);
// 全局指令：滑块进度着色（见 src/core/range-fill.ts 的成因说明）
app.directive('range', vRange);
// 全局指令：键盘/触屏可达的提示气泡（替代原生 title，见 src/core/tip.ts）
app.directive('tip', vTip);
// 全局行为：有预设值的输入框聚焦清空、未改动失焦回填（见 src/core/preset-input.ts）
installPresetInputBehavior();
// 等首次导航解析完再挂载（B6 之后补的，2026-10-27）：
// 不等的话，首帧 `useRoute().fullPath` 还是 vue-router 的 START_LOCATION `'/'`，
// 而首启欢迎窗恰好就在这一帧可点——它里面每个跳转按钮都要读"当前在哪"当返回来源，
// 于是 `from` 被写成 `/`（实测：拦住聊天页分包 1.5s 时 100% 复现）。
// 等 isReady 的代价是首屏空白延长到首个路由分包加载完，本地壳里是毫秒级；
// 换来的是"任何一次跳转记下的来源都是真实所在页"。
await router.isReady();
app.mount('#app');
// 键盘只缩视觉视口的引擎（iOS Safari 一类）靠这里把 --keyboard-inset 写出来；
// Android 上布局视口已经缩过，差值恒为 0，不会重复抬升（见该模块注释）
startKeyboardInset();
