#!/usr/bin/env node
/**
 * 临时生成器：R4-1 拆分 VectorModelPanel（1023 行）
 *
 * 目的：模板与样式**按行号精确切片**，避免 R3-3 那次"凭印象重写宿主样式"
 * 导致 css-equiv 报 38 条丢失的错误。script 部分手写（装配逻辑需要重排）。
 *
 * 用法：node scripts/tmp-split-vector.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REL = 'src/components/settings/VectorModelPanel.vue';
const raw = readFileSync(resolve(ROOT, REL), 'utf8');
const L = raw.split('\n'); // LF 文件，索引 = 行号 - 1

const slice = (a, b) => L.slice(a - 1, b).join('\n');
const seg = (arr) => arr.map(([a, b]) => slice(a, b)).join('\n');

const DRY = process.argv.includes('--dry');

/* ────────────────────────── 样式转换 ────────────────────────── */

/**
 * 把一段 scoped 样式里的每条规则包成 `<prefix> :deep(sel)`。
 * 为什么：这四个面板的公共皮肤（.field-input / .add-btn / .mini-btn / .box-title…）
 * 若各带一份，control-size 与样式重复都会失控；留宿主单点定义再 :deep() 贯穿，
 * 与 R3-3 的 `.local-model-view :deep(...)` 同一套做法。
 */
function deepify(text, prefix) {
  const out = [];
  let selBuf = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') {
      out.push(line);
      continue;
    }
    // 整行注释：原样保留（不能进 selBuf，否则会被吞成选择器的一部分）
    if (t.startsWith('/*') && t.endsWith('*/')) {
      if (selBuf.length) {
        out.push(...selBuf);
        selBuf = [];
      }
      out.push(line);
      continue;
    }
    if (/^@(media|supports|container|layer)\b/.test(t)) {
      out.push(line);
      continue;
    }
    if (t.includes('{')) {
      const head = (selBuf.length ? selBuf.join('\n') + '\n' : '') + line;
      selBuf = [];
      const idx = head.lastIndexOf('{');
      const selPart = head.slice(0, idx);
      const rest = head.slice(idx).trim();
      const indent = line.match(/^[ \t]*/)[0];
      const parts = selPart
        .split(',')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      out.push(indent + parts.map((p) => `${prefix} :deep(${p})`).join(',\n' + indent) + ' ' + rest);
      continue;
    }
    if (t === '}') {
      out.push(line);
      continue;
    }
    // 声明行：`prop: value;`（不含 `.` 开头的选择器续行）
    if (t.includes(':') && !t.startsWith('.') && !t.startsWith(',')) {
      out.push(line);
      continue;
    }
    selBuf.push(line);
  }
  if (selBuf.length) out.push(...selBuf);
  return out.join('\n');
}

/* ─────────────────────── 宿主：自身样式（不加前缀） ─────────────────────── */
const hostOwnCss = slice(651, 683);

/* ─────────────────── 宿主：共用皮肤（加前缀 + :deep） ─────────────────── */
const hostSharedCss = deepify(
  seg([
    [686, 692], // .field-label
    [693, 705], // .field-input
    [706, 713], // select.field-input
    [714, 717], // .field-input:focus-visible
    [721, 725], // .field-hint
    [732, 756], // .add-btn / hover / focus-visible
    [758, 779], // .field-row / .field-group / .toggle-wrap
    [786, 791], // .box-title
    [826, 838], // .mini-btn / :disabled
    [870, 879], // .add-btn.secondary / hover
    [954, 967], // .box-title.sub / .mini-btn.danger / hover
    [1018, 1023], // @media 640 控件字号兜底
  ]),
  '.settings-section',
);

