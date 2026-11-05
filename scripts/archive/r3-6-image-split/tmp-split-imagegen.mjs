#!/usr/bin/env node
/**
 * R3-6 一次性拆分生成器：src/views/ImageGeneratorView.vue（1230 行）
 *
 * 产出 5 个文件：
 *   src/views/ImageGeneratorView.vue        宿主：页头 / tab 条 / 详情 Modal / Toast
 *   src/views/ImageGenGeneratePanel.vue     #panel-generate
 *   src/views/ImageGenGalleryPanel.vue      #panel-gallery（含删单图 / 清空两个确认浮层）
 *   src/views/ImageGenSettingsPanel.vue     #panel-settings
 *   src/views/image-gen-format.ts           formatDuration / downloadImage
 *
 * 为什么用生成器而不是手抄：模板三段共 350 行，手抄必错；脚本与新增注释手写。
 *
 * 三条铁律（R4-2 立的，这里继续遵守）：
 *   1. 切片基准读归档副本 scripts/archive/r3-6-image-split/ImageGeneratorView.orig.vue.txt，
 *      绝不读仓库源文件 —— 本脚本会覆写源文件，第二次跑时再读它就切片越界。
 *   2. slice() 越界或切空一律抛错，绝不静默返回空串。
 *   3. 归档的 .vue 必须改名 .orig.vue.txt，否则 ESLint 当 SFC 解析报
 *      "not found by the project service"。
 *
 * 用法：node scripts/archive/r3-6-image-split/tmp-split-imagegen.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const REL = 'scripts/archive/r3-6-image-split/ImageGeneratorView.orig.vue.txt';
const L = readFileSync(resolve(ROOT, REL), 'utf8').split('\n');

/** 切片（1-based，闭区间）；越界或切空一律抛错 */
function slice(a, b) {
  if (a < 1 || b > L.length) throw new Error(`切片 ${a}-${b} 越界（基准仅 ${L.length} 行）`);
  if (b < a) throw new Error(`切片 ${a}-${b} 参数反了`);
  const out = L.slice(a - 1, b).join('\n');
  if (!out.trim()) throw new Error(`切片 ${a}-${b} 为空`);
  return out;
}

/** 多段样式拼接，段间空一行 */
function blocks(ranges) {
  return ranges.map(([a, b]) => slice(a, b)).join('\n\n');
}

/** 模板整段缩进减 4（宿主里 section 在 <main> 内缩进 6，搬到子组件根后应为 2） */
function dedent(text, n = 4) {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((line) => (line.startsWith(pad) ? line.slice(n) : line))
    .join('\n');
}

/**
 * 从子面板根标签上摘掉 `v-show="activeTab === '...'"`。
 *
 * 该指令依赖宿主才有的 activeTab，留在子组件里是未定义变量（vue-tsc 报错）。
 * 显隐改由宿主在组件标签上写 v-show —— 子组件是单根元素，指令会透传到根 <section>。
 */
function stripVShow(text) {
  const out = text
    .split('\n')
    .filter((line) => !/^\s*v-show="activeTab === '[a-z]+'"\s*$/.test(line))
    .join('\n');
  if (/activeTab/.test(out)) throw new Error('stripVShow 之后仍残留 activeTab 引用');
  return out;
}

function write(rel, content) {
  if (!content.trim()) throw new Error(`${rel} 内容为空`);
  writeFileSync(resolve(ROOT, rel), content, 'utf8');
  console.log(`  写出 ${rel}（${content.split('\n').length} 行）`);
}

