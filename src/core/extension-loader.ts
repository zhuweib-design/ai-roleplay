/**
 * 扩展加载器 (F12.1)
 *
 * 职责：
 * 1. 加载扩展 JS 代码（用户上传或内置）
 * 2. 提供受限的运行环境（IIFE + 注入 AIRoleplayAPI）
 * 3. 通过 registerExtension 标准接口接收扩展注册
 * 4. 管理扩展生命周期（load / unload / reload）
 * 5. 按 capability 校验扩展调用权限
 *
 * 规则约束：
 * - 扩展加载失败不影响主应用运行（捕获错误并记录到 status）
 * - 扩展代码以 new Function 形式执行（不污染全局）
 * - 未声明 capability 的扩展调用相应 API 时抛 CapabilityViolation
 * - 扩展 name 唯一，重名加载时抛 DuplicateName
 *
 * 安全模型（重要）：
 * - 扩展代码经词法遮蔽运行（window/fetch/sessionStorage 等形参遮蔽），
 *   源码及其回调闭包词法上无法直接引用全局逃逸通道（深度防御）。
 * - T-09: 权限门禁 —— 未在 loadExtension 的 permissions 中授予的全局能力
 *   （network: fetch/XHR/WebSocket; dom: window/document/globalThis/localStorage 等）
 *   注入「拒绝守卫函数」，调用即抛 CAPABILITY_VIOLATION（默认拒绝）。
 *   授权的能力透传真实全局。守卫仅拦截函数调用式访问，
 *   属性读取式逃逸（如 window.someProp）不在本层覆盖范围。
 * - eval/new Function 构造器可绕过遮蔽，且回调逃逸后与宿主同权限 ——
 *   故扩展按【需授权 + 可审计】模型对待（比 SillyTavern 的完全信任收紧一层）：
 *   默认零权限、按需授予、错误信息可诊断；社区市场下载的扩展默认不自动执行。
 *   真正的隔离（Worker/iframe 沙箱 + 异步 API 重构）列为架构演进项（ponytail）。
 */

import type {
  ExtensionConfig,
  ExtensionHostAPI,
  RegisteredExtension,
  MessageProcessor,
  SlashCommand,
  ContextMenuItem,
  SettingsPanelItem,
  MessageContext,
  ExtensionPermissions,
} from './extension-types';
import { ExtensionError } from './extension-types';

// ── 扩展加载选项 ──

export interface LoadExtensionOptions {
  /** 扩展源码（JS 字符串） */
  source: string;
  /** 来源 */
  sourceType: 'builtin' | 'user';
  /** 扩展名（覆盖源码中声明的 name，可选） */
  overrideName?: string;
  /** T-09: 授予的权限（安装侧声明，未授予的全局能力调用即拒绝） */
  permissions?: ExtensionPermissions;
}

// ── 加载结果 ──

export interface LoadResult {
  success: boolean;
  extensionName?: string;
  error?: string;
  errorCode?: ExtensionError['code'];
}

// ── 扩展注册表（单例） ──

class ExtensionRegistry {
  private extensions = new Map<string, RegisteredExtension>();
  private hostAPIs = new Map<string, ExtensionHostAPI>();
  private storageData = new Map<string, Map<string, unknown>>();

  /**
   * 注册扩展（由扩展代码调用）
   */
  registerExtension(config: ExtensionConfig): void {
    // 校验配置
    this.validateConfig(config);

    // 检查重名
    if (this.extensions.has(config.name)) {
      throw new ExtensionError(
        `扩展名「${config.name}」已被注册`,
        'DUPLICATE_NAME'
      );
    }

    // 构建宿主 API（按 capability 注入）
    const hostAPI = this.buildHostAPI(config);
    this.hostAPIs.set(config.name, hostAPI);

    // 调用 onInit（如果声明了）
    if (config.onInit) {
      try {
        config.onInit(hostAPI);
      } catch (err) {
        throw new ExtensionError(
          `扩展「${config.name}」初始化失败：${err instanceof Error ? err.message : String(err)}`,
          'EXECUTION_ERROR'
        );
      }
    }

    const registered: RegisteredExtension = {
      config,
      status: 'loaded',
      loadedAt: Date.now(),
      source: 'user',
    };
    this.extensions.set(config.name, registered);
  }

  /**
   * 校验扩展配置
   */
  private validateConfig(config: ExtensionConfig): void {
    if (!config || typeof config !== 'object') {
      throw new ExtensionError('配置无效：必须为对象', 'INVALID_CONFIG');
    }
    if (typeof config.name !== 'string' || config.name.trim() === '') {
      throw new ExtensionError('配置无效：name 必填', 'INVALID_CONFIG');
    }
    if (typeof config.displayName !== 'string' || config.displayName.trim() === '') {
      throw new ExtensionError('配置无效：displayName 必填', 'INVALID_CONFIG');
    }
    if (typeof config.version !== 'string' || config.version.trim() === '') {
      throw new ExtensionError('配置无效：version 必填', 'INVALID_CONFIG');
    }
    if (!config.capabilities || typeof config.capabilities !== 'object') {
      throw new ExtensionError('配置无效：capabilities 必填', 'INVALID_CONFIG');
    }

    // 校验注册的扩展点与 capability 一致性
    this.validateExtensionPoint(
      config,
      'settingsPanelItems',
      config.capabilities.settingsPanel,
      'settingsPanel'
    );
    this.validateExtensionPoint(
      config,
      'messageProcessors',
      config.capabilities.messageProcessor,
      'messageProcessor'
    );
    this.validateExtensionPoint(
      config,
      'slashCommands',
      config.capabilities.slashCommand,
      'slashCommand'
    );
    this.validateExtensionPoint(
      config,
      'contextMenuItems',
      config.capabilities.contextMenu,
      'contextMenu'
    );
  }