/* ─────────────────────────── 宿主 script ─────────────────────────── */
const hostScript = `<script setup lang="ts">
/**
 * 向量检索设置(双通道 RAG)
 * - 开关:默认关闭(localStorage aijiuguan.vectorRagEnabled)
 * - 双通道模型选择(动态/静态;auto=selectVectorModel 自动:browser→bge-small)
 *
 * 装配层：四个功能区各自成组件（各自持有自己的状态与副作用），本文件只留
 * 开关 + 双通道模型选择这两处"跨区共享的输入"，避免再次长成 1023 行。
 *   VectorModelEnhanceSection  RAG 增强（自动择优 + 停用词过滤）
 *   VectorModelInstallSection  本地模型安装（目录选择 + 冒烟验证）
 *   VectorModelUserSection     用户自定义向量模型（zip / 目录 / 预扫描）
 *   VectorModelRemoteSection   线上服务器引用字段
 */
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '@/components/common/Icon.vue';
import {
  isVectorRagEnabled,
  setVectorRagEnabled,
  getRagDynamicModel,
  setRagDynamicModel,
  getRagStaticModel,
  setRagStaticModel,
} from '@/core/dual-channel-runtime';
import { useUserVectorModelStore } from '@/stores/user-vector-model';
import { t } from '@/i18n';
import VectorModelEnhanceSection from './VectorModelEnhanceSection.vue';
import VectorModelInstallSection from './VectorModelInstallSection.vue';
import VectorModelUserSection from './VectorModelUserSection.vue';
import VectorModelRemoteSection from './VectorModelRemoteSection.vue';

const ENABLED = ref(false);
const dynamicModel = ref<string>('auto');
const staticModel = ref<string>('auto');

/** 用户自定义模型也会出现在动态/静态层下拉里，故宿主也订阅 store */
const userStore = useUserVectorModelStore();

const modelOptions = computed(() => {
  const preset: Array<{ value: string; label: string }> = [
    { value: 'auto', label: t('vector.autoLabel') },
    { value: 'bge-small-zh-v1.5-int8-onnx', label: t('vector.modelOptionSmall') },
    { value: 'bge-large-zh-v1.5-int8-onnx', label: t('vector.modelOptionLarge') },
    { value: 'gte-large-zh-int8-onnx', label: t('vector.modelOptionGte') },
    { value: 'bge-large-zh-v1.5', label: t('vector.modelOptionBgeLarge') },
    { value: 'bge-small-zh-v1.5', label: t('vector.modelOptionBgeSmall') },
  ];
  // 追加用户自定义模型(用于 RAG 动态/静态层选择)
  for (const m of userStore.models) {
    preset.push({ value: m.id, label: \`\${m.name}（\${t('userModel.customTag')}）\` });
  }
  return preset;
});

onMounted(() => {
  ENABLED.value = isVectorRagEnabled();
  dynamicModel.value = getRagDynamicModel();
  staticModel.value = getRagStaticModel();
});

// 持久化 RAG 模型选择(供对话检索读取)
watch(dynamicModel, (v) => setRagDynamicModel(v));
watch(staticModel, (v) => setRagStaticModel(v));
</script>`;

/* ─────────────────────────── 宿主 template ─────────────────────────── */
const hostTemplate = `<template>
${slice(370, 411)}
    <VectorModelEnhanceSection />
    <VectorModelInstallSection />
    <VectorModelUserSection />
    <VectorModelRemoteSection />
${slice(647, 648)}`;

/* ─────────────────────────── 宿主文件 ─────────────────────────── */
const hostFile = `${hostScript}

${hostTemplate}

<style scoped>
${hostOwnCss}
\n/* ── 共用皮肤（enhance / install / user-model / remote 四个子面板同用） ──
 * 留宿主单点定义，再用 :deep() 贯穿到子组件内部。各面板各带一份会让
 * control-size 字面量与样式副本一起翻倍（同 R3-3 的 .local-model-view :deep 做法）。 */
${hostSharedCss}
</style>`;