// ─────────────────────────────────────────────────────────────
// 1. 宿主 ImageGeneratorView.vue
// ─────────────────────────────────────────────────────────────
const hostScript = `<script setup lang="ts">
/**
 * ImageGeneratorView — 图像生成集成 (模块3)
 *
 * 功能：
 * - 提示词输入与参数调整 / 风格预设选择 / 批量生成（生成 tab）
 * - 图像画廊（画廊 tab）
 * - Provider 配置（设置 tab）
 *
 * 无障碍：
 * - 语义化结构 / ARIA 标签 / 键盘可访问
 *
 * R3-6 拆分说明：样式占 540/1230 行，死样式 0 条（机械核对：71 条规则的选择器
 * 里的每个类都出现在模板中），只能真拆。切面现成 —— 模板里三个
 * \`<section v-show="activeTab === ...">\` 各管一个 tab，彼此没有 props 往来。
 *
 * 宿主只留四件「跨 tab 或必须在顶层」的东西：
 *   ① 页头与 tab 条（tab 是切换动作本身）
 *   ② 图像详情 Modal（生成 tab 的预览图与画廊卡片都会打开它）
 *   ③ Toast（三个面板的通知都汇到这里）
 *   ④ 跨面板共用的表单 / 按钮族样式（:deep() 穿透，见样式段注释）
 *
 * 通信一律 emit，不引入共享单例：R4-2 的教训是模块级 ref 会被同页面所有实例
 * 共享（含单测里没 unmount 的旧实例），必须实例级隔离。
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useImageGenerationStore } from '@/stores/image-generation';
import { useReadinessJump } from '@/composables/useReadinessJump';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import type { GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';
import { downloadImage, formatDuration } from './image-gen-format';
import ImageGenGeneratePanel from './ImageGenGeneratePanel.vue';
import ImageGenGalleryPanel from './ImageGenGalleryPanel.vue';
import ImageGenSettingsPanel from './ImageGenSettingsPanel.vue';

const router = useRouter();
const store = useImageGenerationStore();
const { pushWithReturn } = useReadinessJump();

// ── Tab ──
type TabKey = 'generate' | 'gallery' | 'settings';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'generate', label: t('imgGen.tabGenerate') },
  { key: 'gallery', label: t('imgGen.tabGallery') },
  { key: 'settings', label: t('imgGen.tabSettings') },
];
const activeTab = ref<TabKey>('generate');

// ── Toast ──
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  toastMessage.value = message;
  toastType.value = type;
  toastOpen.value = true;
}

// ── 图像详情 Modal（跨 tab：生成 tab 的预览图与画廊卡片共用） ──
const detailOpen = ref(false);
const detailImage = ref<GeneratedImage | null>(null);

function openDetail(image: GeneratedImage) {
  detailImage.value = image;
  detailOpen.value = true;
}

// ── 导航 ──
function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

/**
 * P2-6 UI 修复 + E22：未配置时引导去「模型」类（此前无 \`?cat=\`，
 * 一律落在「外观」，而图像 Profile 在「模型」类里）。
 *
 * 留在宿主：生成 tab 的未配置提示与设置 tab 的「去模型设置」都走这里，
 * 导航策略单点定义，避免两处抄同一串 query。
 */
function goToSettings(): void {
  pushWithReturn({ name: 'settings', query: { cat: 'model' } });
}

// ── 工具 ──
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── 初始化 ──
onMounted(async () => {
  await store.loadGallery();
});
</script>`;

const hostChildren = `      <ImageGenGeneratePanel
        v-show="activeTab === 'generate'"
        @notify="showToast"
        @open-detail="openDetail"
        @go-settings="goToSettings"
      />
      <!-- 画廊 -->
      <ImageGenGalleryPanel
        v-show="activeTab === 'gallery'"
        @notify="showToast"
        @open-detail="openDetail"
      />
      <!-- 设置 -->
      <ImageGenSettingsPanel
        v-show="activeTab === 'settings'"
        @notify="showToast"
        @go-settings="goToSettings"
      />`;

