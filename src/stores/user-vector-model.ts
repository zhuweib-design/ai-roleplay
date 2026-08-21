/**
 * 用户自定义向量模型 Store
 *
 * 职责:
 * - 从 IndexedDB 加载/持久化用户模型元数据
 * - zip 上传(Web):解压 → 写 IndexedDB → 登记
 * - 本地目录(Tauri):系统对话框选择 or 预扫描 → 复制/登记
 * - 名称唯一性校验
 * - 删除模型
 * - 「新」标签:登记时 isNew=true,查看后清除
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  extractZipFiles,
  makeUserModelId,
  trimModelName,
  findOnnxFile,
  parseConfigDim,
  isUserVectorModelId,
  type UserVectorModel,
  type UserModelSource,
} from '@/core/vector-model-install';
import {
  loadUserModelMeta,
  saveUserModelMeta,
  addUserModelMeta,
  writeUserModelFiles,
  readUserModelText,
  deleteUserModel,
} from '@/core/vector-model-storage';
import { isTauriEnv } from '@/core/model-file-adapter';
import { t } from '@/i18n';

function createDefaultMeta(id: string, name: string, source: UserModelSource, sourcePath: string, files: string[]): UserVectorModel {
  return {
    id,
    name,
    source,
    sourcePath,
    createdAt: new Date().toISOString(),
    files,
    isNew: true,
    dim: 0,
  };
}

export const useUserVectorModelStore = defineStore('userVectorModel', () => {
  const models = ref<UserVectorModel[]>([]);
  const loaded = ref(false);
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  /** 全部已登记模型(含预置? 仅用户自定义) */
  const userModels = computed(() => models.value);

  /** 是否有重名(排除自身 id) */
  function isNameTaken(name: string, excludeId?: string): boolean {
    const n = name.trim();
    return models.value.some((m) => m.id !== excludeId && m.name === n);
  }

  /** 加载元数据 */
  async function load(): Promise<void> {
    try {
      models.value = await loadUserModelMeta();
      loaded.value = true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
    }
  }

  /** 清除「新」标签 */
  async function markViewed(id: string): Promise<void> {
    const m = models.value.find((x) => x.id === id);
    if (!m || !m.isNew) return;
    m.isNew = false;
    await saveUserModelMeta(models.value);
  }

  /**
   * Web:ZIP 压缩包上传
   * @param file 选择的 .zip
   * @param name 模型显示名称(留空用文件名,去掉 .zip)
   * @returns 新模型元数据;失败抛错
   */
  async function uploadFromZip(file: File, name?: string): Promise<UserVectorModel> {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new Error(t('userModel.errNotZip'));
    }
    const fileName = trimModelName(file.name);
    let finalName = (name ?? fileName).trim();
    if (!finalName) finalName = fileName;
    if (isNameTaken(finalName)) {
      throw new Error(t('userModel.errNameExists', { name: finalName }));
    }

    // 解压
    const data = await file.arrayBuffer();
    const files = extractZipFiles(data);
    if (files.size === 0) throw new Error(t('userModel.errEmptyZip'));
    const fileNames = [...files.keys()];
    const onnx = findOnnxFile(fileNames);
    if (!onnx) throw new Error(t('userModel.errNoOnnx'));

    // 写文件
    const id = makeUserModelId(finalName);
    const nameMap = new Map<string, Uint8Array>();
    for (const [fname, content] of files) {
      // 避免路径穿越:仅存文件名
      const safe = fname.replace(/\.\.\//g, '').split('/').pop() ?? fname;
      nameMap.set(safe, content);
    }
    await writeUserModelFiles(id, nameMap);

    // 解析维度(尝试 config.json)
    let dim = 0;
    const cfg = nameMap.get('config.json') ?? nameMap.get('configuration.json');
    if (cfg) {
      try {
        dim = parseConfigDim(new TextDecoder('utf-8').decode(cfg));
      } catch {
        dim = 0;
      }
    }

    const meta = createDefaultMeta(id, finalName, 'zip', file.name, [...nameMap.keys()]);
    meta.dim = dim;
    await addUserModelMeta(meta);
    models.value = await loadUserModelMeta();
    return meta;
  }

  /**
   * Tauri:登记本地磁盘目录为模型
   * @param candidate 目录候选(含路径/文件清单)
   * @param name 显示名称(默认目录名)
   */
  async function registerFromDir(candidate: { dirName: string; path: string; files: string[] }, name?: string): Promise<UserVectorModel> {
    const finalName = (name ?? candidate.dirName).trim();
    if (!finalName) throw new Error(t('userModel.errNameRequired'));
    if (isNameTaken(finalName)) {
      throw new Error(t('userModel.errNameExists', { name: finalName }));
    }
    const onnx = findOnnxFile(candidate.files);
    if (!onnx) throw new Error(t('userModel.errNoOnnx'));
    const id = makeUserModelId(finalName);
    // 复制文件到 IndexedDB(统一加载)
    const { writeUserModelFiles } = await import('@/core/vector-model-storage');
    const nameMap = new Map<string, Uint8Array>();
    // 从磁盘复制
    const { readDiskOnnx, readDiskText } = await import('@/core/vector-model-tauri');
    for (const fname of candidate.files) {
      try {
        if (/\.(onnx|bin|safetensors)$/i.test(fname)) {
          const buf = await readDiskOnnx(candidate.path, fname);
          nameMap.set(fname, new Uint8Array(buf));
        } else if (fname.length < 5 * 1024 * 1024) {
          const text = await readDiskText(candidate.path, fname);
          nameMap.set(fname, new Uint8Array(new TextEncoder().encode(text)));
        }
      } catch {
        /* 跳过不可读文件 */
      }
    }
    if (nameMap.size === 0) throw new Error(t('userModel.errNoOnnx'));
    await writeUserModelFiles(id, nameMap);

    let dim = 0;
    const cfgName = nameMap.has('config.json') ? 'config.json' : nameMap.has('configuration.json') ? 'configuration.json' : undefined;
    if (cfgName) dim = parseConfigDim(new TextDecoder('utf-8').decode(nameMap.get(cfgName)!));

    const meta = createDefaultMeta(id, finalName, 'dir', candidate.path, [...nameMap.keys()]);
    meta.dim = dim;
    await addUserModelMeta(meta);
    models.value = await loadUserModelMeta();
    return meta;
  }

  /** 删除模型 */
  async function remove(id: string): Promise<void> {
    await deleteUserModel(id);
    models.value = await loadUserModelMeta();
  }

  /** 读取某模型文件文本(config.json / tokenizer 等) */
  async function readModelText(id: string, fileName: string): Promise<string> {
    return readUserModelText(id, fileName);
  }

  function clearError(): void {
    lastError.value = null;
  }
  function clearInfo(): void {
    lastInfo.value = null;
  }

  return {
    models,
    userModels,
    loaded,
    lastError,
    lastInfo,
    isTauri: isTauriEnv,
    isNameTaken,
    isUserModel: isUserVectorModelId,
    load,
    markViewed,
    uploadFromZip,
    registerFromDir,
    remove,
    readModelText,
    clearError,
    clearInfo,
  };
});