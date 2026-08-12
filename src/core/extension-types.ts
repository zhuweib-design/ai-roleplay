/**
 * 扩展系统架构 (F12.1, v1.1 新增)
 *
 * 业务逻辑：
 * - 扩展以 JavaScript 文件形式加载（用户上传或内置）
 * - 通过标准接口 `window.AIRoleplay.registerExtension(name, config)` 注册
 * - 扩展可注册：设置面板项、消息处理器、斜杠命令、右键菜单项
 * - 扩展运行在受限上下文中，仅通过提供的 API 访问应用数据
 * - 扩展加载失败不影响主应用运行
 *
 * 规则约束：
 * - 扩展代码以 IIFE 形式执行，注入受限的 AIRoleplayAPI 对象
 * - 扩展 capability 必须显式声明，运行时受 capability 限制
 * - 扩展不能直接访问 Vue 实例 / Pinia store / window 对象
 */

// ── 扩展能力声明 ──

/**
 * 扩展能力（capabilities）
 * 扩展必须显式声明所需能力，未声明的能力调用将被拒绝
 */
export type ExtensionCapability =
  | 'settingsPanel' // 注册设置面板项
  | 'messageProcessor' // 注册消息处理器（拦截/修改消息）
  | 'slashCommand' // 注册斜杠命令
  | 'contextMenu' // 注册右键菜单项
  | 'storage' // 访问扩展专属存储（KV）
  | 'notification'; // 显示通知

export interface ExtensionCapabilities {
  settingsPanel?: boolean;
  messageProcessor?: boolean;
  slashCommand?: boolean;
  contextMenu?: boolean;
  storage?: boolean;
  notification?: boolean;
}

// ── 扩展权限声明（T-09） ──

/**
 * 扩展权限（permissions）
 * 与 capabilities 的区别：capabilities 声明「能用哪些宿主功能」；
 * permissions 声明「需要访问哪些浏览器全局能力」。未声明即拒绝（默认拒绝）。
 */
export type ExtensionPermission = 'network' | 'dom';

export interface ExtensionPermissions {
  /** 网络访问：fetch / XMLHttpRequest / WebSocket（默认拒绝） */
  network?: boolean;
  /** DOM 访问：window / document / globalThis / localStorage / sessionStorage（默认拒绝） */
  dom?: boolean;
}

// ── 扩展点定义 ──

/** 设置面板项 */
export interface SettingsPanelItem {
  /** 唯一 id（建议前缀扩展名避免冲突） */
  id: string;
  /** 显示标题 */
  title: string;
  /** 渲染函数：返回 HTML 字符串（沙箱内 innerHTML 注入） */
  render: () => string;
  /** 保存回调（用户点击保存时触发） */
  onSave?: () => void;
}

/** 消息处理器 */
export interface MessageProcessor {
  /** 唯一 id */
  id: string;
  /** 处理时机：'beforeSend'（发送前）/ 'afterReceive'（接收后） */
  hook: 'beforeSend' | 'afterReceive';
  /**
   * 处理函数
   * - beforeSend：可修改用户输入文本，返回新文本
   * - afterReceive：可修改 AI 回复文本，返回新文本
   */
  process: (text: string, context: MessageContext) => string;
}

/** 消息上下文（提供给扩展处理器的只读上下文） */
export interface MessageContext {
  characterId: string;
  characterName: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

/** 斜杠命令 */
export interface SlashCommand {
  /** 命令名（不含 /，如 'roll' 对应 /roll） */
  name: string;
  /** 简短描述 */
  description: string;
  /** 用法示例 */
  usage?: string;
  /** 执行函数，args 为参数数组 */
  execute: (args: string[]) => SlashCommandResult;
}

/** 斜杠命令执行结果 */
export interface SlashCommandResult {
  /** 是否成功执行 */
  success: boolean;
  /** 输出消息（显示在对话区） */
  message?: string;
  /** 若需触发 AI 回复，可指定要发送的文本 */
  sendMessage?: string;
}

/** 右键菜单项 */
export interface ContextMenuItem {
  /** 唯一 id */
  id: string;
  /** 显示标题 */
  title: string;
  /** 适用上下文：'message'（消息上）/ 'input'（输入框上） */
  context: 'message' | 'input';
  /** 点击回调 */
  onClick: (payload: ContextMenuPayload) => void;
}

/** 右键菜单点击载荷 */
export interface ContextMenuPayload {
  /** 消息 id（context='message' 时） */
  messageId?: string;
  /** 选中文本 */
  selectedText?: string;
}

// ── 扩展注册配置 ──

export interface ExtensionConfig {
  /** 扩展名（唯一标识） */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 版本号（semver） */
  version: string;
  /** 作者 */
  author?: string;
  /** 描述 */
  description?: string;
  /** 能力声明 */
  capabilities: ExtensionCapabilities;
  /** T-09: 权限声明（network/dom，未声明即拒绝）；缺省视为只使用宿主 API */
  permissions?: ExtensionPermissions;
  /** 设置面板项 */
  settingsPanelItems?: SettingsPanelItem[];
  /** 消息处理器 */
  messageProcessors?: MessageProcessor[];
  /** 斜杠命令 */
  slashCommands?: SlashCommand[];
  /** 右键菜单项 */
  contextMenuItems?: ContextMenuItem[];
  /** 初始化回调（扩展加载完成后调用） */
  onInit?: (api: ExtensionHostAPI) => void;
  /** 卸载回调 */
  onUnload?: () => void;
}

// ── 扩展宿主 API（注入到扩展运行环境） ──

/**
 * 提供给扩展的 KV 存储 API（capability: 'storage'）
 */
export interface ExtensionStorageAPI {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  keys(): string[];
}

/**
 * 提供给扩展的通知 API（capability: 'notification'）
 */
export interface ExtensionNotificationAPI {
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
}

/**
 * 扩展可访问的宿主 API
 * 根据声明的 capabilities 提供，未声明的 API 为 undefined
 */
export interface ExtensionHostAPI {
  storage?: ExtensionStorageAPI;
  notification?: ExtensionNotificationAPI;
  /** 获取当前激活角色 id */
  getActiveCharacterId?: () => string | null;
}

// ── 已注册扩展运行时状态 ──

export interface RegisteredExtension {
  /** 配置（来自 registerExtension） */
  config: ExtensionConfig;
  /** 加载状态 */
  status: 'loaded' | 'error' | 'disabled';
  /** 错误信息（status='error' 时） */
  error?: string;
  /** 加载时间戳 */
  loadedAt: number;
  /** 来源（'builtin' | 'user'） */
  source: 'builtin' | 'user';
}

// ── 扩展加载错误类型 ──

export class ExtensionError extends Error {
  constructor(
    message: string,
    public code:
      | 'LOAD_FAILED'
      | 'INVALID_CONFIG'
      | 'CAPABILITY_VIOLATION'
      | 'DUPLICATE_NAME'
      | 'EXECUTION_ERROR'
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}