  private validateExtensionPoint<K extends keyof ExtensionConfig>(
    config: ExtensionConfig,
    key: K,
    capability: boolean | undefined,
    capabilityName: string
  ): void {
    const items = config[key] as unknown[] | undefined;
    if (items && items.length > 0 && !capability) {
      throw new ExtensionError(
        `配置无效：注册了 ${key} 但未声明 capability「${capabilityName}」`,
        'CAPABILITY_VIOLATION'
      );
    }
  }

  /**
   * 构建宿主 API（按 capability 注入）
   */
  private buildHostAPI(config: ExtensionConfig): ExtensionHostAPI {
    const caps = config.capabilities;
    const api: ExtensionHostAPI = {};

    if (caps.storage) {
      // 为每个扩展初始化独立的 KV 存储
      if (!this.storageData.has(config.name)) {
        this.storageData.set(config.name, new Map());
      }
      const store = this.storageData.get(config.name)!;
      api.storage = {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => store.set(key, value),
        remove: (key: string) => store.delete(key),
        keys: () => Array.from(store.keys()),
      };
    }

    if (caps.notification) {
      api.notification = {
        info: (_msg: string) => {
          // 通知暂存（后续可接入宿主 Toast 队列）
        },
        success: (_msg: string) => {
          // 通知暂存
        },
        error: (_msg: string) => {
          // 通知暂存
        },
      };
    }

    return api;
  }

  /**
   * 加载扩展 JS 源码
   */
  async loadExtension(options: LoadExtensionOptions): Promise<LoadResult> {
    const { source, sourceType } = options;

    if (typeof source !== 'string' || source.trim() === '') {
      return {
        success: false,
        error: '扩展源码为空',
        errorCode: 'LOAD_FAILED',
      };
    }

    // 捕获 registerExtension 调用
    const self = this;
    // 显式类型标注避免 TypeScript 控制流分析将闭包赋值后的值推断为 null
    let capturedName: string | null = null;

    // T-09: 权限守卫 —— 权限由 loadExtension 的 options.permissions 授予（安装侧声明，
    // 类似浏览器扩展清单）；未授予的全局能力注入「拒绝守卫」，调用即抛明确错误（默认拒绝）。
    const granted = options.permissions ?? {};
    const has = (p: keyof ExtensionPermissions) => granted[p] === true;
    const denied = (target: string): (() => never) => () => {
      throw new ExtensionError(
        `扩展「${capturedName ?? '未知'}」调用了 ${target},但未获得对应权限。` +
          '请在加载扩展时授予 network/dom 权限',
        'CAPABILITY_VIOLATION'
      );
    };

    // 构建受限的注册 API（注入到扩展运行环境）
    const registerApi = {
      registerExtension: (config: ExtensionConfig) => {
        const finalConfig = options.overrideName
          ? { ...config, name: options.overrideName }
          : config;
        capturedName = finalConfig.name;
        self.registerExtension(finalConfig);
      },
    };

    try {
      // 使用 new Function 在受限作用域中执行扩展代码
      // 扩展代码通过 AIRoleplay.registerExtension 注册
      // 词法遮蔽:全局引用解析到守卫形参 —— 已授权则透传真实全局,未授权则调用报错
      // 参数顺序:window/document/fetch/sessionStorage/localStorage/globalThis/XMLHttpRequest/WebSocket
      const cap = has('dom');
      const net = has('network');
      const factory = new Function(
        'AIRoleplay',
        'window',
        'document',
        'fetch',
        'sessionStorage',
        'localStorage',
        'globalThis',
        'XMLHttpRequest',
        'WebSocket',
        `"use strict";\n${source}`
      );
      factory(
        registerApi,
        cap ? window : denied('window'),
        cap ? document : denied('document'),
        net ? fetch : denied('fetch'),
        cap ? sessionStorage : denied('sessionStorage'),
        cap ? localStorage : denied('localStorage'),
        cap ? globalThis : denied('globalThis'),
        net ? XMLHttpRequest : denied('XMLHttpRequest'),
        net ? WebSocket : denied('WebSocket')
      );

      if (!capturedName) {
        return {
          success: false,
          error: '扩展代码未调用 registerExtension',
          errorCode: 'LOAD_FAILED',
        };
      }

      // 更新 source 标记
      const registered = this.extensions.get(capturedName);
      if (registered) {
        (registered as RegisteredExtension).source = sourceType;
      }

      return {
        success: true,
        extensionName: capturedName,
      };
    } catch (err) {
      const code =
        err instanceof ExtensionError ? err.code : 'LOAD_FAILED';
      const message =
        err instanceof ExtensionError
          ? err.message
          : `加载扩展失败：${err instanceof Error ? err.message : String(err)}`;
      return {
        success: false,
        error: message,
        errorCode: code,
      };
    }
  }

