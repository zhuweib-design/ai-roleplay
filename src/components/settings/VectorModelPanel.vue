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
  smokeResult.value[modelId] = '加载中…';
  try {
    const { OnnxEmbeddingProvider } = await import('@/core/onnx-embedding-provider');
    const provider = new OnnxEmbeddingProvider({
      modelId,
      adapter: createModelFileAdapter(),
    });
    const t0 = performance.now();
    const v = await provider.embed('冒烟测试:星陨之剑的封印');
    const ms = (performance.now() - t0).toFixed(0);
    smokeResult.value[modelId] = `✓ ${v.dim} 维,${ms}ms`;
    showToast('success', `${modelId} 推理正常`);
  } catch (e) {
    smokeResult.value[modelId] = `✗ ${e instanceof Error ? e.message : String(e)}`;
    showToast('error', `${modelId} 验证失败`);
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
  { value: 'auto', label: '自动(浏览器→bge-small-int8)' },
  { value: 'bge-small-zh-v1.5-int8-onnx', label: 'bge-small-int8-onnx(512 维,92MB,浏览器推荐)' },
  { value: 'bge-large-zh-v1.5-int8-onnx', label: 'bge-large-int8-onnx(1024 维,311MB,桌面)' },
  { value: 'gte-large-zh-int8-onnx', label: 'gte-large-zh-int8-onnx(1024 维,312MB,动态层推荐)' },
  { value: 'bge-large-zh-v1.5', label: 'bge-large-zh-v1.5(需导出 ONNX)' },
  { value: 'bge-small-zh-v1.5', label: 'bge-small-zh-v1.5(需导出 ONNX)' },
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
      const dir = await open({ directory: true, title: '选择模型文件夹(model.onnx)' });
      if (!dir || typeof dir !== 'string') return;
      // 由 model.onnx 所在文件夹名推断模型 id(或要求用户先选目标模型)
      const files = await adapter.importFromDir('bge-small-zh-v1.5', dir);
      installMsg.value = `已复制: ${files.join(', ')}`;
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        const saved = await adapter.importFromDir('bge-small-zh-v1.5', files);
        installMsg.value = `已复制 ${saved.length} 个文件(IndexedDB)`;
      };
      input.click();
    }
    await refreshInstalled();
    showToast('success', '模型安装完成');
  } catch (e) {
    showToast('error', `安装失败: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    installing.value = false;
  }
}

function saveRemote() {
  try {
    localStorage.setItem('aijiuguan.remoteEmbedding', JSON.stringify(remote.value));
    showToast('success', '线上模型配置已保存');
  } catch {
    showToast('error', '保存失败');
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
        <span>向量检索(双通道 RAG)</span>
      </h2>
      <label class="toggle-wrap">
        <span>启用</span>
        <input
          type="checkbox"
          :checked="ENABLED"
          aria-label="启用向量检索"
          @change="setVectorRagEnabled(($event.target as HTMLInputElement).checked); ENABLED = ($event.target as HTMLInputElement).checked"
        />
      </label>
    </header>
    <p class="section-desc">
      动态层(记忆/情绪/短对话)每轮检索;静态层(世界观/角色设定)按需触发。注入仅进动态段,不影响前缀缓存命中率。
    </p>

    <div class="field-row">
      <div class="field-group">
        <label class="field-label" for="vec-dyn">动态层模型(常驻)</label>
        <select id="vec-dyn" v-model="dynamicModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="vec-sta">静态层模型(按需加载)</label>
        <select id="vec-sta" v-model="staticModel" class="field-input">
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
    </div>

    <div class="install-box">
      <h3 class="box-title">本地模型安装</h3>
      <p class="field-hint">
        选择包含 model.onnx 与 config.json 的文件夹,系统复制到 model/&lt;模型id&gt;/
      </p>
      <button
        type="button"
        class="add-btn"
        :disabled="installing"
        @click="pickAndInstall"
      >
        {{ installing ? '安装中…' : '选择模型文件夹' }}
      </button>
      <span v-if="installMsg" class="install-msg">{{ installMsg }}</span>
      <ul v-if="installed.length" class="installed-list" aria-label="已安装模型">
        <li v-for="id in installed" :key="id" class="installed-item">
          <div class="installed-info">
            <span class="installed-name">{{ id }}</span>
            <span class="installed-meta">
              {{ VECTOR_MODELS[id]?.dim ?? '?' }} 维 ·
              {{ VECTOR_MODELS[id]?.browserSafe ? '浏览器可用' : '桌面' }} ·
              {{ VECTOR_MODELS[id]?.role === 'dynamic' ? '动态层' : '静态层' }}
            </span>
          </div>
          <button
            type="button"
            class="mini-btn"
            :disabled="testingModel !== null"
            @click="runSmoke(id)"
          >
            {{ testingModel === id ? '验证中…' : '验证' }}
          </button>
          <span v-if="smokeResult[id]" class="install-msg">{{ smokeResult[id] }}</span>
        </li>
      </ul>
      <p v-else class="field-hint">未安装本地模型(未安装时检索自动跳过,不阻断对话)</p>
    </div>

    <details class="remote-box" :open="remoteOpen" @toggle="remoteOpen = ($event.target as HTMLDetailsElement).open">
      <summary>线上服务器引用(预留)</summary>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label" for="rm-url">Base URL(含 /v1)</label>
          <input id="rm-url" v-model="remote.baseUrl" class="field-input" placeholder="http://192.168.9.40:20128/v1" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-key">API Key</label>
          <input id="rm-key" v-model="remote.apiKey" class="field-input" type="password" placeholder="可选" />
        </div>
      </div>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label" for="rm-model">模型名</label>
          <input id="rm-model" v-model="remote.modelName" class="field-input" placeholder="bge-large-zh-v1.5" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-path">嵌入端点</label>
          <input id="rm-path" v-model="remote.embeddingPath" class="field-input" placeholder="/embeddings" />
        </div>
        <div class="field-group">
          <label class="field-label" for="rm-dim">维度</label>
          <input id="rm-dim" v-model.number="remote.dim" class="field-input" type="number" min="64" max="4096" />
        </div>
      </div>
      <button type="button" class="add-btn" @click="saveRemote">保存线上配置</button>
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