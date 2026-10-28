<script setup lang="ts">
/**
 * LorebookWorldSections — 整体世界描述 + 世界内用户资料（F06.7）
 *
 * R1-3 从 WorldBookView（原 3115 行）拆出。两块折叠区共享同一套"draft + 立即保存"
 * 模式，放在一起是因为它们的展开记忆都按**书 id** 分桶（M8-b）：在 A 书点开的状态
 * 不能跟着到 B 书。
 *
 * `commit*` 是**每次输入即写库**（不是失焦才写）—— 原实现如此，照搬。
 */
import { ref, computed, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Collapse from '@/components/common/Collapse.vue';
import { useSectionMemory } from '@/composables/useSectionMemory';
import { useLorebookStore } from '@/stores/lorebook';
import { MAX_WORLD_DESCRIPTION_LENGTH } from '@/core/lorebook';
import type { WorldDescription, WorldUserProfile, WorldType } from '@/core/lorebook';
import { t } from '@/i18n';

const store = useLorebookStore();
const currentLorebook = computed(() => store.currentLorebook);

const worldDescDraft = ref<WorldDescription | null>(null);
const worldUserProfileDraft = ref<WorldUserProfile | null>(null);

// M8-b：这两段描述的是"这一本书"，key 必须带上书 id——否则在 A 书点开的状态会
// 跟着到 B 书，而"还没填就自动展开"这条规则也会被上一本书的随手一点顶掉。
const worldDescOpen = useSectionMemory(
  () => `wb.worldDesc:${currentLorebook.value?.id ?? ''}`,
  () => !worldDescDraft.value
);
const userProfileOpen = useSectionMemory(
  () => `wb.userProfile:${currentLorebook.value?.id ?? ''}`,
  () => !worldUserProfileDraft.value
);

const worldTypeOptions: { value: WorldType; label: string }[] = [
  { value: 'fantasy', label: t('wb.worldTypeFantasy') },
  { value: 'scifi', label: t('wb.worldTypeScifi') },
  { value: 'modern', label: t('wb.worldTypeModern') },
  { value: 'historical', label: t('wb.worldTypeHistorical') },
  { value: 'other', label: t('wb.worldTypeOther') },
];

const worldDescContentLength = computed(
  () => worldDescDraft.value?.content.length ?? 0
);

// 当选中 Lorebook 变化时同步 worldDescription 到 draft
watch(
  () => currentLorebook.value?.id,
  () => {
    const wd = currentLorebook.value?.worldDescription;
    worldDescDraft.value = wd
      ? { ...wd, keys: [...wd.keys] }
      : null;
    const profile = currentLorebook.value?.userProfile;
    worldUserProfileDraft.value = profile
      ? { ...profile }
      : null;
  },
  { immediate: true }
);

function addWorldUserProfile() {
  worldUserProfileDraft.value = {
    name: '',
    description: '',
    gender: '',
    pronouns: '',
    age: '',
    occupation: '',
    appearance: '',
    background: '',
    notes: '',
  };
  if (currentLorebook.value) {
    store.updateWorldUserProfile(currentLorebook.value.id, worldUserProfileDraft.value);
  }
}

function clearWorldUserProfile() {
  if (!currentLorebook.value) return;
  worldUserProfileDraft.value = null;
  store.updateWorldUserProfile(currentLorebook.value.id, null);
}

function commitWorldUserProfile() {
  if (!currentLorebook.value || !worldUserProfileDraft.value) return;
  store.updateWorldUserProfile(currentLorebook.value.id, worldUserProfileDraft.value);
}

function onWorldUserProfileInput(field: keyof WorldUserProfile, e: Event) {
  if (!worldUserProfileDraft.value) return;
  const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  (worldUserProfileDraft.value as unknown as Record<string, string | undefined>)[field] = value;
  commitWorldUserProfile();
}

function addWorldDesc() {
  worldDescDraft.value = {
    name: '',
    type: 'fantasy',
    keys: [],
    content: '',
  };
  // 立即保存（建立空对象）
  if (currentLorebook.value) {
    store.updateWorldDescription(currentLorebook.value.id, worldDescDraft.value);
  }
}

function clearWorldDesc() {
  if (!currentLorebook.value) return;
  worldDescDraft.value = null;
  store.updateWorldDescription(currentLorebook.value.id, null);
}

function commitWorldDesc() {
  if (!currentLorebook.value || !worldDescDraft.value) return;
  store.updateWorldDescription(currentLorebook.value.id, worldDescDraft.value);
}

function onWorldNameInput(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.name = (e.target as HTMLInputElement).value;
  commitWorldDesc();
}

function onWorldTypeChange(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.type = (e.target as HTMLSelectElement).value as WorldType;
  commitWorldDesc();
}

function onWorldKeysInput(e: Event) {
  if (!worldDescDraft.value) return;
  const raw = (e.target as HTMLInputElement).value;
  worldDescDraft.value.keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  commitWorldDesc();
}

function onWorldContentInput(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.content = (e.target as HTMLTextAreaElement).value;
  commitWorldDesc();
}

function worldKeysToString(keys: string[]): string {
  return keys.join(', ');
}
</script>

<template>
  <template v-if="currentLorebook">
    <!-- F06.7 整体世界描述 -->
    <!-- 一次性配置：用户点过就听他的；没点过时"没填的那段自动展开"（M7-d 接上记忆） -->
    <Collapse
      v-model:open="worldDescOpen"
      class="world-desc-section"
      title-key="wb.worldDescTitle"
      hint-key="wb.worldDescCollapseHint"
      icon="globe"
      :level="2"
    >
      <template #title-extra>
        <span class="world-desc-tag">{{ t('wb.worldDescTag') }}</span>
      </template>

      <div v-if="!worldDescDraft" class="world-desc-empty">
        <p>{{ t('wb.worldDescEmpty') }}</p>
        <button
          type="button"
          class="action-btn add-world-btn"
          @click="addWorldDesc"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('wb.addWorldDesc') }}</span>
        </button>
      </div>

      <div v-else class="world-desc-form">
        <div class="world-desc-row">
          <div class="world-desc-cell">
            <label class="form-label" :for="`wd-name-${currentLorebook.id}`">
              {{ t('wb.worldName') }}
            </label>
            <input
              :id="`wd-name-${currentLorebook.id}`"
              type="text"
              class="form-input"
              :value="worldDescDraft.name"
              @input="onWorldNameInput"
              :placeholder="t('wb.worldNamePlaceholder')"
              :maxlength="100"
            />
          </div>
          <div class="world-desc-cell">
            <label class="form-label" :for="`wd-type-${currentLorebook.id}`">
              {{ t('wb.worldType') }}
            </label>
            <select
              :id="`wd-type-${currentLorebook.id}`"
              class="form-select"
              :value="worldDescDraft.type"
              @change="onWorldTypeChange"
            >
              <option
                v-for="opt in worldTypeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="world-desc-row">
          <label class="form-label" :for="`wd-keys-${currentLorebook.id}`">
            {{ t('wb.worldKeys') }}
          </label>
          <input
            :id="`wd-keys-${currentLorebook.id}`"
            type="text"
            class="form-input"
            :value="worldKeysToString(worldDescDraft.keys)"
            @input="onWorldKeysInput"
            :placeholder="t('wb.worldKeysPlaceholder')"
          />
        </div>

        <div class="world-desc-row">
          <label class="form-label" :for="`wd-content-${currentLorebook.id}`">
            {{ t('wb.worldContent') }}
          </label>
          <textarea
            :id="`wd-content-${currentLorebook.id}`"
            class="form-textarea world-desc-content"
            :value="worldDescDraft.content"
            @input="onWorldContentInput"
            :placeholder="t('wb.worldContentPlaceholder')"
            rows="5"
          />
          <span class="char-count">
            {{ worldDescContentLength }} / {{ MAX_WORLD_DESCRIPTION_LENGTH }}
          </span>
        </div>

        <div class="world-desc-actions">
          <button
            type="button"
            class="action-btn delete"
            @click="clearWorldDesc"
          >
            <Icon name="trash-2" :size="14" />
            <span>{{ t('wb.clearWorldDesc') }}</span>
          </button>
        </div>
      </div>
    </Collapse>

    <!-- 世界内用户资料：与真实账户分离，每本世界书独立保存 -->
    <Collapse
      v-model:open="userProfileOpen"
      class="world-user-profile-section"
      title-key="wb.worldUserProfileTitle"
      hint-key="wb.worldUserProfileCollapseHint"
      icon="user"
      :level="2"
    >
      <template #title-extra>
        <span class="world-desc-tag">{{ t('wb.worldUserProfileTag') }}</span>
      </template>

      <div v-if="!worldUserProfileDraft" class="world-desc-empty">
        <p>{{ t('wb.worldUserProfileEmpty') }}</p>
        <button type="button" class="action-btn add-world-btn" @click="addWorldUserProfile">
          <Icon name="plus" :size="14" />
          <span>{{ t('wb.addWorldUserProfile') }}</span>
        </button>
      </div>

      <div v-else class="world-desc-form">
        <div class="world-desc-row">
          <div class="world-desc-cell">
            <label class="form-label" :for="`wup-name-${currentLorebook.id}`">{{ t('wb.userName') }}</label>
            <input :id="`wup-name-${currentLorebook.id}`" type="text" class="form-input" :value="worldUserProfileDraft.name" :placeholder="t('wb.userNamePlaceholder')" maxlength="100" @input="onWorldUserProfileInput('name', $event)" />
          </div>
          <div class="world-desc-cell">
            <label class="form-label" :for="`wup-gender-${currentLorebook.id}`">{{ t('wb.userGender') }}</label>
            <input :id="`wup-gender-${currentLorebook.id}`" type="text" class="form-input" :value="worldUserProfileDraft.gender" :placeholder="t('wb.userGenderPlaceholder')" @input="onWorldUserProfileInput('gender', $event)" />
          </div>
        </div>
        <div class="world-desc-row">
          <div class="world-desc-cell">
            <label class="form-label" :for="`wup-pronouns-${currentLorebook.id}`">{{ t('wb.userPronouns') }}</label>
            <input :id="`wup-pronouns-${currentLorebook.id}`" type="text" class="form-input" :value="worldUserProfileDraft.pronouns" :placeholder="t('wb.userPronounsPlaceholder')" @input="onWorldUserProfileInput('pronouns', $event)" />
          </div>
          <div class="world-desc-cell">
            <label class="form-label" :for="`wup-age-${currentLorebook.id}`">{{ t('wb.userAge') }}</label>
            <input :id="`wup-age-${currentLorebook.id}`" type="text" class="form-input" :value="worldUserProfileDraft.age" :placeholder="t('wb.userAgePlaceholder')" @input="onWorldUserProfileInput('age', $event)" />
          </div>
        </div>
        <div class="world-desc-row">
          <label class="form-label" :for="`wup-occupation-${currentLorebook.id}`">{{ t('wb.userOccupation') }}</label>
          <input :id="`wup-occupation-${currentLorebook.id}`" type="text" class="form-input" :value="worldUserProfileDraft.occupation" :placeholder="t('wb.userOccupationPlaceholder')" @input="onWorldUserProfileInput('occupation', $event)" />
        </div>
        <div class="world-desc-row">
          <label class="form-label" :for="`wup-description-${currentLorebook.id}`">{{ t('wb.userDescription') }}</label>
          <textarea :id="`wup-description-${currentLorebook.id}`" class="form-textarea" :value="worldUserProfileDraft.description" :placeholder="t('wb.userDescriptionPlaceholder')" rows="3" @input="onWorldUserProfileInput('description', $event)" />
        </div>
        <div class="world-desc-row">
          <label class="form-label" :for="`wup-appearance-${currentLorebook.id}`">{{ t('wb.userAppearance') }}</label>
          <textarea :id="`wup-appearance-${currentLorebook.id}`" class="form-textarea" :value="worldUserProfileDraft.appearance" :placeholder="t('wb.userAppearancePlaceholder')" rows="2" @input="onWorldUserProfileInput('appearance', $event)" />
        </div>
        <div class="world-desc-row">
          <label class="form-label" :for="`wup-background-${currentLorebook.id}`">{{ t('wb.userBackground') }}</label>
          <textarea :id="`wup-background-${currentLorebook.id}`" class="form-textarea" :value="worldUserProfileDraft.background" :placeholder="t('wb.userBackgroundPlaceholder')" rows="3" @input="onWorldUserProfileInput('background', $event)" />
        </div>
        <div class="world-desc-row">
          <label class="form-label" :for="`wup-notes-${currentLorebook.id}`">{{ t('wb.userNotes') }}</label>
          <textarea :id="`wup-notes-${currentLorebook.id}`" class="form-textarea" :value="worldUserProfileDraft.notes" :placeholder="t('wb.userNotesPlaceholder')" rows="2" @input="onWorldUserProfileInput('notes', $event)" />
        </div>
        <div class="world-desc-actions">
          <button type="button" class="action-btn delete" @click="clearWorldUserProfile">
            <Icon name="trash-2" :size="14" />
            <span>{{ t('wb.clearWorldUserProfile') }}</span>
          </button>
        </div>
      </div>
    </Collapse>
  </template>
</template>

<style scoped>
.world-desc-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.world-user-profile-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.world-desc-tag {
  font-size: 10px;
  color: var(--secondary-text);
  padding: 2px 6px;
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.world-desc-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.world-desc-empty p {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

/* `.action-btn` 基类：scoped 到不了子组件内部，本组件自带一份（值取自原定义） */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
  }
}

.action-btn.delete {
  color: var(--error-fg);
  border-color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    background: var(--error);
    color: var(--on-accent);
  }
}

.add-world-btn {
  color: var(--secondary-text);
  border-color: var(--border);
}

.world-desc-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.world-desc-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.world-desc-row:first-child {
  flex-direction: row;
  gap: 12px;
}

.world-desc-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.world-desc-content {
  min-height: 80px;
}

.world-desc-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.form-input,
.form-select,
.form-textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-count {
  font-size: 11px;
  color: var(--muted-foreground);
  align-self: flex-end;
}

/* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
   规则随控件搬进本文件 —— 父组件 scoped 到不了子组件内部元素。 */
@media (max-width: 640px) {
  .form-input,
  .form-select,
  .form-textarea {
    font-size: 16px;
  }
}
</style>
