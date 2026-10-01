#!/usr/bin/env node
/**
 * 性能分析脚本 - 量化优化效果
 *
 * 功能：
 * 1. 分析构建产物大小
 * 2. 检测大文件与重复代码
 * 3. 生成性能基准报告
 * 4. 对比优化前后差异
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(__dirname, '..');

// ── 配置 ──
const CONFIG = {
  distDir: join(projectRoot, 'dist'),
  srcDir: join(projectRoot, 'src'),
  baselineFile: join(projectRoot, 'docs/dev/perf-baseline.json'),
  reportFile: join(projectRoot, 'docs/dev/perf-report.md'),

  thresholds: {
    maxFileSize: 500 * 1024,      // 500KB
    maxChunkSize: 300 * 1024,     // 300KB
    maxSourceLines: 2000,         // 2000 行
    maxFunctionLength: 100,       // 100 行
  },
};

// ── 工具函数 ──
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  // 负值（优化后的减少量）需取绝对值计算量级，保留负号
  const negative = bytes < 0;
  const abs = Math.abs(bytes);
  const i = Math.floor(Math.log(abs) / Math.log(k));
  return `${negative ? '-' : ''}${(abs / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDiff(before, after) {
  const diff = after - before;
  const percent = ((diff / before) * 100).toFixed(1);
  const sign = diff > 0 ? '+' : '';
  const emoji = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
  return `${emoji} ${sign}${formatBytes(diff)} (${sign}${percent}%)`;
}

function scanDirectory(dir, filter = () => true) {
  const results = [];

  function walk(currentDir) {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            walk(fullPath);
          }
        } else if (entry.isFile() && filter(entry.name)) {
          const stats = statSync(fullPath);
          results.push({
            path: fullPath.replace(projectRoot, ''),
            name: entry.name,
            size: stats.size,
            ext: extname(entry.name),
          });
        }
      }
    } catch (err) {
      console.error(`扫描目录失败: ${currentDir}`, err.message);
    }
  }

  walk(dir);
  return results;
}

function countLines(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

// ── 分析模块 ──

/** 1. 构建产物分析 */
function analyzeBuildOutput() {
  console.log('\n📦 分析构建产物...');

  const files = scanDirectory(CONFIG.distDir);

  const byType = {
    js: files.filter(f => f.ext === '.js'),
    css: files.filter(f => f.ext === '.css'),
    html: files.filter(f => f.ext === '.html'),
    wasm: files.filter(f => f.ext === '.wasm'),
    other: files.filter(f => !['.js', '.css', '.html', '.wasm'].includes(f.ext)),
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const summary = {
    totalSize,
    totalFiles: files.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, typeFiles]) => [
        type,
        {
          count: typeFiles.length,
          size: typeFiles.reduce((sum, f) => sum + f.size, 0),
          largest: typeFiles.sort((a, b) => b.size - a.size)[0],
        },
      ])
    ),
  };

  // 检测超大文件
  const oversized = files.filter(f => f.size > CONFIG.thresholds.maxFileSize);

  console.log(`✅ 总大小: ${formatBytes(totalSize)}`);
  console.log(`   文件数: ${files.length}`);

  if (oversized.length > 0) {
    console.log(`\n⚠️  发现 ${oversized.length} 个超大文件 (>${formatBytes(CONFIG.thresholds.maxFileSize)}):`);
    oversized.forEach(f => {
      console.log(`   - ${f.name}: ${formatBytes(f.size)}`);
    });
  }

  return summary;
}

/** 2. 源码质量分析 */
function analyzeSourceCode() {
  console.log('\n📝 分析源码质量...');

  const sourceFiles = scanDirectory(
    CONFIG.srcDir,
    name => name.endsWith('.ts') || name.endsWith('.vue')
  );

  const filesWithLines = sourceFiles.map(f => ({
    ...f,
    lines: countLines(join(projectRoot, f.path)),
  }));

  const largeFiles = filesWithLines
    .filter(f => f.lines > CONFIG.thresholds.maxSourceLines)
    .sort((a, b) => b.lines - a.lines);

  const summary = {
    totalFiles: filesWithLines.length,
    totalLines: filesWithLines.reduce((sum, f) => sum + f.lines, 0),
    avgLinesPerFile: Math.round(
      filesWithLines.reduce((sum, f) => sum + f.lines, 0) / filesWithLines.length
    ),
    largeFiles: largeFiles.slice(0, 10),
  };

  console.log(`✅ 源文件: ${summary.totalFiles} 个`);
  console.log(`   总行数: ${summary.totalLines.toLocaleString()}`);
  console.log(`   平均行数: ${summary.avgLinesPerFile}`);

  if (largeFiles.length > 0) {
    console.log(`\n⚠️  发现 ${largeFiles.length} 个超大文件 (>${CONFIG.thresholds.maxSourceLines} 行):`);
    largeFiles.slice(0, 5).forEach(f => {
      console.log(`   - ${f.name}: ${f.lines} 行`);
    });
  }

  return summary;
}

