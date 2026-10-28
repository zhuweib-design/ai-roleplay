<script setup lang="ts">
import { ref } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TemplateEditorModal from '@/components/random-events/TemplateEditorModal.vue';
import type { RandomEventTemplate } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  formatTime,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string): void =>
  emit('notify', type, message);

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
    if (ok) notify('success', t('re.templateUpdated'));
  } else {
    const id = store.createTemplate(data.input);
    if (id) notify('success', t('re.templateCreated'));
  }
  flushStoreMessages(store, notify);
  templateModalOpen.value = false;
}

function deleteTemplate(id: string): void {
  if (confirm(t('re.templateDeleteConfirm'))) {
    const ok = store.deleteTemplate(id);
    if (ok) notify('success', t('re.templateDeleted'));
    flushStoreMessages(store, notify);
  }
}

function toggleTemplate(tpl: RandomEventTemplate): void {
  store.toggleTemplate(tpl.id);
  flushStoreMessages(store, notify);
}

function formatCooldown(ms: number): string {
  if (ms <= 0) return t('re.cooldownNone');
  if (ms < 60_000) return t('re.cooldownSec', { sec: Math.round(ms / 1000) });
  if (ms < 3_600_000) return t('re.cooldownMin', { min: Math.round(ms / 60_000) });
  return t('re.cooldownHour', { hour: (ms / 3_600_000).toFixed(1) });
}
</script>

<template>
  <div>
    <!-- ── 模板管理 ── -->
    <section
      id="panel-templates"
      role="tabpanel"
      aria-labelledby="tab-templates"
      class="panel"
    >
      <div class="panel-toolbar">
        <p class="panel-hint">{{ t('re.templatesHint') }}</p>
        <button type="button" class="btn primary" @click="openCreateTemplate">
          <Icon name="plus" :size="16" aria-hidden="true" />
          {{ t('re.newTemplate') }}
        </button>
      </div>

      <ul v-if="store.templates.length > 0" class="template-list" role="list">
        <li v-for="tpl in store.templates" :key="tpl.id" class="template-card" :class="{ disabled: !tpl.enabled }">
          <div class="card-header">
            <div class="card-title">
              <span class="title-text">{{ tpl.name }}</span>
              <span class="badge category">{{ getCategoryLabel(store, tpl.category) }}</span>
              <span class="badge severity" :data-sev="tpl.severity">{{ getSeverityLabel(store, tpl.severity) }}</span>
              <span v-if="!tpl.enabled" class="badge off">{{ t('re.templateDisabled') }}</span>
            </div>
            <div class="card-actions">
              <button type="button" class="icon-btn" :aria-label="tpl.enabled ? t('re.disableAria') : t('re.enableAria')" @click="toggleTemplate(tpl)">
                <Icon :name="tpl.enabled ? 'eye' : 'eye-off'" :size="16" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn" :aria-label="t('re.editAria')" @click="openEditTemplate(tpl)">
                <Icon name="pencil" :size="16" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn danger" :aria-label="t('re.deleteAria')" @click="deleteTemplate(tpl.id)">
                <Icon name="trash-2" :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p class="card-desc">{{ tpl.description }}</p>
          <dl class="card-meta">
            <div><dt>{{ t('re.probability') }}</dt><dd>{{ tpl.probability }}%</dd></div>
            <div><dt>{{ t('re.weight') }}</dt><dd>{{ tpl.weight }}</dd></div>
            <div><dt>{{ t('re.cooldown') }}</dt><dd>{{ formatCooldown(tpl.cooldownMs) }}</dd></div>
            <div><dt>{{ t('re.triggerCount') }}</dt><dd>{{ tpl.triggerCount }}{{ tpl.maxTriggers > 0 ? ` / ${tpl.maxTriggers}` : '' }}</dd></div>
            <div><dt>{{ t('re.lastTriggered') }}</dt><dd>{{ formatTime(tpl.lastTriggeredAt) }}</dd></div>
          </dl>
        </li>
      </ul>
      <EmptyState
        v-else
        title-key="re.noTemplates"
        desc-key="re.noTemplatesHint"
        icon="star"
      />
    </section>

    <TemplateEditorModal
      :open="templateModalOpen"
      :template="editingTemplate"
      @close="templateModalOpen = false"
      @save="onTemplateModalSave"
    />
  </div>
</template>