const hostStyle = `<style scoped>
/* R3-6：三个 tab 面板已拆为子组件（ImageGenGenerate/Gallery/SettingsPanel）。
 * 这里只留 ① 页头 / tab 条 / 页面容器 ② 详情 Modal 的样式 ③ 跨面板共用的
 * 表单与按钮族 —— 后者用 \`:deep()\` 穿透到子组件内部。 */

${blocks([
  [692, 698],
  [700, 754],
  [756, 788],
  [790, 795],
])}

/* ── 共用：按钮族 ──
 * 生成 tab 与画廊 tab 都在用 \`.btn\` / \`.btn.primary\` / \`.btn.danger\`。
 * 各面板自带一份会让 primitives-guard 的 \`.btn\` 族计数从 1 涨到 3
 * （未登记文件视为 0 ⇒ 直接失败），故统一留在宿主写成 \`:deep()\`；
 * 该守卫对 \`:deep()\` 副本不计数（见其文件头 R2-4 / R3-3 记录）。
 *
 * 下面两份**故意重复**，不能合并：
 *   · plain \`.btn\` / \`.btn.primary\` 编译成 \`.btn[data-v-x]\` —— 属性直接挂在元素上，
 *     Modal 用 <Teleport to="body"> 传送出去以后照样命中（详情 Modal 的 footer 用它）。
 *   · \`:deep(.btn)\` 编译成 \`[data-v-x] .btn\` —— 依赖"祖先带 scopeId"，
 *     传送后祖先变成 <body>，规则失效。
 * 两者服务不同元素，改一份必须同步另一份。 */
${blocks([[940, 951]])}

${blocks([[953, 957]])}

.image-gen-view :deep(.btn) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
}

.image-gen-view :deep(.btn.primary) {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.image-gen-view :deep(.btn.danger) {
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}

/* ── 共用：表单族 ──
 * 生成 tab（提示词 / 尺寸 / 质量 / 步数 / CFG / 种子 / 批量）、
 * 画廊 tab（风格筛选 \`.form-select.small\`）、设置 tab（type / endpoint / key / model）
 * 三处都在用，各带一份会让同一套控件出现三份可能漂移的定义。 */
.image-gen-view :deep(.form-group) {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.image-gen-view :deep(.form-label) {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.image-gen-view :deep(.form-textarea),
.image-gen-view :deep(.form-input),
.image-gen-view :deep(.form-select) {
  padding: 8px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

/* ── 共用：「去配置 / 从模型接入」按钮 ──
 * 生成 tab 的未配置提示与设置 tab 的 provider-source 各一处，
 * 必须逐字一致（同一动作在两个位置不能是两种外观）。宿主自己不用这个类，
 * 故只留 :deep() 一份（与 .btn 族不同，这里没有 Teleport 场景要照顾）。 */
.image-gen-view :deep(.config-warning-btn) {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--primary);
  /* primary 背景须配 --on-primary（白 / 深金）。原用 --primary-fg（浅品牌色），
     与 --primary 同色系，light 主题下文字与背景同色（1.00:1）完全不可见。 */
  color: var(--on-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .image-gen-view :deep(.config-warning-btn:hover) {
    background: color-mix(in srgb, var(--primary) 88%, var(--foreground));
  }
}

${blocks([[1165, 1199]])}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）
   * i7 守卫按「同文件内、同选择器、源码序在后」判已覆盖，故这四条必须与
   * 上面共用块里的选择器**逐字相同**（含 .image-gen-view :deep(...) 前缀）。
   * .search-input 的基础规则在画廊面板里，故它的 16px 兜底也放在画廊面板。 */
  .image-gen-view :deep(.form-textarea),
  .image-gen-view :deep(.form-input),
  .image-gen-view :deep(.form-select) {
    font-size: 16px;
  }
}
</style>`;

/* 宿主的 </main> 之后只剩详情 Modal 与 Toast —— 删单图 / 清空画廊两个确认浮层
 * 已随画廊面板下移，故 612–688 要跳过 646–682 那一段。 */
const hostTemplate = `<template>
${slice(225, 258)}
${hostChildren}
${slice(612, 645)}

${slice(683, 688)}
</template>`;

write('src/views/ImageGeneratorView.vue', `${hostScript}\n\n${hostTemplate}\n\n${hostStyle}\n`);

