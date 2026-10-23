<script setup lang="ts">
/**
 * GroupNpcModal — 随机 NPC 生成弹窗（F10.3，R1-1 从 GroupChatView 拆出）
 *
 * 模板选择是本地状态：关掉再打开时保留上次选的那套模板（原实现同理，
 * 因为 selectedNpcTemplate 在视图 setup 里，组件不卸载就不会重置）。
 * 生成请求本身（store 写 + Toast）由父级做，本组件只发 generate 意图。
 */
import { ref } from 'vue';
import { t } from '@/i18n';
import Modal from '@/components/common/Modal.vue';
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@core/character-generator';

defineProps<{
  open: boolean;
  /** 生成中：两个按钮都禁用，主按钮文案换成"生成中" */
  generating: boolean;
  /** 当前群人数（≥7 时提示剩余名额） */
  memberCount: number;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  generate: [templateId: CharacterTemplateId];
}>();

const selectedNpcTemplate = ref<CharacterTemplateId>('fantasy');

function selectNpcTemplate(id: CharacterTemplateId): void {
  selectedNpcTemplate.value = id;
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="t('group.npcTitle')"
    described-by="npc-hint"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="npc-generate-form">
      <p id="npc-hint" class="form-hint">
        {{ t('group.npcHint') }}
      </p>

      <!-- 生成中状态 -->
      <div v-if="generating" class="npc-generating-state" role="status" aria-live="polite">
        <div class="gen-spinner" aria-hidden="true"></div>
        <p>{{ t('group.npcGenerating') }}</p>
      </div>

      <!-- 模板选择 -->
      <div v-else class="npc-template-grid" role="radiogroup" :aria-label="t('group.npcTemplateAria')">
        <button
          v-for="tpl in CHARACTER_TEMPLATES"
          :key="tpl.id"
          type="button"
          role="radio"
          :aria-checked="selectedNpcTemplate === tpl.id"
          class="npc-template-card"
          :class="{ selected: selectedNpcTemplate === tpl.id }"
          @click="selectNpcTemplate(tpl.id)"
        >
          <div class="tpl-label">{{ tpl.label }}</div>
          <div class="tpl-desc">{{ tpl.description }}</div>
        </button>
      </div>

      <!-- 群聊人数提示 -->
      <p v-if="memberCount >= 7" class="npc-warn">
        {{ t('group.npcWarn', { count: memberCount, left: 8 - memberCount }) }}
      </p>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        :disabled="generating"
        @click="emit('update:open', false)"
      >
        {{ t('group.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        :disabled="generating"
        @click="emit('generate', selectedNpcTemplate)"
      >
        {{ generating ? t('group.generatingNpc') : t('group.npcGenerateBtn') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* F10.3 NPC 生成 Modal */
.npc-generate-form {
  padding: 4px 0;
}

.npc-generate-form .form-hint {
  margin: 0 0 16px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.npc-template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.npc-template-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border, #3a3d52);
  border-radius: var(--radius-md, 8px);
  background: var(--card-elevated, #1c1e2a);
  color: var(--foreground, #f5f5f7);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .npc-template-card:hover {
    border-color: var(--accent-orange);
  }
}

.npc-template-card.selected {
  border-color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
}

.npc-template-card .tpl-label {
  font-weight: 600;
  font-size: 14px;
}

.npc-template-card .tpl-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.npc-generating-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
  color: var(--accent-orange-text);
}

.gen-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, var(--accent-orange) 30%, transparent);
  border-top-color: var(--accent-orange);
  border-radius: 50%;
  animation: npc-spin 0.8s linear infinite;
}

@keyframes npc-spin {
  to {
    transform: rotate(360deg);
  }
}

.npc-warn {
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--accent-orange) 10%, transparent);
  border-left: 3px solid var(--accent-orange);
  font-size: 12px;
  color: var(--accent-orange-text);
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .gen-spinner {
    animation-duration: 2s;
  }
}
</style>
