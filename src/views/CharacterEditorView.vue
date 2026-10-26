<script setup lang="ts">
/**
 * CharacterEditorView — 角色卡编辑表单页 (Phase E2)
 *
 * 功能：
 * - 路由参数 :id 存在时为编辑模式（加载现有角色），否则为新建模式
 * - 表单字段：名称、头像（gradient/image URL）、描述、标签、模型、温度、作者笔记、作者深度
 * - 实时预览：右侧显示 Avatar + 名称 + 描述
 * - 表单验证：名称必填
 * - 操作：保存 / 取消 / 删除（编辑模式，带确认 Modal） / 导出 V2（编辑模式）
 *
 * 无障碍：
 * - 语义化 <form> <fieldset> <legend> 结构
 * - 所有输入框均关联 <label>
 * - 错误提示使用 aria-invalid + aria-describedby
 * - 保存按钮在表单未通过验证时禁用并提示原因
 *
 * R2-1 拆分后的分工（本文件只留编排）：
 * - 表单状态与校验 → `composables/useCharacterEditorForm.ts`
 * - 页头 / 五个字段段 / 世界书绑定 / 预览侧栏 → `components/character/editor/*`
 *
 * 为什么六个 section 共用**同一个** `form`（`v-model:form`）而不是各管一段：
 * 这张表单是跨字段校验的（属性开关一开，等级/经验/属性名重复三条校验才成立），
 * 保存也要一次性交出完整补丁。切开状态会变成多份真相，与 R1-4 设置面板
 * "每个 section 读写独立切片、全走 store"的前提不同。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useCharacterStore } from '@/stores/character';
import { useCharacterEditorForm } from '@/composables/useCharacterEditorForm';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import QuickCharacterForm from '@/components/character/QuickCharacterForm.vue';
import ModuleRelationsPanel from '@/components/layout/ModuleRelationsPanel.vue';
import CharacterEditorHeader from '@/components/character/editor/CharacterEditorHeader.vue';
import CharacterEditorBasicSection from '@/components/character/editor/CharacterEditorBasicSection.vue';
import CharacterEditorAvatarSection from '@/components/character/editor/CharacterEditorAvatarSection.vue';
import CharacterEditorModelSection from '@/components/character/editor/CharacterEditorModelSection.vue';
import CharacterEditorAttrSection from '@/components/character/editor/CharacterEditorAttrSection.vue';
import CharacterEditorAdvancedSection from '@/components/character/editor/CharacterEditorAdvancedSection.vue';
import CharacterEditorWorldBookSection from '@/components/character/editor/CharacterEditorWorldBookSection.vue';
import CharacterPreviewPanel from '@/components/character/editor/CharacterPreviewPanel.vue';
import { t } from '@/i18n';

const props = defineProps<{
  /** 编辑模式时传入的角色 id；新建模式不传 */
  id?: string;
}>();

const router = useRouter();
const characterStore = useCharacterStore();

const {
  form,
  isDirty,
  loadedCharacter,
  errors,
  hasErrors,
  canSave,
  previewCharacter,
  loadCharacter,
  resetToEmpty,
  buildPatch,
} = useCharacterEditorForm(() => props.id);

const isEditMode = computed(() => !!props.id);

/**
 * 新建时的两档：快速档（名字 + 设定 + 选书）与完整表单。
 * 默认快速档——新建角色最常卡住的不是字段不够，而是"这么多格子该填哪几个"。
 * 编辑已有角色时不提供快速档：那时所有字段都可能有值，藏起来等于丢数据。
 */
const createMode = ref<'quick' | 'full'>('quick');

/**
 * 新建态的待绑定清单：以前整个"世界书绑定"区在 `v-if="isEditMode"` 里，
 * 而新建角色恰恰是最需要选世界的时刻 —— 于是新角色一律零绑定地出生，
 * 用户要退出去编辑页再绑一次。这里改成创建成功后一次性绑上。
 */
const pendingWorldBookIds = ref<string[]>([]);

// 同步快速路径：角色已在内存里就直接填表——改成一律异步会让表单先渲染一帧"新建态"
// （渐变头像段闪一下），那个回归由 tests/views/character-editor-field-wiring.test.ts 抓着。
// 找不到不等于角色不存在：深链进来时角色库可能还没从存档读完（`characters` 初值
// 只有 mock 种子）。等读完再判一次交给 useDeepLinkId；仍然找不到才是真的不存在。
const presetCharacter = props.id
  ? characterStore.characters.find((c) => c.id === props.id)
  : undefined;
