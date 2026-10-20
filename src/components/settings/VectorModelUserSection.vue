<script setup lang="ts">
/**
 * 用户自定义向量模型：zip 上传（Web）/ 系统目录选择（Tauri）/ 固定目录预扫描登记。
 * 元数据由 user-vector-model store 统一持有，宿主的下拉选项也读同一份。
 */
import { ref, onMounted } from 'vue';
import { showToast } from '@/utils/toast-service';
import { isTauriEnv } from '@/core/model-file-adapter';
import { useUserVectorModelStore } from '@/stores/user-vector-model';
import type { ScannedModelCandidate } from '@/core/vector-model-install';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

const userStore = useUserVectorModelStore();
const userModelName = ref('');
const installingUser = ref(false);
const userInputRef = ref<HTMLInputElement | null>(null);
// Tauri:预扫描到的候选模型
const scannedCandidates = ref<ScannedModelCandidate[]>([]);
const scanning = ref(false);

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** 打开 zip 文件选择 */
function triggerUserZipUpload() {
  userInputRef.value?.click();
}

/** 用户提交 zip 上传(Web) */
async function handleUserZipPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  installingUser.value = true;
  try {
    await userStore.uploadFromZip(file, userModelName.value);
    userModelName.value = '';
    showToast('success', t('userModel.installed', { name: file.name }));
  } catch (err) {
    showToast('error', err instanceof Error ? err.message : String(err));
  } finally {
    installingUser.value = false;
  }
}

/** Tauri:系统对话框选目录并登记 */
async function handleUserPickDir() {
  installingUser.value = true;
  try {
    const { pickModelDirectory } = await import('@/core/vector-model-tauri');
    const cand = await pickModelDirectory(t('vector.pickTitle'));
    if (!cand) return;
    await userStore.registerFromDir(cand, userModelName.value || undefined);
    userModelName.value = '';
    showToast('success', t('userModel.installed', { name: cand.dirName }));
    await userStore.load();
    await refreshScanned();
  } catch (err) {
    showToast('error', err instanceof Error ? err.message : String(err));
  } finally {
    installingUser.value = false;
  }
}

/** Tauri:预扫描固定目录候选 */
async function refreshScanned() {
  if (!isTauriEnv()) return;
  scanning.value = true;
  try {
    const { prescanModelDirs } = await import('@/core/vector-model-tauri');
    scannedCandidates.value = await prescanModelDirs();
  } catch {
    scannedCandidates.value = [];
  } finally {
    scanning.value = false;
  }
}

/** 登记扫描到的候选 */
async function registerScanned(cand: ScannedModelCandidate) {
  installingUser.value = true;
  try {
    await userStore.registerFromDir(cand, undefined);
    showToast('success', t('userModel.installed', { name: cand.dirName }));
    await refreshScanned();
  } catch (err) {
    showToast('error', err instanceof Error ? err.message : String(err));
  } finally {
    installingUser.value = false;
  }
}

