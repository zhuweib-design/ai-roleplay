import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@storage': path.resolve(__dirname, 'src/storage'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@': path.resolve(__dirname, 'src'),
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
      // 真实基线 2026-08-14 实测去重后 ~89.7%（文档旧记 81.77% 已过时）。
      // 注：Windows 本地因 v8 盘符大小写(G:/g:)把同一文件重复计两份(一份全 0)，
      // 会误报总覆盖率 ~44.6% 触发门禁失败；该误报仅影响 Windows 开发机，
      // CI(Linux/macOS) 路径大小写一致、无此重复，80% 门禁正常通过。
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
