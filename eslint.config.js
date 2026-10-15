import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

// eslint-plugin-vue v10 起 flat 配置不再自带浏览器全局声明，
// 需要在这里显式给出（否则 window/document 等全部 no-undef）。
const browserGlobals = { ...globals.browser, Worker: 'readonly' };

// ESLint 9 flat config — T-14 质量防线「代码质量/风格」层
// 错误类(阻断): 未用变量(忽略下划线占位); type-aware 规则(no-floating-promises/await-thenable)已提升 error 强化 CI 防线
// 风格类(仅 warn, 不阻断): 引号 / 分号 / 组件命名 等
// 纯排版规则(无 prettier 配合) 降级 off 以减少噪声
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      // 临时/历史构建目录统一忽略（2026-09-28 性能优化引入 dist-preopt-* 时踩坑：
      // 逐条列举的 dist-* 规则无法覆盖新命名的构建目录，会污染 lint 报数千条错误）
      'dist-*/**',
      'coverage/**',
      // ORT_ISOLATION_DESIGN S2c：public/vendor/ 由 scripts/vendor-ort.mjs 生成的
      // 第三方压缩产物（ort.bundle.min.mjs），非项目源码，lint 会报数千条表达式错误
      'public/vendor/**',
      // 2026-09-18 目录整理：历史 dist-*/coverage-ci 等一次性快照已统一归入 artifacts/
      // （原 dist-i18n-check / dist-p13-check / dist-qa / dist-measure / dist-opt* /
      //  dist-lib-eval* / coverage-ci 等逐条规则一并收敛为本条，见 MIGRATION_LOG.md）
      'artifacts/**',
      'src-tauri/target/**',
      // 与上一条同族：安卓壳的原生产物，两处都是生成物且已被 android/.gitignore 忽略
      // （CI 看不到，本地出过一次 APK / cap sync 之后 `eslint .` 会多出九千余条）：
      //   android/**\/build/            gradle 中间产物（含 Capacitor 的 native-bridge.js）
      //   android/app/src/main/assets/  `cap sync` 拷进去的前端压缩包与 vendor 产物
      // 手写的那一个 MainActivity.java 不是 JS，不受影响，故不整体放过 android/。
      'android/**/build/**',
      'android/app/src/main/assets/**',
      '.workbuddy/**',
      '.workbuddy-ai/**',
      'out/**',
      // 设计交付物与静态原型不算产品源码。2026-10-11 的现场事实：并行会话在
      // `docs/design/ai-chat-ui-redesign/` 下放了一整套原型自带 js（9 个脚本），
      // `eslint .` 立刻多出 23 条 no-undef/未用变量——那些是浏览器里跑的演示代码，
      // 不该进产品门禁。配套断言见 `tests/tooling/lint-scope.test.ts`：
      // docs/ 下一旦出现**被 git 跟踪的** js/mjs/ts，那条断言就红，逼一次"这是不是产品代码"的判断。
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    // .vue 文件需类型信息支持 type-aware 规则: 启用 TS project service
    // extraFileExtensions 让 TS 项目服务能解析 .vue 单文件组件
    files: ['**/*.vue'],
    languageOptions: {
      globals: browserGlobals,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    // .ts 文件启用 TS project service, 支撑 type-aware 规则(T-14 待办⑤)
    // 作用域收窄到 src/tests(已在 tsconfig include 内); 根级配置文件(.ts)
    // 回落默认解析, 避免 "not found by project service" 解析错误
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Node 构建脚本：注入 node 全局，避免 no-undef 误报；
    // 部分 .mjs 探针会在浏览器页面上取值，顺带给浏览器全局
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...browserGlobals } },
  },
  {
    // 类型声明文件：vue shim 标准写法允许空对象类型
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },
  {
    // 测试文件：mock generator 无 yield 属正常
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: { 'require-yield': 'off' },
  },
  {
    // ── type-aware 增强(T-14 ⑤→已闭环): 需 TS 类型信息, 依赖上方 projectService ──
    // no-floating-promises / await-thenable / no-misused-promises 均已提升 error
    // (no-misused-promises 原标注"Vue @click 误报多暂不启用", 实测仅 7 处已全修复, 2026-08-19 正式启用)
    files: ['src/**/*.ts', 'src/**/*.vue', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    rules: {
      // ── 错误类（阻断门禁）──
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // ── 已知噪声/非阻断规则调整 ──
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',

      // ── 纯排版规则：无 prettier 配合，降级 off 减少噪声（不阻断门禁）──
      'vue/max-attributes-per-line': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
];
