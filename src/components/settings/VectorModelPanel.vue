<script setup lang="ts">
/**
 * 向量检索设置(双通道 RAG)
 * - 开关:默认关闭(localStorage aijiuguan.vectorRagEnabled)
 * - 双通道模型选择(动态/静态;auto=selectVectorModel 自动:browser→bge-small)
 *
 * 装配层：四个功能区各自成组件（各自持有自己的状态与副作用），本文件只留
 * 开关 + 双通道模型选择这两处"跨区共享的输入"，避免再次长成 1023 行。
 *   VectorModelEnhanceSection  RAG 增强（自动择优 + 停用词过滤）
 *   VectorModelInstallSection  本地模型安装（目录选择 + 冒烟验证）
 *   VectorModelUserSection     用户自定义向量模型（zip / 目录 / 预扫描）
 *   VectorModelRemoteSection   线上服务器引用字段
 */
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '@/components/common/Icon.vue';
import {
  isVectorRagEnabled,
  setVectorRagEnabled,
  getRagDynamicModel,
  setRagDynamicModel,
  getRagStaticModel,
  setRagStaticModel,
} from '@/core/dual-channel-runtime';
import { useUserVectorModelStore } from '@/stores/user-vector-model';
import { t } from '@/i18n';
import VectorModelEnhanceSection from './VectorModelEnhanceSection.vue';
import VectorModelInstallSection from './VectorModelInstallSection.vue';
import VectorModelUserSection from './VectorModelUserSection.vue';
import VectorModelRemoteSection from './VectorModelRemoteSection.vue';

const ENABLED = ref(false);
const dynamicModel = ref<string>('auto');
const staticModel = ref<string>('auto');

/** 用户自定义模型也会出现在动态/静态层下拉里，故宿主也订阅 store */
const userStore = useUserVectorModelStore();

const modelOptions = computed(() => {
  const preset: Array<{ value: string; label: string }> = [
    { value: 'auto', label: t('vector.autoLabel') },
    { value: 'bge-small-zh-v1.5-int8-onnx', label: t('vector.modelOptionSmall') },
    { value: 'bge-large-zh-v1.5-int8-onnx', label: t('vector.modelOptionLarge') },
    { value: 'gte-large-zh-int8-onnx', label: t('vector.modelOptionGte') },
    { value: 'bge-large-zh-v1.5', label: t('vector.modelOptionBgeLarge') },
    { value: 'bge-small-zh-v1.5', label: t('vector.modelOptionBgeSmall') },
  ];
  // 追加用户自定义模型(用于 RAG 动态/静态层选择)
  for (const m of userStore.models) {
    preset.push({ value: m.id, label: `${m.name}（${t('userModel.customTag')}）` });
  }
  return preset;
});

onMounted(() => {
  ENABLED.value = isVectorRagEnabled();
  dynamicModel.value = getRagDynamicModel();
  staticModel.value = getRagStaticModel();
});

// 持久化 RAG 模型选择(供对话检索读取)
watch(dynamicModel, (v) => setRagDynamicModel(v));
watch(staticModel, (v) => setRagStaticModel(v));
</script>

<template>
  <section class="settings-section" aria-labelledby="vector-rag-title">
    <header class="section-header">
      <h2 id="vector-rag-title" class="section-title">
        <Icon name="cpu" :size="16" />
        <span>{{ t('vector.title') }}</span>
      </h2>
      <label class="toggle-wrap">
        <span>{{ t('vector.enable') }}</span>
        <input
          type="checkbox"
          :checked="ENABLED"
          :aria-label="t('vector.enableAria')"
          @change="setVectorRagEnabled(($event.target as HTMLInputElement).checked); ENABLED = ($event.target as HTMLInputElement).checked"
        />
      </label>
    </header>
    <p class="section-desc">
      {{ t('vector.desc') }}
    </p>

    <!--
      静态通道的真实前提：chat-generation.ts 把"当前角色是否有生效世界书"当作 staticGate，
      没有世界书时文档向量根本不参与检索。此前这句话只存在于代码里。
    -->
    <p class="section-desc" role="note">
      {{ t('vector.staticNeedsBindingHint') }}
    </p>

    <div class="field-row">
      <div class="field-group">
        <label class="field-label" for="vec-dyn">{{ t('vector.dynamicModel') }}</label>
        <select id="vec-dyn" v-model="dynamicModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="vec-sta">{{ t('vector.staticModel') }}</label>
        <select id="vec-sta" v-model="staticModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
    </div>
    <VectorModelEnhanceSection />
    <VectorModelInstallSection />
    <VectorModelUserSection />
    <VectorModelRemoteSection />
  </section>
</template>

<style scoped>
/* ── 标准 section 容器/标题（对齐设置其他页面，避免 scoped 不穿透导致无样式） ── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}
.section-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted-foreground);
  margin: 0;
}

/* ── 共用皮肤（enhance / install / user-model / remote 四个子面板同用） ──
 * 留宿主单点定义，再用 :deep() 贯穿到子组件内部。各面板各带一份会让
 * control-size 字面量与样式副本一起翻倍（同 R3-3 的 .local-model-view :deep 做法）。 */
.settings-section :deep(.field-label) {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}
.settings-section :deep(.field-input) {
  height: var(--size-control-md);
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}
.settings-section :deep(select.field-input) {
  height: var(--size-control-md);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23AEB2C0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: var(--spacing-2xl);
}
.settings-section :deep(.field-input:focus-visible) {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}
.settings-section :deep(.field-hint) {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}
/* ── 主操作按钮（对齐设置页 add-btn 标准） ── */
.settings-section :deep(.add-btn) {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
@media (hover: hover) and (pointer: fine) {
  .settings-section :deep(.add-btn:hover) {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}
.settings-section :deep(.add-btn:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}
/* ── 布局 ── */
.settings-section :deep(.field-row) {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.settings-section :deep(.field-group) {
  flex: 1;
  min-width: 180px;
}
.settings-section :deep(.toggle-wrap) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.settings-section :deep(.toggle-wrap input[type='checkbox']) {
  width: 16px;
  height: 16px;
  accent-color: var(--secondary);
  cursor: pointer;
}
.settings-section :deep(.box-title) {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}
.settings-section :deep(.mini-btn) {
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary, #222);
  color: var(--foreground);
  cursor: pointer;
}
.settings-section :deep(.mini-btn:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-section :deep(.add-btn.secondary) {
  background: var(--card-elevated);
  border-color: var(--border);
  color: var(--foreground);
}
@media (hover: hover) and (pointer: fine) {
  .settings-section :deep(.add-btn.secondary:hover) {
    background: var(--video-bg);
  }
}
.settings-section :deep(.box-title.sub) {
  margin-top: var(--spacing-sm);
  font-size: 13px;
  color: var(--muted-foreground);
}
.settings-section :deep(.mini-btn.danger) {
  color: var(--destructive);
  border-color: color-mix(in srgb, var(--destructive) 45%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .settings-section :deep(.mini-btn.danger:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--destructive) 12%, transparent);
  }
}
@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .settings-section :deep(.field-input) {
    font-size: 16px;
  }
}
</style>