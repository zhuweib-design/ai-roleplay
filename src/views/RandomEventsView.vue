<script setup lang="ts">
/**
 * RandomEventsView — 随机事件管理页面 (F17.3, v1.1 新增)
 *
 * 功能：
 * - 全局生成器配置（开关、默认概率、冷却、反馈步长）
 * - 事件模板管理（CRUD、启用/禁用、参数调整）
 * - 场景级配置（每场景开关、概率覆盖、类别过滤、严重度上限）
 * - 生成结果历史与反馈（点赞/点踩，自动调整模板概率）
 * - 统计面板（按类别/严重度/反馈）
 *
 * 无障碍：
 * - 语义化 main/header/section
 * - Tab 使用 role="tablist"/"tab"/"tabpanel"，aria-selected/aria-controls
 * - 表单字段 label 关联
 * - 图标按钮 aria-label
 * - Modal 焦点陷阱（通过 Modal 组件）
 * - Toast role=alert 反馈
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useRandomEventsStore } from '@/stores/random-events';
import { useLorebookStore } from '@/stores/lorebook';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import TemplateEditorModal from '@/components/random-events/TemplateEditorModal.vue';
import SceneConfigModal from '@/components/random-events/SceneConfigModal.vue';
import type {
  RandomEventTemplate,
  RandomEventSceneConfig,
  RandomEventResult,
  RandomEventFeedback,
} from '@core/random-event-generator';

const router = useRouter();
const store = useRandomEventsStore();
const lorebookStore = useLorebookStore();

// ── Tab ──
type TabKey = 'templates' | 'scenes' | 'generator' | 'results';
const activeTab = ref<TabKey>('templates');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'templates', label: '事件模板' },
  { key: 'scenes', label: '场景配置' },
  { key: 'generator', label: '生成器' },
  { key: 'results', label: '结果与统计' },
];

// ── Toast ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: typeof toastType.value, message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastOpen.value = false;
  }, 2500);
}

// ── 监听 store 错误/提示 ──
const storeError = computed(() => store.lastError);
const storeInfo = computed(() => store.lastInfo);

function flushStoreMessages(): void {
  if (storeError.value) {
    showToast('error', storeError.value);
    store.clearLastError();
  } else if (storeInfo.value) {
    showToast('success', storeInfo.value);
    store.clearLastError();
  }
}

// ── 模板编辑 Modal ──
const templateModalOpen = ref(false);
const editingTemplate = ref<RandomEventTemplate | null>(null);

function openCreateTemplate(): void {
  editingTemplate.value = null;
  templateModalOpen.value = true;
}

function openEditTemplate(tpl: RandomEventTemplate): void {
  editingTemplate.value = tpl;
  templateModalOpen.value = true;
}

function onTemplateModalSave(data: {
  id: string | null;
  input: Parameters<typeof store.createTemplate>[0];
}): void {
  if (data.id) {
    const ok = store.updateTemplate(data.id, data.input);
    if (ok) showToast('success', '模板已更新');
  } else {
    const id = store.createTemplate(data.input);
    if (id) showToast('success', '模板已创建');
  }
  flushStoreMessages();
  templateModalOpen.value = false;
}

function deleteTemplate(id: string): void {
  if (confirm('确定删除此模板？此操作不可恢复。')) {
    const ok = store.deleteTemplate(id);
    if (ok) showToast('success', '模板已删除');
    flushStoreMessages();
  }
}

function toggleTemplate(tpl: RandomEventTemplate): void {
  store.toggleTemplate(tpl.id);
  flushStoreMessages();
}

// ── 场景配置 Modal ──
const sceneModalOpen = ref(false);
const editingSceneName = ref<string | null>(null);

function openCreateScene(): void {
  editingSceneName.value = null;
  sceneModalOpen.value = true;
}

function openEditScene(sceneName: string): void {
  editingSceneName.value = sceneName;
  sceneModalOpen.value = true;
}

function onSceneModalSave(data: {
  sceneName: string;
  isEdit: boolean;
  config: Partial<Omit<RandomEventSceneConfig, 'sceneName'>>;
}): void {
  const ok = store.updateSceneConfig(data.sceneName, data.config);
  if (ok) showToast('success', data.isEdit ? '场景配置已更新' : '场景配置已创建');
  flushStoreMessages();
  sceneModalOpen.value = false;
}

function deleteScene(sceneName: string): void {
  if (confirm(`确定删除场景「${sceneName}」的随机事件配置？`)) {
    const ok = store.deleteSceneConfig(sceneName);
    if (ok) showToast('success', '场景配置已删除');
    flushStoreMessages();
  }
}

function toggleScene(sceneName: string, cfg: RandomEventSceneConfig): void {
  store.toggleScene(sceneName, !cfg.enabled);
  flushStoreMessages();
}

// ── 生成器配置 ──
const generatorForm = ref({
  enabled: store.generatorConfig.enabled,
  defaultProbability: store.generatorConfig.defaultProbability,
  maxPerTurn: store.generatorConfig.maxPerTurn,
  globalCooldownMs: store.generatorConfig.globalCooldownMs,
  feedbackAdjustStep: store.generatorConfig.feedbackAdjustStep,
  boundWorldBookId: store.generatorConfig.boundWorldBookId ?? '',
});

function saveGeneratorConfig(): void {
  store.updateGeneratorConfig({
    enabled: generatorForm.value.enabled,
    defaultProbability: generatorForm.value.defaultProbability,
    maxPerTurn: generatorForm.value.maxPerTurn,
    globalCooldownMs: generatorForm.value.globalCooldownMs,
    feedbackAdjustStep: generatorForm.value.feedbackAdjustStep,
    boundWorldBookId: generatorForm.value.boundWorldBookId || null,
  });
  showToast('success', '生成器配置已保存');
  flushStoreMessages();
}

/** 需求8：获取关联世界书名称 */
function getBoundWorldBookName(): string {
  const id = generatorForm.value.boundWorldBookId;
  if (!id) return '';
  return lorebookStore.lorebooks.find((l) => l.id === id)?.name ?? '';
}