/** 删除自定义模型 */
async function handleDeleteUserModel(id: string) {
  installingUser.value = true;
  try {
    await userStore.remove(id);
    showToast('success', t('userModel.deleted'));
  } catch (err) {
    showToast('error', t('userModel.deleteFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    installingUser.value = false;
  }
}

onMounted(() => {
  // 自定义模型:加载元数据 + Tauri 预扫描
  void userStore.load();
  void refreshScanned();
});
</script>

<template>
  <!-- 用户自定义向量模型 -->
  <div class="user-model-box">
    <header class="user-model-header">
      <h3 class="box-title">{{ t('userModel.title') }}</h3>
      <!-- Tauri:手动刷新预扫描 -->
      <button
        v-if="isTauriEnv()"
        type="button"
        class="mini-btn"
        :disabled="scanning"
        @click="refreshScanned"
      >
        {{ scanning ? t('userModel.scanning') : t('userModel.refresh') }}
      </button>
    </header>
    <p class="field-hint">{{ t('userModel.desc') }}</p>

    <div class="field-row">
      <div class="field-group">
        <label class="field-label" for="user-model-name">{{ t('userModel.nameLabel') }}</label>
        <input
          id="user-model-name"
          v-model="userModelName"
          class="field-input"
          type="text"
          :placeholder="t('userModel.namePlaceholder')"
          autocomplete="off"
        />
      </div>
    </div>

    <div class="field-row user-model-actions">
      <button
        type="button"
        class="add-btn"
        :disabled="installingUser"
        @click="triggerUserZipUpload"
      >
        <Icon name="upload" :size="14" />
        <span>{{ installingUser ? t('userModel.installing') : t('userModel.uploadZip') }}</span>
      </button>
      <button
        v-if="isTauriEnv()"
        type="button"
        class="add-btn secondary"
        :disabled="installingUser"
        @click="handleUserPickDir"
      >
        <Icon name="download" :size="14" />
        <span>{{ t('userModel.pickDir') }}</span>
      </button>
      <input
        ref="userInputRef"
        type="file"
        accept=".zip,application/zip"
        class="hidden-input"
        :aria-label="t('userModel.uploadZipAria')"
        @change="handleUserZipPicked"
      />
    </div>

    <!-- 已登记的用户自定义模型 -->
    <ul v-if="userStore.models.length" class="user-model-list" :aria-label="t('userModel.list')">
      <li
        v-for="m in userStore.models"
        :key="m.id"
        class="user-model-item"
      >
        <div class="user-model-info">
          <div class="user-model-name">
            <span>{{ m.name }}</span>
            <span v-if="m.isNew" class="new-badge">{{ t('userModel.new') }}</span>
          </div>
          <div class="user-model-meta">
            {{ t('userModel.added', { time: formatTime(m.createdAt) }) }} ·
            {{ m.files.length }} {{ t('userModel.filesUnit') }} ·
            <span v-if="m.dim">{{ m.dim }}d</span>
            <span v-else>{{ t('userModel.dimUnknown') }}</span>
          </div>
          <div class="user-model-files">{{ m.files.join(', ') }}</div>
        </div>
        <button
          type="button"
          class="mini-btn danger"
          :disabled="installingUser"
          :aria-label="t('userModel.deleteAria', { name: m.name })"
          @click="handleDeleteUserModel(m.id)"
        >
          {{ t('common.delete') }}
        </button>
      </li>
    </ul>
    <p v-else class="field-hint">{{ t('userModel.empty') }}</p>

    <!-- Tauri:预扫描到的候选模型 -->
    <template v-if="isTauriEnv() && scannedCandidates.length">
      <h3 class="box-title sub">{{ t('userModel.scannedTitle') }}</h3>
      <ul class="user-model-list" :aria-label="t('userModel.scannedList')">
        <li v-for="cand in scannedCandidates" :key="cand.path" class="user-model-item">
          <div class="user-model-info">
            <div class="user-model-name">
              <span>{{ cand.dirName }}</span>
              <span v-if="cand.onnxFile" class="file-badge">{{ cand.onnxFile }}</span>
            </div>
            <div class="user-model-files">{{ cand.files.length }} files @ {{ cand.path }}</div>
          </div>
          <button
            type="button"
            class="mini-btn"
            :disabled="installingUser"
            @click="registerScanned(cand)"
          >
            {{ t('userModel.register') }}
          </button>
        </li>
      </ul>
    </template>
    <p v-else-if="isTauriEnv() && !scanning" class="field-hint">{{ t('userModel.noScanned') }}</p>
  </div>
</template>

<style scoped>
/* ── 用户自定义向量模型 ── */
.user-model-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user-model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}
.user-model-actions {
  align-items: center;
}
.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.user-model-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
.user-model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px dashed var(--border);
}
.user-model-item:last-child {
  border-bottom: none;
}
.user-model-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.user-model-name {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.new-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--primary);
  border-radius: var(--radius-pill);
  text-transform: uppercase;
}
.file-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--badge-fg);
  background: var(--badge-bg);
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
}
.user-model-meta {
  color: var(--muted-foreground);
  font-size: 12px;
}
.user-model-files {
  color: var(--muted-foreground);
  font-size: 11px;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>