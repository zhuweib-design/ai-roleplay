<script setup lang="ts">
/**
 * 角色快速档（G 层，§3.4 第 6 条）
 *
 * 完整角色编辑器是"1 屏 6 段 23 个 label"，而让一个角色能开始对话其实只要
 * 名字 + 设定，再加可选的一本世界书。快速档就是这四件事，其余字段留在完整表单。
 *
 * 一个刻意的设计：**保存时才建角色**。
 * 设计文档 §3.5.6 记过这个坑——草稿态不能给"跳去编辑"的链接，因为
 * `/character/new` 还没有 ID，跳过去是个空跳。所以这里不产生草稿、不给跳转，
 * 点"建好并开始"才依次：建角色 → 写名字与设定 → 绑书 → 进对话。
 * 绑定动作排在拿到新角色 ID **之后**，否则 bindWorldBook 找不到角色会静默失败。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import FormField from '@/components/common/FormField.vue';
import { t } from '@/i18n';

const router = useRouter();
const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();

const name = ref('');
const description = ref('');
const bookId = ref('');
const attempted = ref(false);

const books = computed(() => lorebookStore.lorebooks);
const nameError = computed(() => {
  if (!attempted.value) return undefined;
  if (!name.value.trim()) return t('charEdit.nameRequired');
  if (name.value.trim().length > 64) return t('charEdit.nameTooLong');
  return undefined;
});
const canSubmit = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 64);

const emit = defineEmits<{ created: [characterId: string] }>();

function submit(): void {
  attempted.value = true;
  if (!canSubmit.value) return;

  const id = characterStore.createCharacter();
  characterStore.updateCharacter(id, {
    name: name.value.trim(),
    description: description.value.trim(),
  });
  // 绑书必须在拿到 ID 之后：bindWorldBook 按 id 找角色，找不到只返回 false
  if (bookId.value) characterStore.bindWorldBook(id, bookId.value);

  emit('created', id);
  void router.push({ name: 'chat' });
}
</script>

<template>
  <form class="quick-char" @submit.prevent="submit">
    <p class="quick-char-lead">{{ t('quick.charLead') }}</p>

    <FormField label-key="charEdit.nameLabel" html-for="qc-name" :error-text="nameError" required>
      <template #default="{ describedBy, invalid }">
        <input
          id="qc-name"
          v-model="name"
          class="tk-input"
          type="text"
          :maxlength="64"
          :placeholder="t('quick.charNamePlaceholder')"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
        />
      </template>
    </FormField>

    <FormField label-key="quick.charDescLabel" html-for="qc-desc" hint-key="quick.charDescHint">
      <template #default="{ describedBy }">
        <textarea
          id="qc-desc"
          v-model="description"
          class="tk-input qc-textarea"
          rows="3"
          :placeholder="t('quick.charDescPlaceholder')"
          :aria-describedby="describedBy"
        />
      </template>
    </FormField>

    <FormField label-key="quick.charBookLabel" html-for="qc-book" hint-key="quick.charBookHint">
      <template #default="{ describedBy }">
        <select id="qc-book" v-model="bookId" class="tk-input" :aria-describedby="describedBy">
          <option value="">{{ t('quick.charBookNone') }}</option>
          <option v-for="book in books" :key="book.id" :value="book.id">
            {{ book.name }}
          </option>
        </select>
      </template>
    </FormField>

    <div class="quick-char-actions">
      <button type="submit" class="quick-char-submit" data-rel-jump="quick-char-create" :disabled="attempted && !canSubmit">
        {{ t('quick.charSubmit') }}
      </button>
      <span class="quick-char-note">{{ t('quick.charMoreFields') }}</span>
    </div>
  </form>
</template>

<style scoped>
.quick-char {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
  padding: var(--spacing-md, 16px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.quick-char-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.qc-textarea {
  resize: vertical;
  min-height: 66px;
}

.quick-char-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.quick-char-submit {
  padding: 8px 16px;
  border: 1px solid var(--secondary);
  border-radius: var(--radius-sm, 8px);
  background: var(--secondary);
  color: var(--on-accent, var(--background));
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.quick-char-note {
  font-size: 12px;
  color: var(--muted-foreground);
}
</style>
