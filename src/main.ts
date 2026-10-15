// main.ts — 应用入口

import './styles/tokens.css';
import './styles/themes.css';
// 结构层 token（L1，与主题无关）：只放尺度，不放颜色；单独一个文件是为了
// 让"改名"与"换肤"两件事能被分开评审（见 docs/design/TOKEN_PILOT_2026-10-11.md）
import './styles/tokens-structure.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/responsive.css';
import './styles/app-global.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import { vRange } from './core/range-fill';
import { vTip } from './core/tip';
import { installPresetInputBehavior } from './core/preset-input';
import { purgeStaleServiceWorker } from './core/native-sw-cleanup';
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
app.mount('#app');