if (presetCharacter) {
  loadCharacter(presetCharacter);
} else if (props.id) {
  useDeepLinkId({
    key: 'id',
    // 闸门由登记表给（`id` 归属角色库）
    onResolved: (id) => {
      const later = characterStore.characters.find((c) => c.id === id);
      if (!later) {
        showToast('error', t('charEdit.notFound'));
        setTimeout(() => void router.replace({ name: 'character-list' }), 800);
        return;
      }
      loadCharacter(later);
    },
    reactive: false,
  });
} else {
  // 新建模式：空表单
  resetToEmpty();
}

// 标记表单被修改。**必须挂在初次填表之后**：composable 里挂会让深链异步填表
// 被自己标成"已修改"，编辑页一按取消就弹"未保存"确认（旧行为没有这个回归）。
watch(
  form,
  () => {
    isDirty.value = true;
  },
  { deep: true }
);

// ── Toast 反馈 ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// 监听 store 错误
watch(
  () => characterStore.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => characterStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// ── 删除确认 ──
const deleteModalOpen = ref(false);

function openDeleteConfirm() {
  if (!props.id) return;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!props.id) return;
  const name = loadedCharacter.value?.name ?? '';
  characterStore.deleteCharacter(props.id);
  deleteModalOpen.value = false;
  showToast('success', t('charEdit.deleted', { name }));
  setTimeout(() => void router.replace({ name: 'character-list' }), 600);
}

// ── 保存 ──
function handleSave() {
  if (hasErrors.value) {
    showToast('error', t('charEdit.fixErrors'));
    return;
  }
  if (isEditMode.value && props.id) {
    const ok = characterStore.updateCharacter(props.id, buildPatch());
    if (ok) {
      showToast('success', t('charEdit.saved'));
      setTimeout(() => void router.replace({ name: 'character-list' }), 600);
    } else {
      showToast('error', t('charEdit.saveFailed'));
    }
  } else {
    // 新建：先 createCharacter 再 updateCharacter
    const newId = characterStore.createCharacter();
    characterStore.updateCharacter(newId, buildPatch());
    const bound = pendingWorldBookIds.value.filter((id) =>
      characterStore.bindWorldBook(newId, id)
    ).length;
    showToast(
      'success',
      bound > 0 ? t('charEdit.createdWithWorlds', { count: bound }) : t('charEdit.created')
    );
    setTimeout(() => void router.replace({ name: 'character-list' }), 600);
  }
}

// ── 取消（带未保存确认，P1-3 改用应用内 Modal 替代原生 confirm） ──
const unsavedConfirmOpen = ref(false);

function handleCancel() {
  if (isDirty.value && canSave.value) {
    unsavedConfirmOpen.value = true;
    return;
  }
  router.back();
}

function confirmLeaveEditor() {
  unsavedConfirmOpen.value = false;
  router.back();
}

// ── 导出 V2 ──
function handleExport() {
  if (!props.id) return;
  void characterStore.downloadV2(props.id);
}
</script>

