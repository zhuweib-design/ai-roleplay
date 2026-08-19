import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

// ESLint 9 flat config — T-14 质量防线「代码质量/风格」层
// 错误类(阻断): 未用变量(忽略下划线占位); type-aware 规则(no-floating-promises/await-thenable)已提升 error 强化 CI 防线
// 风格类(仅 warn, 不阻断): 引号 / 分号 / 组件命名 等
// 纯排版规则(无 prettier 配合) 降级 off 以减少噪声
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-i18n-check/**',
      'dist-p13-check/**',
      'dist-qa/**',
      'dist-measure/**',
      'dist-opt*/**',
      'dist-lib-eval*/**',
      'dist-electron/**',
      'coverage/**',
      'coverage-ci/**',
      'src-tauri/target/**',
      '.workbuddy/**',
      'out/**',
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
    // Node 构建脚本：注入 node 全局，避免 no-undef 误报
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
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
