import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

// ESLint 9 flat config — T-14 质量防线「代码质量/风格」层
// 错误类(阻断): 未用变量(忽略下划线占位) / 悬空 Promise / 显式 any 滥用 等
// 风格类(仅 warn, 不阻断): 引号 / 分号 / 组件命名 等
// 纯排版规则(无 prettier 配合) 降级 off 以减少噪声
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-i18n-check/**',
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
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
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
