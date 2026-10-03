// i18n-ignore-start  // Tauri 平台集成:仅命令名与二进制读取,无 UI 文案
/**
 * 桌面端模型文件 IPC 封装（对应 Rust `src-tauri/src/commands/model_files.rs`）
 *
 * 不使用 tauri-plugin-fs / tauri-plugin-dialog：`capabilities/default.json` 只授予
 * `core:default`（P1-5 权限收敛），插件生成的 IPC 命令会被 ACL 拒绝。自定义命令经
 * `invoke_handler` 注册，不占插件权限面；路径白名单在 Rust 侧校验。
 */

export interface ModelDirEntry {
  name: string;
  isDir: boolean;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 动态 import：非 Tauri 环境下 @tauri-apps/api/core 顶层加载会抛错
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/**
 * 二进制 IPC 返回值归一化。
 *
 * 判定顺序刻意不用 `instanceof ArrayBuffer`：jsdom 环境下的 ArrayBuffer 与
 * Node realm 创建的不是同一构造器，instanceof 会漏判（`ArrayBuffer.isView`
 * 走内部槽，跨 realm 仍正确）。
 */
function toBytes(raw: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (ArrayBuffer.isView(raw)) {
    const view = raw as Uint8Array;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (typeof (raw as ArrayBuffer).byteLength === 'number') {
    return new Uint8Array(raw as ArrayBuffer);
  }
  return Uint8Array.from(raw as number[]);
}

async function readBytes(cmd: string, args: Record<string, unknown>): Promise<Uint8Array> {
  const raw = await invoke<ArrayBuffer | Uint8Array | number[]>(cmd, args);
  return toBytes(raw);
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  // toBytes 已保证底层是独占的 ArrayBuffer，此处仅做类型收窄
  return bytes.buffer as ArrayBuffer;
}

export const modelFsIpc = {
  /** 系统目录对话框；用户取消返回 null。title 为 native 对话框文案（走 i18n） */
  async pickDir(title?: string): Promise<string | null> {
    return (await invoke<string | null>('pick_model_dir', { title: title ?? '' })) ?? null;
  },

  async listDir(path: string): Promise<ModelDirEntry[]> {
    return invoke<ModelDirEntry[]>('list_model_dir', { path });
  },

  /** 读取磁盘绝对/相对路径下的文件（路径必须落在 Rust 侧允许根目录内） */
  async readFile(path: string): Promise<ArrayBuffer> {
    return toBuffer(await readBytes('read_model_file', { path }));
  },

  async readText(path: string): Promise<string> {
    return new TextDecoder('utf-8').decode(await readBytes('read_model_file', { path }));
  },

  /** 按模型 id + 文件名读取（项目 model/ 优先，appData/model 兜底） */
  async readModel(modelId: string, fileName: string): Promise<ArrayBuffer> {
    return toBuffer(await readBytes('read_model_by_id', { model: modelId, file: fileName }));
  },

  async readModelText(modelId: string, fileName: string): Promise<string> {
    return new TextDecoder('utf-8').decode(
      await readBytes('read_model_by_id', { model: modelId, file: fileName })
    );
  },

  /** 复制 model.onnx / config.json 到 appData/model/<id>/，返回已复制文件名 */
  async copyFiles(sourceDir: string, modelId: string): Promise<string[]> {
    return invoke<string[]>('copy_model_files', { source: sourceDir, model: modelId });
  },

  async hasModel(modelId: string): Promise<boolean> {
    return invoke<boolean>('has_model_files', { model: modelId });
  },

  async listInstalled(): Promise<string[]> {
    return invoke<string[]>('list_installed_models');
  },
};
// i18n-ignore-end
