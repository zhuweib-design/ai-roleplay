import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname, 'src/core'),
      '@storage': path.resolve(import.meta.dirname, 'src/storage'),
      '@api': path.resolve(import.meta.dirname, 'src/api'),
      '@services': path.resolve(import.meta.dirname, 'src/services'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      // P2-1 回归防线：覆盖率低于阈值 CI 即失败。
      // 基线(vitest@4 v8, 2026-08-15 实测): statements 78.99 / branches 74.05 /
      // functions 81.26 / lines 80.22。阈值按实测留 ~1 点余量防偶发抖动误伤。
      // 注: vitest@2 时代 Windows 盘符大小写(G:/g:)重复计文件问题在 vitest@4
      // (v8 provider 重写) 已修复, Windows/CI 口径一致; branches 因 ?? / 三元 /
      // 复合条件计数更细而天然偏低, 故单独设 73%。
      thresholds: {
        statements: 78,
        branches: 73,
        functions: 78,
        lines: 78,
      },
    },
  },
});
