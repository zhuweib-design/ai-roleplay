declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- *.vue 模块 shim 的标准类型信号(默认接受任意 props/slots)
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
