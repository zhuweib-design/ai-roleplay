// i18n-ignore-start  // Tauri 平台集成:系统对话框标题/路径均为平台/运行时字符串,非 UI 界面文案
/**
 * Tauri 桌面端:本地磁盘模型目录扫描 + 目录导入
 *
 * 两个入口:
 * 1. 系统目录对话框选择(modelDirPicker) → 读取该目录文件并生成候选
 * 2. 预扫描固定模型目录(modelDirPrescan) → 自动列举已有模型文件夹
 *
 * 依赖 tauri-plugin-dialog / tauri-plugin-fs(动态 import,仅 Tauri 环境加载)
 */

import type { ScannedModelCandidate } from './vector-model-install';
import { findOnnxFile } from './vector-model-install';

/** 预扫描的固定模型目录(可配置多个,按存在性探测) */
export const PRESCAN_DIRS = ['../../model', 'model'];

/**
 * 系统对话框选目录 → 该目录文件清单
 * @returns null 表示用户取消
 */
export async function pickModelDirectory(): Promise<ScannedModelCandidate | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const dir = await open({ directory: true, title: '选择向量模型文件夹' });
  if (!dir || typeof dir !== 'string') return null;
  const files = await listDirFiles(dir);
  const dirName = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'model';
  return {
    dirName,
    path: dir,
    files,
    onnxFile: findOnnxFile(files),
  };
}

/**
 * 预扫描固定模型目录,列举所有含 onnx 的模型文件夹
 */
export async function prescanModelDirs(limit = 20): Promise<ScannedModelCandidate[]> {
  const fs = await import('@tauri-apps/plugin-fs');
  const results: ScannedModelCandidate[] = [];
  const seen = new Set<string>();

  for (const dir of PRESCAN_DIRS) {
    let entries: Array<{ name: string; isDirectory: boolean }> = [];
    try {
      entries = await fs.readDir(dir);
    } catch {
      continue; // 目录不存在
    }
    for (const e of entries) {
      if (!e.isDirectory || seen.has(e.name)) continue;
      seen.add(e.name);
      try {
        const files = await listDirFiles(`${dir}/${e.name}`);
        if (!findOnnxFile(files)) continue; // 无 onnx 的文件夹跳过
        results.push({ dirName: e.name, path: `${dir}/${e.name}`, files, onnxFile: findOnnxFile(files) });
        if (results.length >= limit) return results;
      } catch {
        /* 跳过不可读目录 */
      }
    }
  }
  return results;
}

/** 列出目录下文件(仅文件,递归一层) */
async function listDirFiles(dir: string): Promise<string[]> {
  const fs = await import('@tauri-apps/plugin-fs');
  const entries = await fs.readDir(dir);
  const names: string[] = [];
  for (const e of entries) {
    if (e.isDirectory) continue;
    if (e.name) names.push(e.name);
  }
  return names;
}

/** 读取磁盘模型目录的 onnx 权重为 ArrayBuffer */
export async function readDiskOnnx(path: string, fileName: string): Promise<ArrayBuffer> {
  const fs = await import('@tauri-apps/plugin-fs');
  const bytes = await fs.readFile(`${path}/${fileName}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** 读取磁盘模型目录的文本文件 */
export async function readDiskText(path: string, fileName: string): Promise<string> {
  const fs = await import('@tauri-apps/plugin-fs');
  return await fs.readTextFile(`${path}/${fileName}`);
}
// i18n-ignore-end