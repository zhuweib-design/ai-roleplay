<script setup lang="ts">
/**
 * 世界书"最小生效三步"（G 层，§3.4 第 6 条）
 *
 * 一条世界书要真的影响回复，需要三件事同时成立：有一本书、书里有一条**启用且常驻**的条目、
 * 这本书被当前角色绑上（或它是全局书）。这三件事原先散在三个界面，
 * 中间任何一步没做，用户看到的都是"我建了世界书但没效果"。
 *
 * 三步都在这一屏里做完，步骤条用 StepFlow；每步完成后自动进入下一步的可用态。
 */
import { computed, ref } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import StepFlow, { type StepFlowItem } from '@/components/common/StepFlow.vue';
import { t } from '@/i18n';

const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();

const bookName = ref('');
const entryTitle = ref('');
const entryContent = ref('');
const createdBookId = ref('');
const createdEntryId = ref('');
const bound = ref(false);
const notice = ref('');

const currentCharacter = computed(() => characterStore.currentCharacter);

const emit = defineEmits<{ finished: [] }>();

const steps = computed<StepFlowItem[]>(() => [
  { id: 'book', labelKey: 'quick.wbStepBook', done: Boolean(createdBookId.value) },
  { id: 'entry', labelKey: 'quick.wbStepEntry', done: Boolean(createdEntryId.value) },
  { id: 'bind', labelKey: 'quick.wbStepBind', done: bound.value },
]);

const allDone = computed(() => Boolean(createdBookId.value) && Boolean(createdEntryId.value) && bound.value);

function createBook(): void {
  const name = bookName.value.trim();
  if (!name) {
    notice.value = t('quick.wbNeedName');
    return;
  }
  // 全局书无需绑定即可生效，但这里刻意建成角色书：
  // 快速档的语义是"给这个角色加设定"，默认建全局书会把改动扩散到所有角色。
  const id = lorebookStore.createLorebook({ name, scope: 'character' });
  createdBookId.value = id;
  notice.value = '';
}

function addEntry(): void {
  if (!createdBookId.value) return;
  const title = entryTitle.value.trim();
  const content = entryContent.value.trim();
  if (!title || !content) {
    notice.value = t('quick.wbNeedEntry');
    return;
  }
  const entryId = lorebookStore.addEntry(createdBookId.value, {
    title,
    content,
    strategy: 'constant',
    enabled: true,
  });
  if (!entryId) {
    notice.value = lorebookStore.lastError || t('quick.wbEntryFailed');
    return;
  }
  createdEntryId.value = entryId;
  notice.value = '';
}

function bindToCharacter(): void {
  const char = currentCharacter.value;
  if (!char || !createdBookId.value) return;
  const ok = characterStore.bindWorldBook(char.id, createdBookId.value);
  // 已绑过也视为完成（bindWorldBook 对重复绑定返回 false，不是失败）
  bound.value = ok || characterStore.getBoundWorldBookIds(char.id).includes(createdBookId.value);
  notice.value = bound.value ? '' : t('quick.wbBindFailed');
}
</script>

<template>
  <section class="quick-wb" :aria-label="t('quick.wbAria')">
    <p class="quick-wb-lead">{{ t('quick.wbLead') }}</p>

    <StepFlow :items="steps" label-key="quick.wbAria" />

    <div class="quick-wb-step">
      <label class="quick-wb-label" for="qw-book-name">{{ t('quick.wbBookName') }}</label>
      <div class="quick-wb-row">
        <input
          id="qw-book-name"
          v-model="bookName"
          class="tk-input"
          type="text"
          :maxlength="40"
          :disabled="Boolean(createdBookId)"
        />
        <button
          type="button"
          class="quick-wb-action"
          data-rel-jump="quick-wb-create-book"
          :disabled="Boolean(createdBookId)"
          @click="createBook"
        >
          {{ createdBookId ? t('prereq.done') : t('quick.wbDoBook') }}
        </button>
      </div>
    </div>

    <div class="quick-wb-step" :class="{ disabled: !createdBookId }">
      <label class="quick-wb-label" for="qw-entry-title">{{ t('quick.wbEntryTitle') }}</label>
      <input
        id="qw-entry-title"
        v-model="entryTitle"
        class="tk-input"
        type="text"
        :maxlength="40"
        :disabled="!createdBookId || Boolean(createdEntryId)"
      />
      <label class="quick-wb-label" for="qw-entry-content">{{ t('quick.wbEntryContent') }}</label>
      <textarea
        id="qw-entry-content"
        v-model="entryContent"
        class="tk-input quick-wb-textarea"
        rows="2"
        :disabled="!createdBookId || Boolean(createdEntryId)"
      />
      <button
        type="button"
        class="quick-wb-action"
        data-rel-jump="quick-wb-add-entry"
        :disabled="!createdBookId || Boolean(createdEntryId)"
        @click="addEntry"
      >
        {{ createdEntryId ? t('prereq.done') : t('quick.wbDoEntry') }}
      </button>
    </div>

    <div class="quick-wb-step" :class="{ disabled: !createdEntryId }">
      <p class="quick-wb-bind-line">
        {{ t('quick.wbBindTo', { name: currentCharacter?.name ?? t('chat.modelNotConfigured') }) }}
      </p>
      <button
        type="button"
        class="quick-wb-action"
        data-rel-jump="quick-wb-bind"
        :disabled="!createdEntryId || bound || !currentCharacter"
        @click="bindToCharacter"
      >
        {{ bound ? t('prereq.done') : t('quick.wbDoBind') }}
      </button>
    </div>

    <p v-if="notice" class="quick-wb-notice" role="alert">{{ notice }}</p>
    <p v-if="allDone" class="quick-wb-done">{{ t('quick.wbAllDone') }}</p>
    <button
      v-if="allDone"
      type="button"
      class="quick-wb-action"
      data-rel-jump="quick-wb-finish"
      @click="emit('finished')"
    >
      {{ t('quick.wbFinish') }}
    </button>
  </section>
</template>

<style scoped>
.quick-wb {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-md, 16px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.quick-wb-lead {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.quick-wb-step {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.quick-wb-step.disabled {
  opacity: 0.55;
}

/* 浏览器给 disabled 的 input/textarea 刷的是浅色底，深色主题下像坏了 */
.quick-wb :disabled {
  background: var(--input, var(--card-elevated));
  color: var(--muted-foreground);
  opacity: 1;
}

.quick-wb-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}

.quick-wb-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.quick-wb-textarea {
  resize: vertical;
  min-height: 48px;
}

.quick-wb-action {
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--secondary);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--secondary);
  font-size: 13px;
  cursor: pointer;
}

.quick-wb-action:disabled {
  cursor: not-allowed;
}

.quick-wb-bind-line {
  margin: 0;
  font-size: 13px;
  color: var(--foreground);
}

.quick-wb-notice {
  margin: 0;
  font-size: 12px;
  color: var(--destructive);
}

.quick-wb-done {
  margin: 0;
  font-size: 12px;
  color: var(--secondary);
}

@media (max-width: 640px) {
  .quick-wb-action {
    font-size: 16px;
  }
}
</style>
