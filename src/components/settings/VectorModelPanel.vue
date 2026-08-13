<script setup lang="ts">
/**
 * 向量检索设置(双通道 RAG)
 * - 开关:默认关闭(localStorage aijiuguan.vectorRagEnabled)
 * - 双通道模型选择(动态/静态;auto=selectVectorModel 自动:browser→bge-small)
 * - 本地模型安装:选文件夹 → 复制到 model/<id>/
 * - 线上服务器引用字段(预留)
 */
import { ref, onMounted } from 'vue';
import Icon from '@/components/common/Icon.vue';
import {
  isVectorRagEnabled,
  setVectorRagEnabled,
} from '@/core/dual-channel-runtime';
import {
  VECTOR_MODELS,
  type VectorModelId,
} from '@/core/vector-model-manager';
import {
  createModelFileAdapter,
  isTauriEnv,
} from '@/core/model-file-adapter';
import { t } from '@/i18n';

const ENABLED = ref(false);
const dynamicModel = ref<'auto' | VectorModelId>('auto');
const staticModel = ref<'auto' | VectorModelId>('auto');
const installed = ref<VectorModelId[]>([]);
const installing = ref(false);
const installMsg = ref('');
const remoteOpen = ref(false);
const testingModel = ref<VectorModelId | null>(null);
const smokeResult = ref<Record<string, string>>({});
const showToast = (t: 'success' | 'error', msg: string) => {
  window.dispatchEvent(
    new CustomEvent('app-toast', { detail: { type: t, message: msg } })
  );
};

