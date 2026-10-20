<script setup lang="ts">
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
 * `<section v-show="activeTab === ...">` 各管一个 tab，彼此没有 props 往来。
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
 * P2-6 UI 修复 + E22：未配置时引导去「模型」类（此前无 `?cat=`，
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
</script>

<template>
  <div class="image-gen-view">
    <header class="page-header">
      <div class="header-title">
        <button type="button" class="header-btn" :aria-label="t('imgGen.backAria')" @click="goBack">
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>{{ t('imgGen.title') }}</h1>
        <span class="header-tag" :class="{ enabled: store.providerConfig.enabled }">
          {{ store.providerConfig.enabled ? t('imgGen.configured') : t('imgGen.notConfigured') }}
        </span>
      </div>
      <!-- E23：产物只进画廊，不会进对话——这条边界原先无处可查，用户生成完回聊天页找 -->
      <p class="header-note">{{ t('imgGen.galleryOnly') }}</p>
    </header>

    <nav class="tabs" role="tablist" :aria-label="t('imgGen.tabsAria')">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'gallery'" class="tab-count">{{ store.galleryStats.count }}</span>
      </button>
    </nav>

    <main class="page-body">
      <ImageGenGeneratePanel
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
      />
    </main>

    <!-- 图像详情 Modal -->
    <Modal :model-value="detailOpen" :title="t('imgGen.detailTitle')" @update:model-value="detailOpen = $event">
      <div v-if="detailImage" class="detail-content">
        <img :src="detailImage.data" :alt="detailImage.params.prompt" :width="detailImage.width" :height="detailImage.height" class="detail-img" />
        <dl class="detail-meta">
          <div><dt>{{ t('imgGen.detailPrompt') }}</dt><dd>{{ detailImage.params.prompt }}</dd></div>
          <div v-if="detailImage.params.negativePrompt">
            <dt>{{ t('imgGen.detailNegative') }}</dt><dd>{{ detailImage.params.negativePrompt }}</dd>
          </div>
          <div><dt>{{ t('imgGen.detailSize') }}</dt><dd>{{ detailImage.width }}×{{ detailImage.height }}</dd></div>
          <div><dt>{{ t('imgGen.detailStyle') }}</dt><dd>{{ detailImage.params.style }}</dd></div>
          <div><dt>{{ t('imgGen.detailProvider') }}</dt><dd>{{ detailImage.provider }}</dd></div>
          <div><dt>{{ t('imgGen.detailDuration') }}</dt><dd>{{ formatDuration(detailImage.durationMs) }}</dd></div>
          <div><dt>{{ t('imgGen.detailTime') }}</dt><dd>{{ formatTime(detailImage.createdAt) }}</dd></div>
          <div v-if="detailImage.params.seed >= 0">
            <dt>{{ t('imgGen.detailSeed') }}</dt><dd>{{ detailImage.params.seed }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <button type="button" class="btn" @click="detailOpen = false">{{ t('imgGen.closeBtn') }}</button>
        <button
          v-if="detailImage"
          type="button"
          class="btn primary"
          @click="downloadImage(detailImage)"
        >
          <Icon name="download" :size="14" aria-hidden="true" />
          {{ t('imgGen.downloadBtn') }}
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
/* R3-6：三个 tab 面板已拆为子组件（ImageGenGenerate/Gallery/SettingsPanel）。
 * 这里只留 ① 页头 / tab 条 / 页面容器 ② 详情 Modal 的样式 ③ 跨面板共用的
 * 表单与按钮族 —— 后者用 `:deep()` 穿透到子组件内部。 */

.image-gen-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
  color: var(--foreground);
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.header-note {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.header-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-tag.enabled {
  background: color-mix(in srgb, var(--success) 20%, transparent);
  color: var(--success-fg);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-count {
  font-size: 11px;
  background: var(--card-elevated);
  padding: 0 6px;
  border-radius: 999px;
  color: var(--muted-foreground);
}

/* Panel */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* ── 共用：按钮族 ──
 * 生成 tab 与画廊 tab 都在用 `.btn` / `.btn.primary` / `.btn.danger`。
 * 各面板自带一份会让 primitives-guard 的 `.btn` 族计数从 1 涨到 3
 * （未登记文件视为 0 ⇒ 直接失败），故统一留在宿主写成 `:deep()`；
 * 该守卫对 `:deep()` 副本不计数（见其文件头 R2-4 / R3-3 记录）。
 *
 * 下面两份**故意重复**，不能合并：
 *   · plain `.btn` / `.btn.primary` 编译成 `.btn[data-v-x]` —— 属性直接挂在元素上，
 *     Modal 用 <Teleport to="body"> 传送出去以后照样命中（详情 Modal 的 footer 用它）。
 *   · `:deep(.btn)` 编译成 `[data-v-x] .btn` —— 依赖"祖先带 scopeId"，
 *     传送后祖先变成 <body>，规则失效。
 * 两者服务不同元素，改一份必须同步另一份。 */
.btn {
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

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

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
 * 画廊 tab（风格筛选 `.form-select.small`）、设置 tab（type / endpoint / key / model）
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

/* 图像详情 */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-img {
  width: 100%;
  max-height: 50vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.detail-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  margin: 0;
}

.detail-meta div {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
}

.detail-meta dt {
  color: var(--muted-foreground);
}

.detail-meta dd {
  margin: 0;
}

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
</style>