/** 3. Store 复杂度分析 */
function analyzeStores() {
  console.log('\n🏪 分析 Store 复杂度...');

  const storeFiles = scanDirectory(
    join(CONFIG.srcDir, 'stores'),
    name => name.endsWith('.ts')
  );

  const storesWithMetrics = storeFiles.map(f => {
    const fullPath = join(projectRoot, f.path);
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n').length;

    // 简单统计异步函数数量
    const asyncFunctions = (content.match(/async function|async \w+\(/g) || []).length;

    // 统计响应式 API 调用
    const reactiveAPIs = (content.match(/computed\(|watch\(|watchEffect\(/g) || []).length;

    return {
      ...f,
      lines,
      asyncFunctions,
      reactiveAPIs,
    };
  });

  const summary = {
    totalStores: storesWithMetrics.length,
    avgLines: Math.round(
      storesWithMetrics.reduce((sum, s) => sum + s.lines, 0) / storesWithMetrics.length
    ),
    largestStore: storesWithMetrics.sort((a, b) => b.lines - a.lines)[0],
    totalAsyncFunctions: storesWithMetrics.reduce((sum, s) => sum + s.asyncFunctions, 0),
    totalReactiveAPIs: storesWithMetrics.reduce((sum, s) => sum + s.reactiveAPIs, 0),
  };

  console.log(`✅ Store 数量: ${summary.totalStores}`);
  console.log(`   平均行数: ${summary.avgLines}`);
  console.log(`   最大 Store: ${summary.largestStore.name} (${summary.largestStore.lines} 行)`);
  console.log(`   异步函数总数: ${summary.totalAsyncFunctions}`);
  console.log(`   响应式 API 总数: ${summary.totalReactiveAPIs}`);

  return summary;
}

/** 4. 生成对比报告 */
function generateReport(current, baseline) {
  console.log('\n📊 生成性能报告...');

  const lines = [
    '# 性能分析报告',
    '',
    `**生成时间**: ${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
    '## 构建产物',
    '',
    '| 指标 | 当前值 | 基准值 | 变化 |',
    '|------|--------|--------|------|',
  ];

  if (baseline?.build) {
    lines.push(
      `| 总大小 | ${formatBytes(current.build.totalSize)} | ${formatBytes(baseline.build.totalSize)} | ${formatDiff(baseline.build.totalSize, current.build.totalSize)} |`,
      `| 文件数 | ${current.build.totalFiles} | ${baseline.build.totalFiles} | ${current.build.totalFiles - baseline.build.totalFiles > 0 ? '+' : ''}${current.build.totalFiles - baseline.build.totalFiles} |`,
      `| JS 大小 | ${formatBytes(current.build.byType.js.size)} | ${formatBytes(baseline.build.byType.js.size)} | ${formatDiff(baseline.build.byType.js.size, current.build.byType.js.size)} |`,
      `| CSS 大小 | ${formatBytes(current.build.byType.css.size)} | ${formatBytes(baseline.build.byType.css.size)} | ${formatDiff(baseline.build.byType.css.size, current.build.byType.css.size)} |`
    );
  } else {
    lines.push(
      `| 总大小 | ${formatBytes(current.build.totalSize)} | - | - |`,
      `| 文件数 | ${current.build.totalFiles} | - | - |`,
      `| JS 大小 | ${formatBytes(current.build.byType.js.size)} | - | - |`,
      `| CSS 大小 | ${formatBytes(current.build.byType.css.size)} | - | - |`
    );
  }

  lines.push(
    '',
    '## 源码质量',
    '',
    '| 指标 | 当前值 | 基准值 | 变化 |',
    '|------|--------|--------|------|'
  );

  if (baseline?.source) {
    lines.push(
      `| 总行数 | ${current.source.totalLines.toLocaleString()} | ${baseline.source.totalLines.toLocaleString()} | ${current.source.totalLines - baseline.source.totalLines > 0 ? '+' : ''}${(current.source.totalLines - baseline.source.totalLines).toLocaleString()} |`,
      `| 平均行数/文件 | ${current.source.avgLinesPerFile} | ${baseline.source.avgLinesPerFile} | ${current.source.avgLinesPerFile - baseline.source.avgLinesPerFile > 0 ? '+' : ''}${current.source.avgLinesPerFile - baseline.source.avgLinesPerFile} |`,
      `| 超大文件数 | ${current.source.largeFiles.length} | ${baseline.source.largeFiles.length} | ${current.source.largeFiles.length - baseline.source.largeFiles.length > 0 ? '+' : ''}${current.source.largeFiles.length - baseline.source.largeFiles.length} |`
    );
  } else {
    lines.push(
      `| 总行数 | ${current.source.totalLines.toLocaleString()} | - | - |`,
      `| 平均行数/文件 | ${current.source.avgLinesPerFile} | - | - |`,
      `| 超大文件数 | ${current.source.largeFiles.length} | - | - |`
    );
  }

  lines.push(
    '',
    '## Store 复杂度',
    '',
    '| 指标 | 当前值 | 基准值 | 变化 |',
    '|------|--------|--------|------|'
  );

  if (baseline?.stores) {
    lines.push(
      `| Store 数量 | ${current.stores.totalStores} | ${baseline.stores.totalStores} | ${current.stores.totalStores - baseline.stores.totalStores > 0 ? '+' : ''}${current.stores.totalStores - baseline.stores.totalStores} |`,
      `| 平均行数 | ${current.stores.avgLines} | ${baseline.stores.avgLines} | ${current.stores.avgLines - baseline.stores.avgLines > 0 ? '+' : ''}${current.stores.avgLines - baseline.stores.avgLines} |`,
      `| 最大 Store | ${current.stores.largestStore.name} (${current.stores.largestStore.lines}) | ${baseline.stores.largestStore.name} (${baseline.stores.largestStore.lines}) | ${current.stores.largestStore.lines - baseline.stores.largestStore.lines > 0 ? '+' : ''}${current.stores.largestStore.lines - baseline.stores.largestStore.lines} |`,
      `| 异步函数总数 | ${current.stores.totalAsyncFunctions} | ${baseline.stores.totalAsyncFunctions} | ${current.stores.totalAsyncFunctions - baseline.stores.totalAsyncFunctions > 0 ? '+' : ''}${current.stores.totalAsyncFunctions - baseline.stores.totalAsyncFunctions} |`
    );
  } else {
    lines.push(
      `| Store 数量 | ${current.stores.totalStores} | - | - |`,
      `| 平均行数 | ${current.stores.avgLines} | - | - |`,
      `| 最大 Store | ${current.stores.largestStore.name} (${current.stores.largestStore.lines}) | - | - |`,
      `| 异步函数总数 | ${current.stores.totalAsyncFunctions} | - | - |`
    );
  }

  lines.push(
    '',
    '## 超大文件列表',
    '',
    '| 文件 | 行数 |',
    '|------|------|'
  );

  current.source.largeFiles.slice(0, 10).forEach(f => {
    lines.push(`| ${f.name} | ${f.lines} |`);
  });

  lines.push(
    '',
    '---',
    '',
    '**分析工具**: `scripts/perf-analysis.mjs`  ',
    '**下次分析**: 执行优化后运行 `npm run perf:analyze` 查看效果'
  );

  return lines.join('\n');
}

// ── 主流程 ──
async function main() {
  console.log('🚀 开始性能分析...\n');

  const current = {
    build: analyzeBuildOutput(),
    source: analyzeSourceCode(),
    stores: analyzeStores(),
    timestamp: Date.now(),
  };

  // 读取基准数据
  let baseline = null;
  try {
    const baselineContent = readFileSync(CONFIG.baselineFile, 'utf-8');
    baseline = JSON.parse(baselineContent);
    console.log('\n✅ 已加载基准数据');
  } catch {
    console.log('\n⚠️  未找到基准数据，将创建新基准');
  }

  // 生成报告
  const report = generateReport(current, baseline);
  writeFileSync(CONFIG.reportFile, report, 'utf-8');
  console.log(`\n✅ 报告已生成: ${CONFIG.reportFile}`);

  // 询问是否保存为新基准
  if (process.argv.includes('--save-baseline')) {
    writeFileSync(CONFIG.baselineFile, JSON.stringify(current, null, 2), 'utf-8');
    console.log(`✅ 已保存为新基准: ${CONFIG.baselineFile}`);
  } else {
    console.log('\n💡 提示: 运行 `npm run perf:analyze -- --save-baseline` 保存当前为基准');
  }

  console.log('\n🎉 分析完成！');
}

main().catch(err => {
  console.error('❌ 分析失败:', err);
  process.exit(1);
});
