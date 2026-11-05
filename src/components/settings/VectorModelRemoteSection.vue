<script setup lang="ts">
/**
 * 线上服务器引用字段（persist aijiuguan.remoteEmbedding）。
 * P1-4：apiKey 已设主密码时加密落盘、解密回填（与 apiProfiles 的透明加密语义一致）。
 */
import { ref, onMounted } from 'vue';
import { showToast } from '@/utils/toast-service';
import { useSettingsStore } from '@/stores/settings';
import { t } from '@/i18n';

// P1-4：远程向量密钥需随主密码加密/解密，故引入 settings store
const settingsStore = useSettingsStore();

const remoteOpen = ref(false);
const remote = ref({
  baseUrl: '',
  apiKey: '',
  modelName: '',
  embeddingPath: '/embeddings',
  dim: 1024,
});

async function saveRemote() {
  try {
    // P1-4：已设主密码时加密 apiKey 后再落盘；未设主密码则保持明文
    // （与 apiProfiles 的透明加密语义一致：内存明文、持久化加密）
    const payload = {
      ...remote.value,
      apiKey: await settingsStore.encryptRemoteSecret(remote.value.apiKey),
    };
    localStorage.setItem('aijiuguan.remoteEmbedding', JSON.stringify(payload));
    showToast('success', t('vector.remoteSaved'));
  } catch {
    showToast('error', t('vector.saveFailed'));
  }
}

async function loadRemote() {
  try {
    const raw = localStorage.getItem('aijiuguan.remoteEmbedding');
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<typeof remote.value>;
    // P1-4：已加密的 apiKey 需解密后回填表单；未解锁时返回空串（不回填密文）
    const apiKey = await settingsStore.decryptRemoteSecret(String(saved.apiKey ?? ''));
    remote.value = { ...remote.value, ...saved, apiKey };
  } catch {
    /* 忽略损坏配置 */
  }
}

onMounted(() => {
  void loadRemote();
});
</script>

<template>
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
</template>

<style scoped>
.remote-box {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}
.remote-box summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--foreground);
}
</style>