<template>
  <main id="main-content" class="editor-view" :aria-label="t('charEdit.aria')" tabindex="-1">
    <!-- 顶部工具栏 -->
    <CharacterEditorHeader
      :is-edit-mode="isEditMode"
      :can-save="canSave"
      :show-save="isEditMode || createMode === 'full'"
      @cancel="handleCancel"
      @save="handleSave"
      @remove="openDeleteConfirm"
      @export="handleExport"
    />

    <!-- 新建先走快速档；完整表单随时可切，编辑已有角色时不出现这个开关 -->
    <div
      v-if="!isEditMode"
      class="create-mode-switch"
      role="group"
      :aria-label="t('quick.charModeAria')"
    >
      <button
        type="button"
        class="create-mode-btn"
        :class="{ active: createMode === 'quick' }"
        :aria-pressed="createMode === 'quick'"
        data-rel-jump="char-create-quick"
        @click="createMode = 'quick'"
      >
        {{ t('quick.charModeQuick') }}
      </button>
      <button
        type="button"
        class="create-mode-btn"
        :class="{ active: createMode === 'full' }"
        :aria-pressed="createMode === 'full'"
        data-rel-jump="char-create-full"
        @click="createMode = 'full'"
      >
        {{ t('quick.charModeFull') }}
      </button>
    </div>

    <QuickCharacterForm v-if="!isEditMode && createMode === 'quick'" class="create-quick" />

    <!--
      用 v-if 而不是 v-show：两档同时留在 DOM 里会让"名称"这类标签在一页上出现两次
      （实测 getByLabel 直接 strict-mode 冲突），更糟的是隐藏表单里的输入框仍可被 Tab 进入。
      代价是在新建态来回切档会丢掉未保存的填写——那时还没有任何持久化数据，可接受。
    -->
    <div v-if="isEditMode || createMode === 'full'" class="editor-body tk-scroll">
      <form
        class="editor-form"
        novalidate
        @submit.prevent="handleSave"
      >
        <CharacterEditorBasicSection v-model:form="form" :errors="errors" />
        <CharacterEditorAvatarSection v-model:form="form" :errors="errors" @notify="showToast" />
        <CharacterEditorModelSection v-model:form="form" :errors="errors" />
        <CharacterEditorAttrSection v-model:form="form" :errors="errors" />
        <CharacterEditorAdvancedSection v-model:form="form" :errors="errors" />
        <!-- 需求7：世界书绑定 -->
        <CharacterEditorWorldBookSection
          v-model:pending-ids="pendingWorldBookIds"
          :is-edit-mode="isEditMode"
          :character-id="props.id"
          @notify="showToast"
        />

        <!-- L 层：角色关联（只读 composables/useCharacterRelations.ts，编辑模式下才有确定的角色身份） -->
        <ModuleRelationsPanel v-if="isEditMode && props.id" :character-id="props.id" />

        <!-- 表单底部按钮（移动端使用） -->
        <div class="form-footer">
          <button type="button" class="footer-btn cancel" @click="handleCancel">{{ t('charEdit.cancel') }}</button>
          <button
            type="submit"
            class="footer-btn save"
            :disabled="!canSave"
            :aria-disabled="!canSave"
          >
            <Icon name="save" :size="14" />
            <span>{{ t('charEdit.save') }}</span>
          </button>
        </div>
      </form>

      <!-- 实时预览 -->
      <CharacterPreviewPanel :character="previewCharacter" />
    </div>

    <!-- 删除确认 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('charEdit.deleteTitle')"
      :aria-label="t('charEdit.deleteAria2')"
      described-by="char-delete-desc char-delete-warning"
    >
      <p id="char-delete-desc" v-if="loadedCharacter">
        {{ t('charEdit.deleteConfirm', { name: loadedCharacter.name }) }}
      </p>
      <p id="char-delete-warning" class="delete-warning">
        {{ t('charEdit.deleteWarning') }}
      </p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('charEdit.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDelete"
        >
          {{ t('charEdit.delete') }}
        </button>
      </template>
    </Modal>

    <!-- P1-3：取消编辑时未保存确认（替代原生 confirm） -->
    <Modal
      v-model="unsavedConfirmOpen"
      :title="t('charEdit.unsavedTitle')"
      described-by="char-unsaved-desc"
    >
      <p id="char-unsaved-desc">{{ t('charEdit.unsaved') }}</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="unsavedConfirmOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmLeaveEditor"
        >
          {{ t('common.confirm') }}
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </main>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  gap: 16px;
}

.create-mode-switch {
  display: flex;
  gap: 8px;
  padding: 12px 20px 0;
}

.create-mode-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

.create-mode-btn.active {
  border-color: var(--secondary);
  color: var(--secondary-text);
}

.create-quick {
  margin: 12px 20px;
  max-width: 560px;
}

/* 主体布局：表单 + 预览（桌面双列） */
.editor-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  overflow-y: auto;
  padding-right: 4px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}

.footer-btn {
  height: var(--size-control-md);
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color .15s ease, border-color .15s ease;
}

.footer-btn.cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .footer-btn.cancel:hover {
    background: var(--video-bg);
  }
}

.footer-btn.save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

@media (hover: hover) and (pointer: fine) {
  .footer-btn.save:hover:not(:disabled) {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.footer-btn.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* Modal 按钮 */
.modal-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

@media (hover: hover) and (pointer: fine) {
  .modal-confirm:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.delete-warning {
  margin-top: 8px;
  color: var(--error-fg);
  font-size: 13px;
}

/* 响应式：预览侧栏自己带 1024 断点（它要同时取消滚动容器，见该组件注释） */
@media (max-width: 1024px) {
  .editor-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .editor-view {
    padding: 16px;
  }
}
</style>