// ─────────────────────────────────────────────────────────────
// 2. 生成面板
// ─────────────────────────────────────────────────────────────
const generateScript = `<script setup lang="ts">
/**
 * ImageGenGeneratePanel — 图像生成「生成」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。参数表单与最新结果预览都在这里；
 * 风格预设、参数、生成状态全部来自 image-generation store，本组件不持有页面级状态。
 *
 * 通知走 \`notify\` emit、详情浮层走 \`open-detail\`、导航走 \`go-settings\` ——
 * 这三件的归属都在宿主（Toast / 详情 Modal / 路由策略）。
 */
import { computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import Icon from '@/components/common/Icon.vue';
import { SIZE_DIMENSIONS } from '@/core/image-generation';
import type { ImageQuality, ImageSize, StylePresetId, GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';
import { formatDuration } from './image-gen-format';

const store = useImageGenerationStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'open-detail': [image: GeneratedImage];
  'go-settings': [];
}>();

// ── 尺寸选项 ──
const sizeOptions = computed(() =>
  Object.entries(SIZE_DIMENSIONS).map(([key, val]) => ({
    value: key as ImageSize,
    label: val.label,
  }))
);

// ── 质量选项 ──
const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'draft', label: t('imgGen.qualityDraft') },
  { value: 'standard', label: t('imgGen.qualityStandard') },
  { value: 'high', label: t('imgGen.qualityHigh') },
  { value: 'ultra', label: t('imgGen.qualityUltra') },
];

// ── 操作 ──
async function handleGenerate() {
  if (!store.canGenerate) {
    emit('notify', t('imgGen.needConfig'), 'error');
    return;
  }
  const image = await store.generate();
  if (image) {
    emit('notify', t('imgGen.success'), 'success');
  } else {
    emit('notify', store.lastError ?? t('imgGen.failed'), 'error');
  }
}

async function handleBatchGenerate() {
  if (!store.canGenerate) {
    emit('notify', t('imgGen.needConfig'), 'error');
    return;
  }
  const images = await store.generateBatch();
  emit('notify', t('imgGen.batchDone', { count: images.length }), images.length > 0 ? 'success' : 'error');
}

function openDetail(image: GeneratedImage) {
  emit('open-detail', image);
}

function goToSettings() {
  emit('go-settings');
}
</script>`;

const generateStyle = `<style scoped>
/* 参数表单与预览的私有样式。跨 tab 共用的 .btn 族 / .form-group / .form-label /
 * .form-textarea,.form-input,.form-select / .config-warning-btn 都在宿主，经
 * \`:deep()\` 穿透过来 —— 本文件不重复声明，否则同一套控件会出现多份可漂移的定义。 */

${blocks([
  [805, 833],
  [856, 860],
  [868, 872],
])}

${blocks([
  [892, 895],
  [902, 906],
  [908, 931],
])}

/* 生成按钮 */
${blocks([[934, 938]])}

${blocks([
  [964, 1010],
  [1204, 1219],
])}
</style>`;

const generateTemplate = `<template>
${stripVShow(dedent(slice(260, 446)))}
</template>`;

write(
  'src/views/ImageGenGeneratePanel.vue',
  `${generateScript}\n\n${generateTemplate}\n\n${generateStyle}\n`
);

// ─────────────────────────────────────────────────────────────
// 3. 画廊面板
// ─────────────────────────────────────────────────────────────
const galleryModals = `        <!-- P2-8 删除单图确认 -->
        <Modal
          v-model="deleteModalOpen"
          :title="t('imgGen.deleteConfirmTitle')"
          :aria-label="t('imgGen.deleteConfirmTitle')"
          described-by="img-delete-desc"
        >
          <p id="img-delete-desc">{{ t('imgGen.deleteConfirm') }}</p>
          <template #footer>
            <button type="button" class="modal-btn modal-cancel" @click="deleteTargetId = null">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="modal-btn modal-confirm" @click="confirmDeleteImage">
              {{ t('common.delete') }}
            </button>
          </template>
        </Modal>

        <!-- P2-8 清空画廊确认 -->
        <Modal
          v-model="clearAllOpen"
          :title="t('imgGen.clearConfirmTitle')"
          :aria-label="t('imgGen.clearConfirmTitle')"
          described-by="img-clear-desc"
        >
          <p id="img-clear-desc">{{ t('imgGen.clearConfirm') }}</p>
          <template #footer>
            <button type="button" class="modal-btn modal-cancel" @click="clearAllOpen = false">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="modal-btn modal-confirm" @click="confirmClearGallery">
              {{ t('common.delete') }}
            </button>
          </template>
        </Modal>
      </section>`;