  /**
   * 卸载扩展
   */
  unloadExtension(name: string): boolean {
    const ext = this.extensions.get(name);
    if (!ext) return false;
    try {
      if (ext.config.onUnload) {
        ext.config.onUnload();
      }
    } catch {
      // 卸载失败不阻塞移除
    }
    this.extensions.delete(name);
    this.hostAPIs.delete(name);
    this.storageData.delete(name);
    return true;
  }

  /**
   * 获取所有已注册扩展
   */
  listExtensions(): RegisteredExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 获取指定扩展
   */
  getExtension(name: string): RegisteredExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * 启用/禁用扩展（不卸载，仅禁用运行时调用）
   */
  setExtensionStatus(name: string, status: 'loaded' | 'disabled'): boolean {
    const ext = this.extensions.get(name);
    if (!ext) return false;
    ext.status = status;
    return true;
  }

  // ── 扩展点查询（供宿主调用扩展） ──

  /**
   * 获取所有已启用扩展的消息处理器
   */
  getMessageProcessors(): MessageProcessor[] {
    const result: MessageProcessor[] = [];
    for (const ext of this.extensions.values()) {
      if (ext.status !== 'loaded') continue;
      if (ext.config.messageProcessors) {
        result.push(...ext.config.messageProcessors);
      }
    }
    return result;
  }

  /**
   * 获取所有已启用扩展的斜杠命令
   */
  getSlashCommands(): SlashCommand[] {
    const result: SlashCommand[] = [];
    for (const ext of this.extensions.values()) {
      if (ext.status !== 'loaded') continue;
      if (ext.config.slashCommands) {
        result.push(...ext.config.slashCommands);
      }
    }
    return result;
  }

  /**
   * 获取所有已启用扩展的右键菜单项
   */
  getContextMenuItems(): ContextMenuItem[] {
    const result: ContextMenuItem[] = [];
    for (const ext of this.extensions.values()) {
      if (ext.status !== 'loaded') continue;
      if (ext.config.contextMenuItems) {
        result.push(...ext.config.contextMenuItems);
      }
    }
    return result;
  }

  /**
   * 获取所有已启用扩展的设置面板项
   */
  getSettingsPanelItems(): SettingsPanelItem[] {
    const result: SettingsPanelItem[] = [];
    for (const ext of this.extensions.values()) {
      if (ext.status !== 'loaded') continue;
      if (ext.config.settingsPanelItems) {
        result.push(...ext.config.settingsPanelItems);
      }
    }
    return result;
  }

  /**
   * 执行指定斜杠命令
   */
  executeSlashCommand(
    name: string,
    args: string[]
  ): { success: boolean; message?: string; sendMessage?: string } {
    const cmd = this.getSlashCommands().find((c) => c.name === name);
    if (!cmd) {
      return { success: false, message: `未知命令：/${name}` };
    }
    try {
      const result = cmd.execute(args);
      return {
        success: result.success,
        message: result.message,
        sendMessage: result.sendMessage,
      };
    } catch (err) {
      return {
        success: false,
        message: `执行 /${name} 失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * 执行消息处理器（beforeSend / afterReceive）
   */
  runMessageProcessors(
    text: string,
    context: MessageContext,
    hook: 'beforeSend' | 'afterReceive'
  ): string {
    let result = text;
    for (const processor of this.getMessageProcessors()) {
      if (processor.hook !== hook) continue;
      try {
        result = processor.process(result, context) ?? result;
      } catch {
        // 处理器失败不阻塞主流程
      }
    }
    return result;
  }

  /**
   * 清空所有扩展（卸载全部）
   */
  clear(): void {
    for (const name of Array.from(this.extensions.keys())) {
      this.unloadExtension(name);
    }
  }
}

// ── 单例导出 ──

export const extensionRegistry = new ExtensionRegistry();

/**
 * 暴露给扩展代码的全局注册接口
 *
 * 使用方式（扩展代码内）：
 * ```js
 * AIRoleplay.registerExtension({ name: 'my-ext', ... });
 * ```
 *
 * 在浏览器环境中通过 window.AIRoleplay 暴露
 */
export const AIRoleplayRegisterAPI = {
  registerExtension: (config: ExtensionConfig) =>
    extensionRegistry.registerExtension(config),
};

/**
 * 将注册 API 挂载到 window（在浏览器环境中调用）
 */
export function installGlobalAPI(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { AIRoleplay?: typeof AIRoleplayRegisterAPI }).AIRoleplay =
      AIRoleplayRegisterAPI;
  }
}

/**
 * 卸载全局 API
 */
export function uninstallGlobalAPI(): void {
  if (typeof window !== 'undefined') {
    delete (window as unknown as { AIRoleplay?: unknown }).AIRoleplay;
  }
}
