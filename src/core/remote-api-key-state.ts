/**
 * 远程向量网关 apiKey 的内存态（零依赖模块）
 *
 * 从 vector-model-manager.ts 抽离（2026-09-28 性能优化）：
 * settings store（首屏必需 chunk）只需读写此状态，但原先从 vector-model-manager
 * 导入，而该模块静态依赖 rag-benchmark / vector-model-install（→ onnxruntime-web），
 * 导致 onnxruntime(~104KB gzip) 被拖入首屏强预加载链。本模块保持零依赖以切断该链条；
 * vector-model-manager 仍 re-export，保持既有调用方与测试兼容。
 *
 * 三态语义：
 * - 'plain'    未设主密码 → 沿用 localStorage 明文（与改造前行为一致）
 * - 'unlocked' 已设且已解锁 → 使用解密后的明文
 * - 'locked'   已设但未解锁 → 不下发密钥（远程向量不可用，与 apiProfiles 语义一致）
 */
export type RemoteApiKeyState =
  | { state: 'plain' }
  | { state: 'unlocked'; key: string }
  | { state: 'locked' };

let remoteApiKeyState: RemoteApiKeyState = { state: 'plain' };

/** 由 settings store 在解锁 / 锁定 / 设置或修改主密码时调用 */
export function setRemoteApiKeyState(next: RemoteApiKeyState): void {
  remoteApiKeyState = next;
}

/** 当前内存态（供测试与调试使用） */
export function getRemoteApiKeyState(): RemoteApiKeyState {
  return remoteApiKeyState;
}
