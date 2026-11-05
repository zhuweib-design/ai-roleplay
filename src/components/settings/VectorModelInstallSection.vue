<script setup lang="ts">
/**
 * 本地模型安装：目录选择（Tauri 系统对话框 / Web File System Access）→ 复制到 model/<id>/
 * 以及已装模型的冒烟验证（真实跑一次 embed）。
 */
import { ref, onMounted } from 'vue';
import { showToast } from '@/utils/toast-service';
import { createOnnxEmbeddingProvider } from '@/core/dual-channel-runtime';
import { VECTOR_MODELS, type VectorModelId } from '@/core/vector-model-manager';
import { createModelFileAdapter, isTauriEnv } from '@/core/model-file-adapter';
import { t } from '@/i18n';

const installed = ref<VectorModelId[]>([]);
const installing = ref(false);
const installMsg = ref('');
const testingModel = ref<VectorModelId | null>(null);
const smokeResult = ref<Record<string, string>>({});

/** F-3：能力探测 —— 目录选择(webkitdirectory)在部分移动端浏览器不可用。
 *  不依赖 isMobile / 环境判断决定功能可用性，而是探测真实能力；
 *  缺失能力时提供替代路径（zip 上传，见「用户自定义模型」）或直接说明不可用。 */
const canPickDirectory =
  typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;

async function refreshInstalled() {
  installed.value = await createModelFileAdapter().listInstalled();
}

/** 冒烟验证:对已装模型执行一次真实嵌入 */
async function runSmoke(modelId: VectorModelId) {
  if (testingModel.value) return;
  testingModel.value = modelId;
  smokeResult.value[modelId] = t('vector.smokeLoading');
  try {
    // ORT_ISOLATION_DESIGN S2b：经全仓唯一动态入口构造 provider（设计文档 §4-B2）
    const provider = await createOnnxEmbeddingProvider({
      modelId,
      adapter: createModelFileAdapter(),
    });
    const t0 = performance.now();
    const v = await provider.embed(t('vector.smokeText'));
    const ms = (performance.now() - t0).toFixed(0);
    smokeResult.value[modelId] = t('vector.smokeResult', { dim: v.dim, ms });
    showToast('success', t('vector.smokeOk', { id: modelId }));
  } catch (e) {
    smokeResult.value[modelId] = `✗ ${e instanceof Error ? e.message : String(e)}`;
    showToast('error', t('vector.smokeFail', { id: modelId }));
  } finally {
    testingModel.value = null;
  }
}

/** Web:目录选择(File System Access);Tauri:系统目录对话框 */
async function pickAndInstall() {
  installMsg.value = '';
  try {
    const adapter = createModelFileAdapter();
    if (isTauriEnv()) {
      installing.value = true;
      const { modelFsIpc } = await import('@/core/model-fs-ipc');
      const dir = await modelFsIpc.pickDir(t('vector.pickTitle'));
      if (!dir) return;
      // 由 model.onnx 所在文件夹名推断模型 id(或要求用户先选目标模型)
      const files = await adapter.importFromDir('bge-small-zh-v1.5', dir);
      installMsg.value = t('vector.copied', { files: files.join(', ') });
    } else if (canPickDirectory) {
      // 取消时部分内核不回报任何事件，所以这段不占用 installing —— 否则按钮会一直灰着
      const picked = await pickDirectoryFiles();
      if (!picked) return;
      installing.value = true;
      const saved = await adapter.importFromDir('bge-small-zh-v1.5', picked);
      installMsg.value = t('vector.copiedFiles', { count: saved.length });
    } else {
      // 能力缺失（如移动端 iOS Safari 无 webkitdirectory）：不静默失败，给出替代路径
      showToast('info', t('vector.dirPickUnsupported'));
      installMsg.value = t('vector.dirPickHint');
      return;
    }
    await refreshInstalled();
    showToast('success', t('vector.installDone'));
  } catch (e) {
    showToast('error', t('vector.installFailed', { error: e instanceof Error ? e.message : String(e) }));
  } finally {
    installing.value = false;
  }
}

/**
 * `<input webkitdirectory>` 是回调式的：click() 立刻返回，change 里的写库还在飞，
 * 外层却已经去刷新列表并提示"安装完成"了（实测：文件已进 IndexedDB，已安装列表仍空）。
 * 包成 Promise 让调用方等到文件真的拿到；取消（没选任何文件）返回 null。
 */
function pickDirectoryFiles(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      resolve(files.length > 0 ? files : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

onMounted(() => {
  void refreshInstalled();
});
</script>

<template>
  <div class="install-box">
    <h3 class="box-title">{{ t('vector.installTitle') }}</h3>
    <p class="field-hint">
      {{ t('vector.installHint') }}
    </p>
    <button
      v-if="isTauriEnv() || canPickDirectory"
      type="button"
      class="add-btn"
      :disabled="installing"
      @click="pickAndInstall"
    >
      {{ installing ? t('vector.installing') : t('vector.pickFolder') }}
    </button>
    <p v-else class="field-hint dir-pick-hint">{{ t('vector.dirPickHint') }}</p>
    <span v-if="installMsg" class="install-msg">{{ installMsg }}</span>
    <ul v-if="installed.length" class="installed-list" :aria-label="t('vector.installedList')">
      <li v-for="id in installed" :key="id" class="installed-item">
        <div class="installed-info">
          <span class="installed-name">{{ id }}</span>
          <span class="installed-meta">
            {{ t('vector.dimUnit', { dim: VECTOR_MODELS[id]?.dim ?? '?' }) }} ·
            {{ VECTOR_MODELS[id]?.browserSafe ? t('vector.browserSafe') : t('vector.desktop') }} ·
            {{ VECTOR_MODELS[id]?.role === 'dynamic' ? t('vector.dynamicLayer') : t('vector.staticLayer') }}
          </span>
        </div>
        <button
          type="button"
          class="mini-btn"
          :disabled="testingModel !== null"
          @click="runSmoke(id)"
        >
          {{ testingModel === id ? t('vector.verifyLoading') : t('vector.verify') }}
        </button>
        <span v-if="smokeResult[id]" class="install-msg">{{ smokeResult[id] }}</span>
      </li>
    </ul>
    <p v-else class="field-hint">{{ t('vector.noInstalled') }}</p>
  </div>
</template>

<style scoped>
.dir-pick-hint {
  color: var(--warning, #e0af68);
  font-size: 12px;
  line-height: 1.6;
}
.install-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}
.install-msg {
  margin-left: 10px;
  color: var(--green, #9ece6a);
  font-size: 12px;
}
.installed-list {
  margin: var(--spacing-sm) 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
.installed-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
}
.installed-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.installed-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.installed-meta {
  color: var(--muted-foreground);
  font-size: 12px;
}
</style>