/* ─────────────────────────── 子组件 1：RAG 增强 ─────────────────────────── */
const enhanceScript = `<script setup lang="ts">
/**
 * RAG 增强：自动择优（本地跑基准，挑 recall 最高/最快的嵌入模型）+ 停用词过滤。
 * 基准模块含 onnx 重依赖，经 loadBenchmarkMod() 动态 import，不进首屏。
 */
import { ref, computed, watch, onMounted } from 'vue';
import { isStopwordFilterEnabled, setStopwordFilterEnabled } from '@/core/stopword-filter';
import { t } from '@/i18n';

const benchmarking = ref(false);
const benchResults = ref<Array<{ modelId: string; passed: number; recall: number; latencyMs: number; error?: string }>>([]);
const benchMsg = ref('');
const stopwordFilter = ref(true);

/** 当前是否已存在择优记录(供"清除"按钮禁用态) */
const hasBest = ref(false);

/** 加载偏好(分函数避免整体静态 import 引入 onnx 重依赖) */
async function loadBenchmarkMod() {
  return import('@/core/rag-benchmark');
}

async function runBenchmark() {
  if (benchmarking.value) return;
  benchmarking.value = true;
  benchMsg.value = '';
  try {
    const mod = await loadBenchmarkMod();
    const out = await mod.runEmbeddingBenchmark();
    benchResults.value = out.results;
    if (out.best) {
      hasBest.value = true;
      benchMsg.value = t('vector.benchBest', {
        id: out.best.modelId,
        recall: (out.best.recall * 100).toFixed(0),
        ms: out.best.latencyMs.toFixed(0),
      });
    } else {
      hasBest.value = false;
      benchMsg.value = t('vector.benchNoModel');
    }
  } catch (e) {
    benchMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    benchmarking.value = false;
  }
}

async function handleClearBest() {
  const mod = await loadBenchmarkMod();
  mod.clearBestEmbeddingModel();
  benchResults.value = [];
  benchMsg.value = t('vector.benchCleared');
}

/** 表格中可选中行(recall 最高,并列取耗时短) */
const bestBenchId = computed(() => {
  const valid = benchResults.value.filter((r) => !r.error);
  if (valid.length === 0) return null;
  const b = [...valid].sort((a, b) => b.recall - a.recall || a.latencyMs - b.latencyMs)[0];
  return b ? b.modelId : null;
});
function canSelect(r: { modelId: string; error?: string }): boolean {
  return !r.error && r.modelId === bestBenchId.value;
}

watch(stopwordFilter, (v) => setStopwordFilterEnabled(v));

onMounted(() => {
  stopwordFilter.value = isStopwordFilterEnabled();
  void (async () => {
    const mod = await loadBenchmarkMod();
    hasBest.value = mod.getBestEmbeddingModel() !== null;
  })();
});
</script>`;

/* ─────────────────────────── 子组件 2：本地模型安装 ─────────────────────────── */
const installScript = `<script setup lang="ts">
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
    smokeResult.value[modelId] = \`✗ \${e instanceof Error ? e.message : String(e)}\`;
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
 * \`<input webkitdirectory>\` 是回调式的：click() 立刻返回，change 里的写库还在飞，
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
</script>`;

/* ─────────────────────────── 子组件 3：用户自定义模型 ─────────────────────────── */
const userScript = `<script setup lang="ts">
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
</script>`;

/* ─────────────────────────── 子组件 4：线上引用 ─────────────────────────── */
const remoteScript = `<script setup lang="ts">
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
</script>`;

/* ─────────────────────────── 子组件装配 ─────────────────────────── */
const subFiles = {
  'src/components/settings/VectorModelEnhanceSection.vue': {
    script: enhanceScript,
    tpl: [413, 457],
    css: [[969, 1016]],
  },
  'src/components/settings/VectorModelInstallSection.vue': {
    script: installScript,
    tpl: [459, 497],
    css: [[726, 730], [780, 785], [792, 825]],
  },
  'src/components/settings/VectorModelUserSection.vue': {
    script: userScript,
    tpl: [499, 617],
    css: [[851, 869], [880, 953]],
  },
  'src/components/settings/VectorModelRemoteSection.vue': {
    script: remoteScript,
    tpl: [619, 646],
    css: [[839, 849]],
  },
};

const writes = [['src/components/settings/VectorModelPanel.vue', hostFile]];
for (const [path, cfg] of Object.entries(subFiles)) {
  const body = `${cfg.script}

<template>
${slice(cfg.tpl[0], cfg.tpl[1])}
</template>

<style scoped>
${seg(cfg.css)}
</style>`;
  writes.push([path, body]);
}

for (const [path, body] of writes) {
  const full = resolve(ROOT, path);
  if (DRY) {
    console.log(`\n===== ${path} (${body.split('\n').length} 行) =====`);
    console.log(body.slice(0, 400) + '\n  …');
  } else {
    writeFileSync(full, body, 'utf8');
    console.log(`写入 ${path}  ${body.split('\n').length} 行`);
  }
}

if (!DRY) {
  const total = writes.reduce((n, [, b]) => n + b.split('\n').length, 0);
  console.log(`\n合计 ${total} 行（原 ${L.length} 行，Δ ${total - L.length}）`);
}
