// R4-15 行号切片生成器：SettingsView.vue
//   ① 抽出「上下文长度配置」完整闭环 → components/settings/SettingsContextLengthSection.vue
//   ② 删除 10 个死样式块（父模板/子组件根元素均无命中的选择器）
//
// 铁律（DEV_PLAN §7.12 O-4）：基准只读归档副本；越界/切空立即抛错；CRLF 归一后写回。
import fs from 'node:fs';
import path from 'node:path';

const BASE = path.resolve('scripts/archive/r4-15-settings/SettingsView.orig.vue.txt');
const HOST = path.resolve('src/views/SettingsView.vue');
const NEW = path.resolve('src/components/settings/SettingsContextLengthSection.vue');

function readLF(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function writeLF(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
}

const A = readLF(BASE).split('\n');
while (A[A.length - 1] === '') A.pop();

function at(n) {
  const v = A[n - 1];
  if (v === undefined) throw new Error(`行 ${n} 越界（基准共 ${A.length} 行）`);
  return v;
}
function assertLine(n, expect, label) {
  const got = at(n);
  if (got !== expect) {
    throw new Error(`${label}：第 ${n} 行不匹配\n  期望: ${JSON.stringify(expect)}\n  实际: ${JSON.stringify(got)}`);
  }
}
function slice(a, b) {
  if (a < 1 || b > A.length || a > b) throw new Error(`切片越界 ${a}-${b}（基准 ${A.length} 行）`);
  const out = A.slice(a - 1, b);
  if (!out.length) throw new Error(`切片 ${a}-${b} 为空`);
  return out;
}

// ── 边界断言（全部逐字从归档核对） ──────────────────────────────────────
// script 段
assertLine(1, '<script setup lang="ts">', 'script 头');
assertLine(11, "import { showToast } from '@/utils/toast-service';", 'showToast import');
assertLine(13, "import { useSettingsStore } from '@/stores/settings';", 'useSettingsStore import');
assertLine(15, '/** 与模型面板「最大上下文」同一组常用档位（K=1024；1M = 1048576） */', 'CONTEXT_PRESETS 注释');
assertLine(16, 'const CONTEXT_PRESETS: readonly number[] = [', 'CONTEXT_PRESETS 声明');
assertLine(18, '] as const;', 'CONTEXT_PRESETS 结尾');
assertLine(19, '', 'CONTEXT_PRESETS 后空行');

assertLine(84, 'function applyContextPreset(max: number): void {', 'applyContextPreset 头');
assertLine(95, '}', 'applyContextPreset 尾');
assertLine(97, 'const contextBudget = computed(() => settings.availableContextTokens);', 'contextBudget');
assertLine(99, 'const contextLengthError = ref<string | null>(null);', 'contextLengthError');
assertLine(101, '/** 按 1024 进制显示（32768 → 32K、1048576 → 1M），与档位值本身的进制一致 */', 'formatTokenCount 注释');
assertLine(102, 'function formatTokenCount(n: number): string {', 'formatTokenCount 头');
assertLine(109, '}', 'formatTokenCount 尾');
assertLine(110, '', 'formatTokenCount 后空行');

assertLine(141, 'function onMaxContextInput(e: Event): void {', 'onMaxContextInput 头');
assertLine(148, '}', 'onMaxContextInput 尾');
assertLine(150, 'function onReservedInput(e: Event): void {', 'onReservedInput 头');
assertLine(157, '}', 'onReservedInput 尾');
assertLine(158, '', 'onReservedInput 后空行');
assertLine(159, 'function selectCategory(id: SettingsCategoryId) {', 'selectCategory 头（须保留）');
assertLine(165, '', 'selectCategory 后空行');
assertLine(166, 'const settings = useSettingsStore();', 'settings 声明');
assertLine(167, '', 'settings 后空行');
assertLine(168, 'const settingsCategories = computed<SettingsCategory[]>(() => [', 'settingsCategories 头（须保留）');

// template 段
assertLine(273, "    <SettingsAppearancePanel v-show=\"activeCategory === 'appearance'\" />", 'Appearance 面板');
assertLine(275, "    <div v-show=\"activeCategory === 'model'\">", 'model 分类 div 头');
assertLine(276, '      <SettingsModelPanel />', 'Model 面板');
assertLine(277, '', 'Model 面板后空行');
assertLine(278, '      <!-- 上下文长度配置：接入大上下文模型（如 256K）时调大；默认 8192/1024 保持既有行为 -->', '上下文段注释');
assertLine(279, '      <section class="settings-section" aria-labelledby="context-length-title">', '上下文段 section 头');
assertLine(337, '      </section>', '上下文段 section 尾');
assertLine(344, '    </div>', 'model 分类 div 尾');

// style 段
assertLine(361, '<style scoped>', 'style 头');
assertLine(536, '.settings-section {', 'settings-section 头（保留）');
assertLine(544, '}', 'settings-section 尾（保留）');
assertLine(546, '.section-header {', 'section-header 头（搬）');
assertLine(552, '}', 'section-header 尾（搬）');
assertLine(554, '.section-title {', 'section-title 头（搬）');
assertLine(563, '}', 'section-title 尾（搬）');
assertLine(565, '.theme-card.active {', '死块 1 头');
assertLine(568, '}', '死块 1 尾');
assertLine(570, '.fontsize-card.active {', '死块 2 头');
assertLine(573, '}', '死块 2 尾');
assertLine(575, '.profile-item.active {', '死块 3 头');
assertLine(578, '}', '死块 3 尾');
assertLine(580, '.active-badge {', '死块 4 头');
assertLine(587, '}', '死块 4 尾');
assertLine(589, '.badge-active {', '死块 5 头');
assertLine(600, '}', '死块 5 尾');
assertLine(602, '/* ── 响应式 ── */', '响应式注释');
assertLine(603, '@media (max-width: 640px) {', '640 块 A 头');
assertLine(607, '  .settings-section {', '640 内 settings-section（保留）');
assertLine(609, '  }', '640 内 settings-section 尾');
assertLine(610, '  .theme-grid {', '640 死块头');
assertLine(629, '  }', '640 死块尾');
assertLine(630, '}', '640 块 A 尾');
assertLine(632, '.bg-source-tab.active {', '死块 6 头');
assertLine(636, '}', '死块 6 尾');
assertLine(638, '.data-mgmt-btn {', 'data-mgmt-btn 头（搬）');
assertLine(662, '}', 'data-mgmt-btn:disabled 尾（搬）');
assertLine(663, '.extension-block {', 'extension-block 头（搬）');
assertLine(712, '}', 'extension-block .hint-text 尾（搬）');
assertLine(714, '/* 上下文长度配置：预设快捷按钮 + 预算实时展示 */', 'context-preset 注释（搬）');
assertLine(752, '}', 'context-error 尾（搬）');
assertLine(830, '@media (max-width: 640px) {', '16px 块头（删）');
assertLine(842, '}', '16px 块尾（删）');
assertLine(843, '.settings-back-from {', 'settings-back-from 头（保留）');
assertLine(868, '</style>', 'style 尾');

// ── ① 生成新组件 ───────────────────────────────────────────────────────
// script：CONTEXT_PRESETS + 三个状态/函数 + 两个 input handler
const newScriptTop = [
  '<script setup lang="ts">',
  "import Icon from '@/components/common/Icon.vue';",
  "import { ref, computed } from 'vue';",
  "import { t } from '@/i18n';",
  "import { useSettingsStore } from '@/stores/settings';",
  "import { showToast } from '@/utils/toast-service';",
  '',
  '/**',
  ' * SettingsContextLengthSection — 设置·模型分类下的「上下文长度配置」段',
  ' *',
  ' * 自 SettingsView.vue 迁出（R4-15）：这一段是完整闭环 —— 预设档位、预算展示、',
  ' * 两个输入框的校验与回写、保存回执全在这里，SettingsView 其余部分对它零引用。',
  ' * 迁出前父组件 scoped 样式里它的 17 条规则、以及 useSettingsStore 的全部 8 处用法',
  ' * 都只服务这一段。',
  ' *',
  ' * 保留原始语义：默认 8192/1024 维持既有行为，调大用于接入大上下文模型（如 256K）。',
  ' */',
];

const newScriptBody = [
  '',
  ...slice(15, 18), // CONTEXT_PRESETS（注释 + 声明 + 数组 + ] as const;）
  '',
  'const settings = useSettingsStore();',
  '',
  ...slice(99, 99), // contextLengthError
  '',
  ...slice(97, 97), // contextBudget
  '',
  ...slice(84, 95), // applyContextPreset
  '',
  ...slice(101, 109), // formatTokenCount（含注释）
  '',
  ...slice(141, 148), // onMaxContextInput
  '',
  ...slice(150, 157), // onReservedInput
  '</script>',
];

// template：279-337 整体降 4 格缩进（原在 div 内 6 格 → 组件根 2 格）
function dedent4(lines) {
  return lines.map((l) => {
    if (!l.trim()) return '';
    if (!l.startsWith('    ')) throw new Error(`dedent 失败，行不以 4 空格开头: ${JSON.stringify(l)}`);
    return l.slice(4);
  });
}
const newTemplate = ['', '<template>', ...dedent4(slice(279, 337)), '</template>'];

// style：自足一套（搬走 + 只保留新组件实际命中的选择器）
const newStyleParts = [
  '',
  '<style scoped>',
  ...slice(536, 544), // .settings-section
  '',
  ...slice(546, 552), // .section-header
  '',
  ...slice(554, 563), // .section-title
  '',
  ...slice(638, 650), // .data-mgmt-btn
  '',
  ...slice(652, 662), // hover 守卫 + :disabled（整段含 @media 包裹，别只取内层）
  '',
  ...slice(663, 669), // .extension-block
  '',
  ...slice(671, 678), // .extension-block .form-row
  '',
  ...slice(680, 683), // .form-row > span
  '',
  // 原 694-705 是 number/password/select 三选器；新组件只有 number 输入，
  // password/select 在这里永远命中不了 ⇒ 只取 number 那条选择器。
  ".extension-block .form-row input[type='number'] {",
  ...slice(697, 705),
  '',
  ...slice(707, 712), // .extension-block .hint-text
  '',
  ...slice(714, 752), // context-preset 系列 + context-budget + context-error
  '',
  '/* ── 窄屏 ── */',
  '@media (max-width: 640px) {',
  '  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。',
  '     沿用顶层规则的原选择器 —— i7 guard 的「已覆盖」判定要求逐字相同（§7.12 O-2）。 */',
  "  .extension-block .form-row input[type='number'] {",
  '    font-size: 16px;',
  '  }',
  '}',
  '</style>',
];

const newFile = [...newScriptTop, ...newScriptBody, ...newTemplate, ...newStyleParts, ''].join('\n');
if (!newFile.includes('useSettingsStore')) throw new Error('新组件缺少 settings store 引用');
if (newFile.includes('applyContextPreset') === false) throw new Error('新组件缺少 applyContextPreset');

// ── ② 重建宿主 ─────────────────────────────────────────────────────────
// 从后往前删区间（1-based 闭区间），避免行号漂移
let host = A.slice();
function cut(a, b, label) {
  if (a < 1 || b > host.length || a > b) throw new Error(`删除区间越界 ${a}-${b}（${label}）`);
  host.splice(a - 1, b - a + 1);
}

// style 段（先删靠后的）
cut(830, 842, '16px 死块');
cut(714, 753, 'context-preset 段（搬）');
cut(638, 713, 'data-mgmt-btn + extension-block（搬）');
cut(632, 637, 'bg-source-tab 死块');
cut(610, 629, '640 断点死规则');
cut(580, 601, 'active-badge / badge-active 死块');
cut(565, 579, '复合选择器死块');
cut(554, 564, 'section-title（搬）');
cut(546, 553, 'section-header（搬）');

// template 段：上下文段替换为组件标签
cut(278, 337, '上下文长度段（搬）');
host.splice(277, 0, '      <SettingsContextLengthSection />');

// script 段
cut(166, 167, 'settings 声明（搬）');
cut(141, 158, 'input handler（搬）');
cut(84, 110, 'context 工具函数（搬）');
cut(15, 19, 'CONTEXT_PRESETS（搬）');
cut(13, 13, 'useSettingsStore import（搬）');
cut(11, 11, 'showToast import（搬）');

// 注册新组件 import（放在 SettingsModelPanel 之后，保持分组）
const modelImportIdx = host.findIndex((l) => l.includes("import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';"));
if (modelImportIdx < 0) throw new Error('找不到 SettingsModelPanel import 锚点');
host.splice(modelImportIdx + 1, 0, "import SettingsContextLengthSection from '@/components/settings/SettingsContextLengthSection.vue';");

const hostText = host.join('\n') + '\n';

// ── 产物自检 ───────────────────────────────────────────────────────────
function check(cond, msg) {
  if (!cond) throw new Error('产物自检失败: ' + msg);
}
check(!/useSettingsStore/.test(hostText), '宿主不应再有 useSettingsStore');
check(!/showToast/.test(hostText), '宿主不应再有 showToast');
check(!/CONTEXT_PRESETS/.test(hostText), '宿主不应再有 CONTEXT_PRESETS');
check(!/contextLengthError|contextBudget|applyContextPreset|formatTokenCount/.test(hostText), '宿主不应残留上下文段逻辑');
check(!/\.active-badge|\.badge-active|\.theme-card\.active|\.fontsize-card\.active|\.profile-item\.active|\.bg-source-tab\.active/.test(hostText), '宿主不应残留死样式');
check(hostText.includes('<SettingsContextLengthSection />'), '宿主缺少新组件标签');
check(hostText.includes("import SettingsContextLengthSection from '@/components/settings/SettingsContextLengthSection.vue';"), '宿主缺少新组件 import');
check(!/\.context-preset|\.context-budget|\.context-error|\.data-mgmt-btn|\.extension-block/.test(hostText), '宿主不应残留已搬迁样式');
check(hostText.includes('.settings-nav'), '宿主应保留侧栏样式');
check(hostText.includes('.settings-back-from'), '宿主应保留 back-from 样式');
check(newFile.includes('aria-labelledby="context-length-title"'), '新组件缺少 section 头');
check(!/dedent/.test(newFile), '新组件不应残留生成器痕迹');
// O-22：搬家时必须连 @media 包裹层一起取，只取内层会留下无守卫的 :hover（hover-guard 会红）
check(/@media \(hover: hover\) and \(pointer: fine\) \{\n {2}\.data-mgmt-btn:hover:not\(:disabled\) \{/.test(newFile), 'hover 规则丢失了 @media 包裹层');
check(/@media \(max-width: 640px\) \{\n {2}\/\* iOS 聚焦防放大/.test(newFile), '16px 兜底块丢失了 @media 包裹层');
// 新组件内每条 :hover 都必须落在 @media (hover:...) 之内（逐行验缩进即可）
{
  const nl = newFile.split('\n');
  let hoverDepth = 0;
  for (let i = 0; i < nl.length; i++) {
    if (/^@media \(hover:/.test(nl[i])) hoverDepth++;
    if (/:hover/.test(nl[i]) && hoverDepth === 0) {
      throw new Error(`新组件第 ${i + 1} 行的 :hover 不在 @media (hover: ...) 内: ${nl[i].trim()}`);
    }
    if (/^\}/.test(nl[i]) && hoverDepth > 0) hoverDepth--;
  }
}

writeLF(NEW, newFile);
writeLF(HOST, hostText);

const hostLines = hostText.replace(/\n$/, '').split('\n').length;
const newLines = newFile.replace(/\n$/, '').split('\n').length;
console.log(`宿主 ${A.length} → ${hostLines}（${hostLines - A.length}）`);
console.log(`新组件 ${newLines} 行`);
console.log(`合计 ${hostLines + newLines}（原 ${A.length}，${(((hostLines + newLines) / A.length - 1) * 100).toFixed(1)}%）`);
