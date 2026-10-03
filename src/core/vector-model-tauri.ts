// i18n-ignore-start  // Tauri 平台集成:系统对话框标题/路径均为平台/运行时字符串,非 UI 界面文案
/**
 * Tauri 桌面端:本地磁盘模型目录扫描 + 目录导入
 *
 * 两个入口:
 * 1. 系统目录对话框选择(pickModelDirectory) → 读取该目录文件并生成候选
 * 2. 预扫描固定模型目录(prescanModelDirs) → 自动列举已有模型文件夹
 *
 * 文件访问经自定义 Rust 命令(见 model-fs-ipc.ts),不再直连 tauri-plugin-fs /
 * plugin-dialog —— 二者生成的 IPC 命令受 capabilities ACL 管束,而本应用只授予
 * core:default(P1-5 权限收敛),直连会被拒绝。
 */

import type { ScannedModelCandidate } from './vector-model-install';
import { findOnnxFile } from './vector-model-install';
import { modelFsIpc } from './model-fs-ipc';

/** 预扫描的固定模型目录(与 Rust 侧 PROJECT_MODEL_RELS 对应,按存在性探测) */
export const PRESCAN_DIRS = ['../../model', 'model'];

/**
 * 系统对话框选目录 → 该目录文件清单
 * @param title native 对话框文案（走 i18n）
 * @returns null 表示用户取消
 */
export async function pickModelDirectory(title?: string): Promise<ScannedModelCandidate | null> {
  const dir = await modelFsIpc.pickDir(title);
  if (!dir) return null;
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
  const results: ScannedModelCandidate[] = [];
  const seen = new Set<string>();

  for (const dir of PRESCAN_DIRS) {
    let entries: Array<{ name: string; isDir: boolean }>;
    try {
      entries = await modelFsIpc.listDir(dir);
    } catch {
      continue; // 目录不存在
    }
    for (const e of entries) {
      if (!e.isDir || seen.has(e.name)) continue;
      seen.add(e.name);
      const subDir = `${dir}/${e.name}`;
      try {
        const files = await listDirFiles(subDir);
        if (!findOnnxFile(files)) continue; // 无 onnx 的文件夹跳过
        results.push({ dirName: e.name, path: subDir, files, onnxFile: findOnnxFile(files) });
        if (results.length >= limit) return results;
      } catch {
        /* 跳过不可读目录 */
      }
    }
  }
  return results;
}

/** 列出目录下的文件名(不含子目录) */
async function listDirFiles(dir: string): Promise<string[]> {
  const entries = await modelFsIpc.listDir(dir);
  return entries.filter((e) => !e.isDir && e.name).map((e) => e.name);
}

/** 读取磁盘模型目录的 onnx 权重为 ArrayBuffer */
export async function readDiskOnnx(path: string, fileName: string): Promise<ArrayBuffer> {
  return modelFsIpc.readFile(`${path}/${fileName}`);
}

/** 读取磁盘模型目录的文本文件 */
export async function readDiskText(path: string, fileName: string): Promise<string> {
  return modelFsIpc.readText(`${path}/${fileName}`);
}
// i18n-ignore-end