const galleryScript = `<script setup lang="ts">
/**
 * ImageGenGalleryPanel — 图像生成「画廊」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。搜索 / 风格筛选 / 统计 / 网格 / 空态，
 * 外加两个破坏性操作的确认浮层（删单图、清空画廊）—— 这两个浮层只由本 tab 触发，
 * 所以随画廊一起下移，宿主不再持有 deleteTargetId / clearAllOpen。
 *
 * 打开详情仍要走宿主：detailImage / detailOpen 与那个 Modal 是跨 tab 的，
 * 生成 tab 的预览图也会打开同一个浮层。
 */
import { ref, computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import type { GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';
import { downloadImage, formatDuration } from './image-gen-format';

const store = useImageGenerationStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'open-detail': [image: GeneratedImage];
}>();

// ── 画廊搜索 ──
const searchQuery = ref('');
const filterStyle = ref<string>('all');
const filteredGallery = computed(() => {
  let list = store.galleryImages;
  if (filterStyle.value !== 'all') {
    list = list.filter((img) => img.params.style === filterStyle.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (img) =>
        img.params.prompt.toLowerCase().includes(q) ||
        img.provider.toLowerCase().includes(q)
    );
  }
  return list;
});

// P2-8 删除确认(pre-launch 全检): 删单图/清空画廊均为破坏性操作, 先确认后执行
const deleteModalOpen = ref(false);
const deleteTargetId = ref<string | null>(null);
const clearAllOpen = ref(false);

// ── 操作 ──
function openDetail(image: GeneratedImage) {
  emit('open-detail', image);
}

function handleDelete(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

async function confirmDeleteImage() {
  if (!deleteTargetId.value) return;
  await store.deleteFromGallery(deleteTargetId.value);
  deleteTargetId.value = null;
  deleteModalOpen.value = false;
  emit('notify', t('imgGen.deleted'), 'info');
}

function handleClearGallery() {
  clearAllOpen.value = true;
}

async function confirmClearGallery() {
  await store.clearGallery();
  clearAllOpen.value = false;
  emit('notify', t('imgGen.galleryCleared'), 'info');
}
</script>`;

const galleryStyle = `<style scoped>
${blocks([
  [797, 803],
  [897, 900],
  [1012, 1117],
])}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）
   * .search-input 的基础规则（13px）在本文件，故它的 16px 兜底也留在这里 ——
   * i7 守卫按「同文件内、同选择器」判已覆盖，搬到宿主会被算成「未覆盖」。
   * 表单族的那四条兜底在宿主，和它们的基础规则同处一文件。 */
  .search-input {
    font-size: 16px;
  }
}
</style>`;

const galleryTemplate = `<template>
${stripVShow(dedent(`${slice(449, 515)}\n\n${galleryModals}`))}
</template>`;

write(
  'src/views/ImageGenGalleryPanel.vue',
  `${galleryScript}\n\n${galleryTemplate}\n\n${galleryStyle}\n`
);

