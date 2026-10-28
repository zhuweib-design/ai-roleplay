<script setup lang="ts">
/**
 * CharacterGenerateModal — F01.7 随机生成角色 Modal（R3-5 从 CharactersView 拆出）
 *
 * 持有：模板选择 / 生成执行 / 生成中关闭锁。
 * 选择状态由 watch(open=true) 重置（等价原 openGenerateModal 内的 selectedTemplate=null）。
 * hasApiProfile 闸门与页头按钮 disabled 均留宿主（openGenerateModal）。
 */
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import {
  CHARACTER_TEMPLATES,
  type CharacterTemplateId,
} from '@/core/character-generator';
import { t } from '@/i18n';

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string) => emit('notify', type, message);

const router = useRouter();
const characterStore = useCharacterStore();
const selectedTemplate = ref<CharacterTemplateId | null>(null);
const templates = CHARACTER_TEMPLATES;

// 打开时重置选择（原 openGenerateModal 内行为，随 selectedTemplate 下放）
watch(open, (v) => {
  if (v) selectedTemplate.value = null;
});

function selectTemplate(id: CharacterTemplateId) {
  selectedTemplate.value = id;
}

async function handleGenerate() {
  if (!selectedTemplate.value) {
    notify('error', t('characters.generateSelectTemplate'));
    return;
  }
  if (characterStore.isGeneratingCharacter) return;

  const templateId = selectedTemplate.value;
  const id = await characterStore.generateRandomCharacter(templateId);
  if (id) {
    open.value = false;
    // 生成成功后自动跳转到编辑页查看结果
    setTimeout(() => {
      void router.push({ name: 'character-edit', params: { id } });
    }, 300);
  }
  // 失败时 lastError 会通过宿主 watch 显示 toast，保持 Modal 打开允许重试
}

function closeGenerateModal() {
  if (characterStore.isGeneratingCharacter) return; // 生成中不允许关闭
  open.value = false;
}
</script>

<template>
    <Modal
      v-model="open"
      :title="t('characters.generateModalTitle')"
      :aria-label="t('characters.generateModalAria')"
      described-by="char-generate-desc"
    >
      <div class="generate-content">
        <p id="char-generate-desc" class="generate-hint">
          {{ t('characters.generateHint') }}
          <span class="generate-cost">{{ t('characters.generateCost') }}</span>
        </p>

        <div class="template-grid" role="radiogroup" :aria-label="t('characters.templateAria')">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            type="button"
            class="template-card"
            :class="{ active: selectedTemplate === tpl.id }"
            role="radio"
            :aria-checked="selectedTemplate === tpl.id"
            :aria-label="t('characters.templateSelect', { label: tpl.label, description: tpl.description })"
            :disabled="characterStore.isGeneratingCharacter"
            @click="selectTemplate(tpl.id)"
          >
            <span class="template-label">{{ tpl.label }}</span>
            <span class="template-desc">{{ tpl.description }}</span>
          </button>
        </div>

        <!-- 生成中加载提示 -->
        <div
          v-if="characterStore.isGeneratingCharacter"
          class="generate-loading"
          role="status"
          aria-live="polite"
        >
          <Icon name="refresh-cw" :size="20" class="spin-icon" />
          <span>{{ t('characters.generating') }}</span>
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          :disabled="characterStore.isGeneratingCharacter"
          @click="closeGenerateModal"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-generate"
          :disabled="!selectedTemplate || characterStore.isGeneratingCharacter"
          @click="handleGenerate"
        >
          <Icon
            v-if="!characterStore.isGeneratingCharacter"
            name="refresh-cw"
            :size="14"
          />
          <span>{{ characterStore.isGeneratingCharacter ? t('characters.generatingBtn') : t('characters.generateBtn') }}</span>
        </button>
      </template>
    </Modal>
</template>

<style scoped>
.generate-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.generate-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.generate-cost {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--secondary-text);
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .template-card:hover:not(:disabled) {
    border-color: var(--secondary);
    background: var(--card-elevated);
  }
}

.template-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.template-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, var(--video-bg));
}

.template-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.template-label {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.template-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.generate-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  color: var(--secondary-text);
  font-size: 13px;
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
  border-radius: var(--radius-md);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-generate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .modal-generate:hover:not(:disabled) {
    filter: brightness(1.1);
  }
}

.modal-generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .spin-icon {
    animation: none;
  }
}

@media (max-width: 640px) {

  .template-grid {

    grid-template-columns: 1fr;

  }

}

/* O-6：Modal 走 Teleport，scoped 规则到不了被传送的内容；
   但全局 `.modal-btn` 不受 scoped 影响，所以这里不再需要 per-component 的 plain 副本（Q8）。 */
/* 弹窗按钮的盒模型、焦点环、禁用态与过渡统一由 primitives.css 的 `.modal-btn` 提供
   （Q8，2026-10-26）：这里不再复制基类，只保留下面与语义有关的配色变体。 */
@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}
</style>
