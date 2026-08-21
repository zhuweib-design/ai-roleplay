/**
 * 自定义向量模型安装与注册 (自定义添加本地模型)
 *
 * 与预置清单(VECTOR_MODELS/model-file-adapter)分离的独立命名空间,
 * 支持:
 * - Web:上传 ZIP 压缩包,解压多文件存入 IndexedDB
 * - Tauri:选择本地磁盘目录(系统对话框)或预扫描固定模型目录自动列举
 * - 多文件自由命名(model_int8.onnx / tokenizer.json / vocab.txt 等)
 * - 元数据:名称(唯一)、文件清单、上传时间、来源、是否"新"
 *
 * 约定目录结构:
 *   model/<userModelId>/<files...>
 * 用户模型 id: user-<ts>-<slug>
 */

import { unzipSync } from 'fflate';
import type { VectorModelId } from './vector-model-manager';

// ── 类型 ──

/** 用户自定义向量模型来源 */
export type UserModelSource = 'zip' | 'dir' | 'scanned';

/** 用户自定义向量模型元数据(持久化) */
export interface UserVectorModel {
  /** 唯一 id: user-<ts>-<slug> */
  id: string;
  /** 用户显示名称(唯一,不可重复) */
  name: string;
  /** 来源 */
  source: UserModelSource;
  /** 来源路径/原始文件名(zip 文件名 或 目录路径) */
  sourcePath: string;
  /** 上传/登记时间(ISO) */
  createdAt: string;
  /** 文件清单(相对目录的文件名,不含 id 前缀) */
  files: string[];
  /** 是否标记为"新"(最近上传/登记,未查看) */
  isNew: boolean;
  /** 输出维度(由 config.json 解析;0=未知) */
  dim: number;
}

/** 单次扫描/解析到的候选模型 */
export interface ScannedModelCandidate {
  /** 目录名(用作默认 id/名称) */
  dirName: string;
  /** 路径(目录来源时) */
  path: string;
  /** 识别到的 onnx 文件(可能无) */
  onnxFile?: string;
  /** 该目录下文件清单 */
  files: string[];
}

const UID_PREFIX = 'user-';

/** 生成唯一的用户模型 id: user-<ts>-<slug> */
export function makeUserModelId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'model';
  return `${UID_PREFIX}${Date.now()}-${slug}`;
}

/** 判断是否为用户自定义模型 id */
export function isUserVectorModelId(id: string): boolean {
  return id.startsWith(UID_PREFIX);
}

/**
 * 从 ZIP 压缩包字节中提取文件清单
 * @param data 压缩包字节
 * @returns Map<文件名, Uint8Array>(仅文件,忽略目录项)
 */
export function extractZipFiles(data: ArrayBuffer): Map<string, Uint8Array> {
  const zipped = unzipSync(new Uint8Array(data));
  const out = new Map<string, Uint8Array>();
  for (const [name, content] of Object.entries(zipped)) {
    // 跳过目录项
    if (name.endsWith('/')) continue;
    // 仅取顶层或扁平化:去掉可能的包根目录层
    out.set(normalizeZipPath(name), content as Uint8Array);
  }
  return out;
}

/**
 * 归一化 zip 内路径:去掉常见包根目录前缀
 * (如 my-model/model.onnx → model.onnx;根即文件则原样)
 */
function normalizeZipPath(name: string): string {
  const parts = name.split('/').filter((p) => p.length > 0);
  if (parts.length <= 1) return parts[0] ?? name;
  // 若首段是唯一目录且其后是文件,去掉首段(包根);否则保留相对路径
  // 简单策略:取所有剩余段,若出现多级目录保留
  return parts.slice(1).join('/');
}

/** 从文件清单中识别 onnx 权重文件 */
export function findOnnxFile(files: string[]): string | undefined {
  return files.find((f) => /\.onnx$/i.test(f));
}

/** 解析 config.json 中的维度(如果有) */
export function parseConfigDim(text: string | null | undefined): number {
  if (!text) return 0;
  try {
    const cfg = JSON.parse(text) as { hidden_size?: number; dim?: number };
    return typeof cfg.hidden_size === 'number' ? cfg.hidden_size : typeof cfg.dim === 'number' ? cfg.dim : 0;
  } catch {
    return 0;
  }
}

/** 生成候选模型 id 列表用的默认名称(从目录名/文件名去后缀) */
export function trimModelName(raw: string): string {
  return raw.replace(/\.zip$/i, '').replace(/[_-]+$/g, '');
}

export type { VectorModelId };