// ─────────────────────────────────────────────────────────────
// 4. 设置面板
// ─────────────────────────────────────────────────────────────
const settingsScript = `<script setup lang="ts">
/**
 * ImageGenSettingsPanel — 图像生成「设置」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。本页的 Provider 配置（随设置一起持久化），
 * 以及「从设置侧图像/视频 Profile 一键填入」的入口。
 *
 * 主密码未解锁时 Profile 的 apiKey 仍是密文，直接抄过来会得到一个
 * "看起来有值其实不能用"的密钥，因此那种情况只填端点与模型并说明原因。
 */
import { computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import { useSettingsStore } from '@/stores/settings';
import { isEncrypted } from '@core/api-key-crypto';
import type { ProviderType } from '@/core/image-generation';
import { t } from '@/i18n';

const store = useImageGenerationStore();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'go-settings': [];
}>();

// ── Provider 类型选项 ──
const providerTypeOptions: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: t('imgGen.providerOpenai') },
  { value: 'custom', label: t('imgGen.providerCustom') },
];

/** 设置侧「图像/视频」分类的主要 Profile（与设置页同一判定源 getPrimaryModel） */
const imageVideoPrimary = computed(() => settingsStore.getPrimaryModel('image-video'));

/**
 * 一键把设置侧的 Profile 填进本页配置。
 * 主密码未解锁时 Profile 的 apiKey 仍是密文，直接抄过来会得到一个"看起来有值其实不能用"的密钥，
 * 因此这种情况只填端点与模型，并说明原因。
 */
function useImageVideoProfile(): void {
  const p = imageVideoPrimary.value;
  if (!p) return;
  const patch: Partial<typeof store.providerConfig> = {
    endpoint: p.baseUrl,
    model: p.model,
    enabled: true,
  };
  if (p.apiKey && !isEncrypted(p.apiKey)) {
    patch.apiKey = p.apiKey;
  } else {
    emit('notify', t('imgGen.profileKeyLocked'), 'info');
  }
  store.updateProviderConfig(patch);
}

function goToSettings() {
  emit('go-settings');
}
</script>`;

const settingsStyle = `<style scoped>
${blocks([[1119, 1163]])}
</style>`;

const settingsTemplate = `<template>
${stripVShow(dedent(slice(519, 611)))}
</template>`;

write(
  'src/views/ImageGenSettingsPanel.vue',
  `${settingsScript}\n\n${settingsTemplate}\n\n${settingsStyle}\n`
);

// ─────────────────────────────────────────────────────────────
// 5. 共享小工具
// ─────────────────────────────────────────────────────────────
const formatTs = `/**
 * image-gen-format.ts — 图像生成页的纯工具函数（R3-6 拆分时从 View 里提出）
 *
 * 为什么独立成文件而不是各面板各抄一份：
 *   - \`formatDuration\` 被生成 tab（预览区耗时）、画廊 tab（统计均耗时）、
 *     宿主详情 Modal（单图耗时）三处使用，三份实现漂移过一次就是"同一张图
 *     在两个地方显示成 1.2s 和 1200ms"。
 *   - \`downloadImage\` 被画廊 tab 的卡片按钮与宿主详情 Modal 的 footer 共用。
 *
 * 与 R3-3 的 \`local-model-format.ts\` 同一做法：无副作用、不依赖组件实例。
 */

/** 毫秒 → 人类可读耗时（≥1s 用秒保留一位小数，否则用整毫秒） */
export function formatDuration(ms: number): string {
  if (ms >= 1000) return \`\${(ms / 1000).toFixed(1)}s\`;
  return \`\${Math.round(ms)}ms\`;
}

/**
 * 触发浏览器下载（data URL → <a download>）。
 *
 * 不用 save-blob-guard 管的导出通道：这里落盘的是**用户自己生成的图片**，
 * 不是应用数据导出；\`save-blob-guard\` 的基线为 0 指的是「不得另起数据导出实现」，
 * 数据导出必须走统一入口。图片下载是产物落盘，语义不同，故不收敛。
 */
export function downloadImage(image: { data: string; id: string }): void {
  const link = document.createElement('a');
  link.href = image.data;
  link.download = \`\${image.id}.png\`;
  link.click();
}
`;
write('src/views/image-gen-format.ts', formatTs);

console.log('\n完成。');