function toggleGenerator(): void {
  store.toggleGenerator();
  generatorForm.value.enabled = store.generatorConfig.enabled;
  showToast(
    'success',
    store.generatorConfig.enabled ? '随机事件已启用' : '随机事件已禁用'
  );
}

// ── 结果反馈 ──
function applyFeedback(result: RandomEventResult, feedback: RandomEventFeedback): void {
  const ok = store.applyFeedback(result.id, feedback);
  if (ok) showToast('success', `已记录反馈：${feedback === 'positive' ? '喜欢' : feedback === 'negative' ? '不喜欢' : '中立'}`);
  flushStoreMessages();
}

function clearResults(): void {
  if (confirm('确定清空所有结果历史？统计将一并清空。')) {
    store.clearResults();
    showToast('success', '结果历史已清空');
  }
}

// ── 返回 ──
function goBack(): void {
  router.push({ name: 'chat' });
}

// ── 辅助 ──
function getCategoryLabel(cat: RandomEventTemplate['category']): string {
  return store.CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;
}

function getSeverityLabel(sev: RandomEventTemplate['severity']): string {
  return store.SEVERITY_OPTIONS.find((s) => s.value === sev)?.label ?? sev;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCooldown(ms: number): string {
  if (ms <= 0) return '无冷却';
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分钟`;
  return `${(ms / 3_600_000).toFixed(1)}小时`;
}
</script>

<template>
  <div class="random-events-view">
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn"
          aria-label="返回"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>随机事件</h1>
        <span class="header-tag" :class="{ enabled: store.generatorConfig.enabled }">
          {{ store.generatorConfig.enabled ? '已启用' : '未启用' }}
        </span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="header-btn primary"
          :aria-pressed="store.generatorConfig.enabled"
          @click="toggleGenerator"
        >
          <Icon :name="store.generatorConfig.enabled ? 'stop' : 'play'" :size="16" aria-hidden="true" />
          {{ store.generatorConfig.enabled ? '停用' : '启用' }}
        </button>
      </div>
    </header>

    <nav class="tabs" role="tablist" aria-label="随机事件管理">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :id="`tab-${tab.key}`"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'templates'" class="tab-count">{{ store.templates.length }}</span>
        <span v-if="tab.key === 'scenes'" class="tab-count">{{ store.sceneConfigList.length }}</span>
        <span v-if="tab.key === 'results'" class="tab-count">{{ store.results.length }}</span>
      </button>
    </nav>

    <main class="page-body">
      <!-- ── 模板管理 ── -->
      <section
        v-show="activeTab === 'templates'"
        id="panel-templates"
        role="tabpanel"
        aria-labelledby="tab-templates"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">事件模板用于预定义可重复使用的随机事件类型，支持多维度参数（概率/权重/类别/严重度/冷却）。</p>
          <button type="button" class="btn primary" @click="openCreateTemplate">
            <Icon name="plus" :size="16" aria-hidden="true" />
            新建模板
          </button>
        </div>

        <ul v-if="store.templates.length > 0" class="template-list" role="list">
          <li v-for="tpl in store.templates" :key="tpl.id" class="template-card" :class="{ disabled: !tpl.enabled }">
            <div class="card-header">
              <div class="card-title">
                <span class="title-text">{{ tpl.name }}</span>
                <span class="badge category">{{ getCategoryLabel(tpl.category) }}</span>
                <span class="badge severity" :data-sev="tpl.severity">{{ getSeverityLabel(tpl.severity) }}</span>
                <span v-if="!tpl.enabled" class="badge off">已禁用</span>
              </div>
              <div class="card-actions">
                <button type="button" class="icon-btn" :aria-label="tpl.enabled ? '禁用' : '启用'" @click="toggleTemplate(tpl)">
                  <Icon :name="tpl.enabled ? 'eye' : 'eye-off'" :size="16" aria-hidden="true" />
                </button>
                <button type="button" class="icon-btn" aria-label="编辑" @click="openEditTemplate(tpl)">
                  <Icon name="pencil" :size="16" aria-hidden="true" />
                </button>
                <button type="button" class="icon-btn danger" aria-label="删除" @click="deleteTemplate(tpl.id)">
                  <Icon name="trash-2" :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p class="card-desc">{{ tpl.description }}</p>
            <dl class="card-meta">
              <div><dt>概率</dt><dd>{{ tpl.probability }}%</dd></div>
              <div><dt>权重</dt><dd>{{ tpl.weight }}</dd></div>
              <div><dt>冷却</dt><dd>{{ formatCooldown(tpl.cooldownMs) }}</dd></div>
              <div><dt>触发次数</dt><dd>{{ tpl.triggerCount }}{{ tpl.maxTriggers > 0 ? ` / ${tpl.maxTriggers}` : '' }}</dd></div>
              <div><dt>最后触发</dt><dd>{{ formatTime(tpl.lastTriggeredAt) }}</dd></div>
            </dl>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="star" :size="48" aria-hidden="true" />
          <p>暂无事件模板</p>
          <p class="empty-hint">点击「新建模板」创建第一个事件模板</p>
        </div>
      </section>

      <!-- ── 场景配置 ── -->
      <section
        v-show="activeTab === 'scenes'"
        id="panel-scenes"
        role="tabpanel"
        aria-labelledby="tab-scenes"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">为每个场景独立配置随机事件开关与参数覆盖（概率/类别/严重度上限）。</p>
          <button type="button" class="btn primary" @click="openCreateScene">
            <Icon name="plus" :size="16" aria-hidden="true" />
            新建场景配置
          </button>
        </div>

        <ul v-if="store.sceneConfigList.length > 0" class="scene-list" role="list">
          <li v-for="cfg in store.sceneConfigList" :key="cfg.sceneName" class="scene-card" :class="{ disabled: !cfg.enabled }">
            <div class="card-header">
              <div class="card-title">
                <Icon name="map-pin" :size="16" aria-hidden="true" />
                <span class="title-text">{{ cfg.sceneName }}</span>
                <span class="badge" :class="cfg.enabled ? 'on' : 'off'">{{ cfg.enabled ? '启用' : '禁用' }}</span>
              </div>
              <div class="card-actions">
                <button type="button" class="icon-btn" :aria-label="cfg.enabled ? '禁用' : '启用'" @click="toggleScene(cfg.sceneName, cfg)">
                  <Icon :name="cfg.enabled ? 'eye' : 'eye-off'" :size="16" aria-hidden="true" />
                </button>
                <button type="button" class="icon-btn" aria-label="编辑" @click="openEditScene(cfg.sceneName)">
                  <Icon name="pencil" :size="16" aria-hidden="true" />
                </button>
                <button type="button" class="icon-btn danger" aria-label="删除" @click="deleteScene(cfg.sceneName)">
                  <Icon name="trash-2" :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>
            <dl class="card-meta">
              <div><dt>概率覆盖</dt><dd>{{ cfg.probabilityOverride === null ? '使用全局默认' : `${cfg.probabilityOverride}%` }}</dd></div>
              <div><dt>允许类别</dt><dd>{{ cfg.allowedCategories.length === 0 ? '全部' : cfg.allowedCategories.map(getCategoryLabel).join('、') }}</dd></div>
              <div><dt>排除类别</dt><dd>{{ cfg.excludedCategories.length === 0 ? '无' : cfg.excludedCategories.map(getCategoryLabel).join('、') }}</dd></div>
              <div><dt>严重度上限</dt><dd>{{ getSeverityLabel(cfg.maxSeverity) }}</dd></div>
            </dl>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="map-pin" :size="48" aria-hidden="true" />
          <p>暂无场景配置</p>
          <p class="empty-hint">未配置的场景将使用全局默认参数</p>
        </div>
      </section>

      <!-- ── 生成器配置 ── -->
      <section
        v-show="activeTab === 'generator'"
        id="panel-generator"
        role="tabpanel"
        aria-labelledby="tab-generator"
        class="panel"
      >
        <div class="form-section">
          <h2 class="section-title">生成器全局配置</h2>
          <p class="section-hint">配置随机事件生成器的全局行为。未配置模板时将使用默认参数。</p>

          <div class="form-grid">
            <div class="form-row">
              <label for="gen-enabled">
                <input
                  id="gen-enabled"
                  v-model="generatorForm.enabled"
                  type="checkbox"
                />
                <span>启用随机事件生成器</span>
              </label>
            </div>

            <div class="form-row">
              <label for="gen-prob">默认触发概率（%）</label>
              <input
                id="gen-prob"
                v-model.number="generatorForm.defaultProbability"
                type="number"
                min="0"
                max="100"
                step="1"
              />
              <small class="form-hint">0-100，无模板匹配时使用此概率决定是否触发纯 AI 即时生成。</small>
            </div>

            <div class="form-row">
              <label for="gen-maxperturn">每轮最大生成数</label>
              <input
                id="gen-maxperturn"
                v-model.number="generatorForm.maxPerTurn"
                type="number"
                min="1"
                max="5"
                step="1"
              />
              <small class="form-hint">避免单轮生成过多事件。</small>
            </div>

            <div class="form-row">
              <label for="gen-cooldown">全局冷却时间（毫秒）</label>
              <input
                id="gen-cooldown"
                v-model.number="generatorForm.globalCooldownMs"
                type="number"
                min="0"
                step="1000"
              />
              <small class="form-hint">两次生成之间的最小间隔（如 300000 = 5 分钟）。</small>
            </div>

            <div class="form-row">
              <label for="gen-step">反馈调整步长（%）</label>
              <input
                id="gen-step"
                v-model.number="generatorForm.feedbackAdjustStep"
                type="number"
                min="1"
                max="20"
                step="1"
              />
              <small class="form-hint">每次点赞/点踩后模板概率调整幅度。</small>
            </div>

            <!-- 需求8：关联世界书 -->
            <div class="form-row">
              <label for="gen-worldbook">
                <Icon name="book-open" :size="14" aria-hidden="true" />
                关联世界书
              </label>
              <select
                id="gen-worldbook"
                v-model="generatorForm.boundWorldBookId"
              >
                <option value="">不关联（使用默认生成逻辑）</option>
                <option
                  v-for="lb in lorebookStore.lorebooks"
                  :key="lb.id"
                  :value="lb.id"
                >
                  {{ lb.name }}（{{ lb.entries.length }} 条）
                </option>
              </select>
              <small class="form-hint">
                关联后，随机事件将基于该世界书的场景与世界观内容进行逻辑联动生成
              </small>
              <small v-if="generatorForm.boundWorldBookId" class="form-hint success-hint">
                当前已关联：{{ getBoundWorldBookName() }}
              </small>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn primary" @click="saveGeneratorConfig">
              <Icon name="save" :size="16" aria-hidden="true" />
              保存配置
            </button>
          </div>
        </div>
      </section>

      <!-- ── 结果与统计 ── -->
      <section
        v-show="activeTab === 'results'"
        id="panel-results"
        role="tabpanel"
        aria-labelledby="tab-results"
        class="panel"
      >
        <!-- 统计卡片 -->
        <div class="stats-grid" v-if="store.stats.totalGenerated > 0">
          <div class="stat-card">
            <div class="stat-value">{{ store.stats.totalGenerated }}</div>
            <div class="stat-label">总生成次数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ store.stats.averageProbability }}%</div>
            <div class="stat-label">平均概率</div>
          </div>
          <div class="stat-card positive">
            <div class="stat-value">{{ store.stats.byFeedback.positive }}</div>
            <div class="stat-label">喜欢</div>
          </div>
          <div class="stat-card neutral">
            <div class="stat-value">{{ store.stats.byFeedback.neutral }}</div>
            <div class="stat-label">中立</div>
          </div>
          <div class="stat-card negative">
            <div class="stat-value">{{ store.stats.byFeedback.negative }}</div>
            <div class="stat-label">不喜欢</div>
          </div>
        </div>

        <!-- 类别分布 -->
        <div class="stats-section" v-if="store.stats.totalGenerated > 0">
          <h3 class="subsection-title">按类别分布</h3>
          <div class="dist-bars">
            <div v-for="cat in store.CATEGORY_OPTIONS" :key="cat.value" class="dist-row">
              <span class="dist-label">{{ cat.label }}</span>
              <div class="dist-bar">
                <div
                  class="dist-fill"
                  :style="{ width: `${store.stats.totalGenerated > 0 ? (store.stats.byCategory[cat.value] / store.stats.totalGenerated) * 100 : 0}%` }"
                ></div>
              </div>
              <span class="dist-count">{{ store.stats.byCategory[cat.value] }}</span>
            </div>
          </div>
        </div>

        <!-- 结果列表 -->
        <div class="panel-toolbar">
          <p class="panel-hint">生成结果历史记录与用户反馈。点赞/点踩会自动调整模板概率。</p>
          <button type="button" v-if="store.results.length > 0" class="btn danger-outline" @click="clearResults">
            <Icon name="trash-2" :size="16" aria-hidden="true" />
            清空历史
          </button>
        </div>

        <ul v-if="store.results.length > 0" class="result-list" role="list">
          <li v-for="r in [...store.results].reverse()" :key="r.id" class="result-card">
            <div class="result-header">
              <span class="result-name">{{ r.eventName }}</span>
              <span class="badge category">{{ getCategoryLabel(r.category) }}</span>
              <span class="badge severity" :data-sev="r.severity">{{ getSeverityLabel(r.severity) }}</span>
              <span class="result-time">{{ formatTime(r.generatedAt) }}</span>
            </div>
            <p class="result-desc">{{ r.eventDescription }}</p>
            <div class="result-meta">
              <span>模板：{{ r.templateName }}</span>
              <span>场景：{{ r.sceneName }}</span>
              <span>概率：{{ r.effectiveProbability }}%</span>
            </div>
            <div class="result-feedback">
              <button
                type="button"
                class="feedback-btn"
                :class="{ active: r.feedback === 'positive' }"
                :aria-pressed="r.feedback === 'positive'"
                aria-label="喜欢"
                @click="applyFeedback(r, 'positive')"
              >
                <Icon name="heart" :size="16" aria-hidden="true" />
                喜欢
              </button>
              <button
                type="button"
                class="feedback-btn"
                :class="{ active: r.feedback === 'neutral' }"
                :aria-pressed="r.feedback === 'neutral'"
                aria-label="中立"
                @click="applyFeedback(r, 'neutral')"
              >
                <Icon name="star" :size="16" aria-hidden="true" />
                中立
              </button>
              <button
                type="button"
                class="feedback-btn"
                :class="{ active: r.feedback === 'negative' }"
                :aria-pressed="r.feedback === 'negative'"
                aria-label="不喜欢"
                @click="applyFeedback(r, 'negative')"
              >
                <Icon name="close" :size="16" aria-hidden="true" />
                不喜欢
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="star" :size="48" aria-hidden="true" />
          <p>暂无生成记录</p>
          <p class="empty-hint">启用生成器后，每轮对话结束将自动判定是否触发随机事件</p>
        </div>
      </section>
    </main>

    <TemplateEditorModal
      :open="templateModalOpen"
      :template="editingTemplate"
      @close="templateModalOpen = false"
      @save="onTemplateModalSave"
    />

    <SceneConfigModal
      :open="sceneModalOpen"
      :scene-name="editingSceneName"
      :existing-names="store.sceneConfigList.map((c) => c.sceneName)"
      @close="sceneModalOpen = false"
      @save="onSceneModalSave"
    />

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.random-events-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
}

.header-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-tag.enabled {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.header-btn:hover {
  background: var(--card-elevated);
}

.header-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.header-btn.primary:hover {
  filter: brightness(1.1);
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
  padding: 0 20px;
}

.tab {
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover {
  color: var(--foreground);
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  align-items: center;
  justify-content: center;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  border-radius: 9px;
}

.tab.active .tab-count {
  background: var(--primary);
  color: var(--on-primary);
}

/* Body */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel {
  max-width: 960px;
  margin: 0 auto;
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.panel-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn:hover {
  background: var(--card-elevated);
}

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn.primary:hover {
  filter: brightness(1.1);
}

.btn.danger-outline {
  color: var(--danger-fg);
  border-color: var(--danger-border);
}

.btn.danger-outline:hover {
  background: var(--danger-bg);
}

/* 模板列表 */
.template-list,
.scene-list,
.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-card,
.scene-card,
.result-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.template-card:hover,
.scene-card:hover {
  border-color: var(--primary-fg, var(--primary));
}

.template-card.disabled,
.scene-card.disabled {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.badge.category {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.badge.severity {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.badge.severity[data-sev='major'] {
  background: rgba(249, 115, 22, 0.15);
  color: #fb923c;
}

.badge.severity[data-sev='critical'] {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.badge.on {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.badge.off {
  background: rgba(107, 114, 128, 0.15);
  color: #9ca3af;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.icon-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground);
}

.icon-btn.danger:hover {
  color: var(--danger-fg);
  background: var(--danger-bg);
}

.card-desc {
  margin: 0 0 10px 0;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.5;
}

.card-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px 12px;
  margin: 0;
}

.card-meta > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-meta dt {
  font-size: 11px;
  color: var(--muted-foreground);
}

.card-meta dd {
  margin: 0;
  font-size: 13px;
  color: var(--foreground);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted-foreground);
  text-align: center;
}

.empty-state p {
  margin: 8px 0 0 0;
  font-size: 14px;
}

.empty-hint {
  font-size: 12px !important;
  color: var(--muted-foreground);
  opacity: 0.7;
}

/* 生成器配置表单 */
.form-section {
  max-width: 720px;
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: var(--foreground);
}

.section-hint {
  margin: 0 0 16px 0;
  color: var(--muted-foreground);
  font-size: 13px;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  font-size: 13px;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-row input[type='number'] {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  width: 200px;
}

.form-row input[type='checkbox'] {
  margin: 0;
}

.form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

/* 需求8：关联世界书成功提示 */
.form-hint.success-hint {
  color: var(--success-fg, #6ee7b7);
  font-weight: 500;
}

.form-actions {
  margin-top: 20px;
  display: flex;
  gap: 8px;
}

/* 统计 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
}

.stat-label {
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
}

.stat-card.positive .stat-value {
  color: #22c55e;
}

.stat-card.negative .stat-value {
  color: #ef4444;
}

.stat-card.neutral .stat-value {
  color: var(--muted-foreground);
}

.stats-section {
  margin-bottom: 24px;
}

.subsection-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--foreground);
}

.dist-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dist-row {
  display: grid;
  grid-template-columns: 120px 1fr 40px;
  gap: 8px;
  align-items: center;
}

.dist-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.dist-bar {
  height: 8px;
  background: var(--card-elevated);
  border-radius: 4px;
  overflow: hidden;
}

.dist-fill {
  height: 100%;
  background: var(--primary-fg, var(--primary));
  transition: width 0.3s;
}

.dist-count {
  font-size: 12px;
  color: var(--foreground);
  text-align: right;
}

/* 结果卡片 */
.result-card {
  margin-bottom: 0;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.result-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted-foreground);
}

.result-desc {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--foreground);
  line-height: 1.5;
}

.result-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--muted-foreground);
  margin-bottom: 8px;
}

.result-feedback {
  display: flex;
  gap: 8px;
}

.feedback-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.feedback-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground);
}

.feedback-btn.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

/* 响应式 */
@media (max-width: 767px) {
  .page-header {
    padding: 10px 14px;
  }

  .tabs {
    padding: 0 8px;
    overflow-x: auto;
  }

  .tab {
    padding: 10px 12px;
    font-size: 12px;
    white-space: nowrap;
  }

  .page-body {
    padding: 14px;
  }

  .card-meta {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