/** 冒烟验证:对已装模型执行一次真实嵌入 */
async function runSmoke(modelId: VectorModelId) {
  if (testingModel.value) return;
  testingModel.value = modelId;
  smokeResult.value[modelId] = t('vector.smokeLoading');
  try {
    const { OnnxEmbeddingProvider } = await import('@/core/onnx-embedding-provider');
    const provider = new OnnxEmbeddingProvider({
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

// 线上引用字段(持久化 aijiuguan.remoteEmbedding)
const remote = ref({
  baseUrl: '',
  apiKey: '',
  modelName: '',
  embeddingPath: '/embeddings',
  dim: 1024,
});

const modelOptions: Array<{ value: 'auto' | VectorModelId; label: string }> = [
  { value: 'auto', label: t('vector.autoLabel') },
  { value: 'bge-small-zh-v1.5-int8-onnx', label: t('vector.modelOptionSmall') },
  { value: 'bge-large-zh-v1.5-int8-onnx', label: t('vector.modelOptionLarge') },
  { value: 'gte-large-zh-int8-onnx', label: t('vector.modelOptionGte') },
  { value: 'bge-large-zh-v1.5', label: t('vector.modelOptionBgeLarge') },
  { value: 'bge-small-zh-v1.5', label: t('vector.modelOptionBgeSmall') },
];

async function refreshInstalled() {
  installed.value = await createModelFileAdapter().listInstalled();
}

/** Web:目录选择(File System Access);Tauri:系统目录对话框 */
async function pickAndInstall() {
  installing.value = true;
  installMsg.value = '';
  try {
    const adapter = createModelFileAdapter();
    if (isTauriEnv()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dir = await open({ directory: true, title: t('vector.pickTitle') });
      if (!dir || typeof dir !== 'string') return;
      // 由 model.onnx 所在文件夹名推断模型 id(或要求用户先选目标模型)
      const files = await adapter.importFromDir('bge-small-zh-v1.5', dir);
      installMsg.value = t('vector.copied', { files: files.join(', ') });
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        const saved = await adapter.importFromDir('bge-small-zh-v1.5', files);
        installMsg.value = t('vector.copiedFiles', { count: saved.length });
      };
      input.click();
    }
    await refreshInstalled();
    showToast('success', t('vector.installDone'));
  } catch (e) {
    showToast('error', t('vector.installFailed', { error: e instanceof Error ? e.message : String(e) }));
  } finally {
    installing.value = false;
  }
}

function saveRemote() {
  try {
    localStorage.setItem('aijiuguan.remoteEmbedding', JSON.stringify(remote.value));
    showToast('success', t('vector.remoteSaved'));
  } catch {
    showToast('error', t('vector.saveFailed'));
  }
}

function loadRemote() {
  try {
    const raw = localStorage.getItem('aijiuguan.remoteEmbedding');
    if (raw) remote.value = { ...remote.value, ...JSON.parse(raw) };
  } catch {
    /* 忽略损坏配置 */
  }
}

onMounted(() => {
  ENABLED.value = isVectorRagEnabled();
  refreshInstalled();
  loadRemote();
});
</script>

<template>
  <section class="settings-section" aria-labelledby="vector-rag-title">
    <header class="section-header">
      <h2 id="vector-rag-title" class="section-title">
        <Icon name="cpu" :size="16" />
        <span>{{ t('vector.title') }}</span>
      </h2>
      <label class="toggle-wrap">
        <span>{{ t('vector.enable') }}</span>
        <input
          type="checkbox"
          :checked="ENABLED"
          :aria-label="t('vector.enableAria')"
          @change="setVectorRagEnabled(($event.target as HTMLInputElement).checked); ENABLED = ($event.target as HTMLInputElement).checked"
        />
      </label>
    </header>
    <p class="section-desc">
      {{ t('vector.desc') }}
    </p>

    <div class="field-row">
      <div class="field-group">
        <label class="field-label" for="vec-dyn">{{ t('vector.dynamicModel') }}</label>
        <select id="vec-dyn" v-model="dynamicModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="vec-sta">{{ t('vector.staticModel') }}</label>
        <select id="vec-sta" v-model="staticModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
    </div>

    <div class="install-box">
      <h3 class="box-title">{{ t('vector.installTitle') }}</h3>
      <p class="field-hint">
        {{ t('vector.installHint') }}
      </p>
      <button
        type="button"
        class="add-btn"
        :disabled="installing"
        @click="pickAndInstall"
      >
        {{ installing ? t('vector.installing') : t('vector.pickFolder') }}
      </button>
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

    <details class="remote-box" :open="remoteOpen" @toggle="remoteOpen = ($event.target as HTMLDetailsElement).open">
      <summary>{{ t('vector.remoteTitle') }}</summary>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label" for="rm-url">{{ t('vector.baseUrl') }}</label>
          <input id="rm-url" v-model="remote.baseUrl" class="field-input" placeholder="http://192.168.9.40:20128/v1" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-key">{{ t('vector.apiKey') }}</label>
          <input id="rm-key" v-model="remote.apiKey" class="field-input" type="password" :placeholder="t('vector.apiKeyPlaceholder')" />
        </div>
      </div>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label" for="rm-model">{{ t('vector.modelName') }}</label>
          <input id="rm-model" v-model="remote.modelName" class="field-input" placeholder="bge-large-zh-v1.5" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-path">{{ t('vector.embeddingPath') }}</label>
          <input id="rm-path" v-model="remote.embeddingPath" class="field-input" placeholder="/embeddings" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-dim">{{ t('vector.dim') }}</label>
          <input id="rm-dim" v-model.number="remote.dim" class="field-input" type="number" min="64" max="4096" />
        </div>
      </div>
      <button type="button" class="add-btn" @click="saveRemote">{{ t('vector.saveRemote') }}</button>
    </details>
  </section>
</template>

<style scoped>
.field-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.field-group {
  flex: 1;
  min-width: 180px;
}
.toggle-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.install-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--border, #333);
  border-radius: 8px;
}
.box-title {
  margin: 0 0 6px;
  font-size: 14px;
}
.install-msg {
  margin-left: 10px;
  color: var(--green, #9ece6a);
  font-size: 12px;
}
.installed-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
.installed-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border, #333);
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
  color: var(--muted-foreground, #999);
  font-size: 12px;
}
.mini-btn {
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid var(--border, #444);
  border-radius: 6px;
  background: var(--surface-secondary, #222);
  color: var(--foreground, #eee);
  cursor: pointer;
}
.mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.remote-box {
  margin-top: 14px;
}
.remote-box summary {
  cursor: pointer;
  font-weight: 500;
}
</style>