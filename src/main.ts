// main.ts — 应用入口

import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/responsive.css';
import './styles/app-global.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import { vRange } from './core/range-fill';
import { vTip } from './core/tip';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
// 全局指令：滑块进度着色（见 src/core/range-fill.ts 的成因说明）
app.directive('range', vRange);
// 全局指令：键盘/触屏可达的提示气泡（替代原生 title，见 src/core/tip.ts）
app.directive('tip', vTip);
app.mount('#app');
