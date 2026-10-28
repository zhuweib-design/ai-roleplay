<script setup lang="ts">
import { ref } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import SceneConfigModal from '@/components/random-events/SceneConfigModal.vue';
import type { RandomEventSceneConfig } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string): void =>
  emit('notify', type, message);

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
  if (ok) notify('success', data.isEdit ? t('re.sceneUpdated') : t('re.sceneCreated'));
  flushStoreMessages(store, notify);
  sceneModalOpen.value = false;
}

function deleteScene(sceneName: string): void {
  if (confirm(t('re.sceneDeleteConfirm', { name: sceneName }))) {
    const ok = store.deleteSceneConfig(sceneName);
    if (ok) notify('success', t('re.sceneDeleted'));
    flushStoreMessages(store, notify);
  }
}

function toggleScene(sceneName: string, cfg: RandomEventSceneConfig): void {
  store.toggleScene(sceneName, !cfg.enabled);
  flushStoreMessages(store, notify);
}
</script>

<template>
  <div>
    <!-- ── 场景配置 ── -->
    <section
      id="panel-scenes"
      role="tabpanel"
      aria-labelledby="tab-scenes"
      class="panel"
    >
      <div class="panel-toolbar">
        <p class="panel-hint">{{ t('re.scenesHint') }}</p>
        <button type="button" class="btn primary" @click="openCreateScene">
          <Icon name="plus" :size="16" aria-hidden="true" />
          {{ t('re.newScene') }}
        </button>
      </div>

      <ul v-if="store.sceneConfigList.length > 0" class="scene-list" role="list">
        <li v-for="cfg in store.sceneConfigList" :key="cfg.sceneName" class="scene-card" :class="{ disabled: !cfg.enabled }">
          <div class="card-header">
            <div class="card-title">
              <Icon name="map-pin" :size="16" aria-hidden="true" />
              <span class="title-text">{{ cfg.sceneName }}</span>
              <span class="badge" :class="cfg.enabled ? 'on' : 'off'">{{ cfg.enabled ? t('re.sceneOn') : t('re.sceneOff') }}</span>
            </div>
            <div class="card-actions">
              <button type="button" class="icon-btn" :aria-label="cfg.enabled ? t('re.disableAria') : t('re.enableAria')" @click="toggleScene(cfg.sceneName, cfg)">
                <Icon :name="cfg.enabled ? 'eye' : 'eye-off'" :size="16" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn" :aria-label="t('re.editAria')" @click="openEditScene(cfg.sceneName)">
                <Icon name="pencil" :size="16" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn danger" :aria-label="t('re.deleteAria')" @click="deleteScene(cfg.sceneName)">
                <Icon name="trash-2" :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
          <dl class="card-meta">
            <div><dt>{{ t('re.probOverride') }}</dt><dd>{{ cfg.probabilityOverride === null ? t('re.probDefault') : `${cfg.probabilityOverride}%` }}</dd></div>
            <div><dt>{{ t('re.allowCategories') }}</dt><dd>{{ cfg.allowedCategories.length === 0 ? t('re.allCategories') : cfg.allowedCategories.map((c) => getCategoryLabel(store, c)).join('、') }}</dd></div>
            <div><dt>{{ t('re.excludeCategories') }}</dt><dd>{{ cfg.excludedCategories.length === 0 ? t('re.none') : cfg.excludedCategories.map((c) => getCategoryLabel(store, c)).join('、') }}</dd></div>
            <div><dt>{{ t('re.maxSeverity') }}</dt><dd>{{ getSeverityLabel(store, cfg.maxSeverity) }}</dd></div>
          </dl>
        </li>
      </ul>
      <EmptyState
        v-else
        title-key="re.noScenes"
        desc-key="re.noScenesHint"
        icon="map-pin"
      />
    </section>

    <SceneConfigModal
      :open="sceneModalOpen"
      :scene-name="editingSceneName"
      :existing-names="store.sceneConfigList.map((c) => c.sceneName)"
      @close="sceneModalOpen = false"
      @save="onSceneModalSave"
    />
  </div>
</template>
