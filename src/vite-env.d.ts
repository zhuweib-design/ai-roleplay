/// <reference types="vite/client" />

/** 构建期注入：这份产物是否跑在原生壳（Capacitor / Tauri）里，见 vite.config.ts */
declare const __NATIVE_SHELL__: boolean;

/** 构建期注入：package.json 的版本号，设置→关于显示的就是它 */
declare const __APP_VERSION__: string;
