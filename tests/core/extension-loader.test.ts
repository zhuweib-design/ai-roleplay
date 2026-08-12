/**
 * 扩展加载器单元测试 (迭代28 · F12.1)
 *
 * 覆盖：
 * - registerExtension 校验（必填字段、capability 一致性）
 * - loadExtension 加载（成功/失败/重名）
 * - unloadExtension 卸载
 * - 扩展点查询（消息处理器/斜杠命令/右键菜单/设置面板）
 * - executeSlashCommand 执行
 * - runMessageProcessors 处理链
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { extensionRegistry } from '@core/extension-loader';
import type { ExtensionConfig } from '@core/extension-types';
import { ExtensionError } from '@core/extension-types';

// ── 测试夹具 ──

function makeConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    name: `test-ext-${Math.random().toString(36).slice(2, 7)}`,
    displayName: '测试扩展',
    version: '1.0.0',
    author: 'tester',
    description: '测试用',
    capabilities: {},
    ...overrides,
  };
}

function makeSource(config: ExtensionConfig): string {
  return `
    AIRoleplay.registerExtension(${JSON.stringify(config)});
  `;
}

// ── 测试用例 ──

describe('extension-loader (F12.1)', () => {
  beforeEach(() => {
    extensionRegistry.clear();
  });

  describe('registerExtension 配置校验', () => {
    test('合法配置成功注册', () => {
      const config = makeConfig({ displayName: '合法扩展' });
      expect(() => extensionRegistry.registerExtension(config)).not.toThrow();
      const ext = extensionRegistry.getExtension(config.name);
      expect(ext).toBeDefined();
      expect(ext?.status).toBe('loaded');
    });

    test('name 缺失抛错', () => {
      const config = makeConfig();
      delete (config as unknown as { name?: string }).name;
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('displayName 缺失抛错', () => {
      const config = makeConfig();
      delete (config as unknown as { displayName?: string }).displayName;
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('version 缺失抛错', () => {
      const config = makeConfig();
      delete (config as unknown as { version?: string }).version;
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('capabilities 缺失抛错', () => {
      const config = makeConfig();
      delete (config as unknown as { capabilities?: object }).capabilities;
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('重名注册抛 DuplicateName', () => {
      const config = makeConfig({ name: 'duplicate' });
      extensionRegistry.registerExtension(config);
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });
  });

  describe('capability 一致性校验', () => {
    test('注册 slashCommands 但未声明 capability 抛错', () => {
      const config = makeConfig({
        capabilities: {},
        slashCommands: [
          {
            name: 'roll',
            description: '掷骰子',
            execute: () => ({ success: true, message: '6' }),
          },
        ],
      });
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('注册 messageProcessors 但未声明 capability 抛错', () => {
      const config = makeConfig({
        capabilities: {},
        messageProcessors: [
          {
            id: 'p1',
            hook: 'beforeSend',
            process: (text) => text,
          },
        ],
      });
      expect(() => extensionRegistry.registerExtension(config)).toThrow(ExtensionError);
    });

    test('声明 capability 且注册扩展点成功', () => {
      const config = makeConfig({
        capabilities: { slashCommand: true },
        slashCommands: [
          {
            name: 'roll',
            description: '掷骰子',
            execute: () => ({ success: true, message: '6' }),
          },
        ],
      });
      expect(() => extensionRegistry.registerExtension(config)).not.toThrow();
      expect(extensionRegistry.getSlashCommands()).toHaveLength(1);
    });
  });

  describe('loadExtension 加载', () => {
    test('合法源码加载成功', async () => {
      const config = makeConfig({ name: 'loaded-ext' });
      const source = makeSource(config);
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'user',
      });
      expect(result.success).toBe(true);
      expect(result.extensionName).toBe('loaded-ext');
      const ext = extensionRegistry.getExtension('loaded-ext');
      expect(ext).toBeDefined();
      expect(ext?.source).toBe('user');
    });

    test('T-09 未授权时全局能力注入拒绝守卫:调用即抛 CAPABILITY_VIOLATION', async () => {
      // 新守卫模型:未授权的全局(如 window/fetch)注入「拒绝守卫函数」,
      // 调用时抛出明确权限错误(区别于旧模型的静默 undefined)
      const source = `
        window();
        AIRoleplay.registerExtension(${JSON.stringify(
          makeConfig({ name: 'sandbox-ext' })
        )});
      `;
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CAPABILITY_VIOLATION');
    });

    test('T-09 未授权时 fetch 调用被拒绝并给出明确提示', async () => {
      const source = `
        fetch('https://example.com');
        AIRoleplay.registerExtension(${JSON.stringify(
          makeConfig({ name: 'sandbox-fetch' })
        )});
      `;
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CAPABILITY_VIOLATION');
      expect(result.error).toContain('fetch');
      expect(result.error).toContain('network');
    });

    test('T-09 授权 dom/network 后透传真实全局,加载成功', async () => {
      const config = makeConfig({ name: 'sandbox-allowed' });
      const source = `
        if (typeof window !== 'object') throw new Error('window 未透传');
        if (typeof fetch !== 'function') throw new Error('fetch 未透传');
        window.__TAURI_INTERNALS__; // 读取无害
        AIRoleplay.registerExtension(${JSON.stringify(config)});
      `;
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'user',
        permissions: { dom: true, network: true },
      });
      expect(result.success).toBe(true);
      expect(result.extensionName).toBe('sandbox-allowed');
    });

    test('空源码加载失败', async () => {
      const result = await extensionRegistry.loadExtension({
        source: '',
        sourceType: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOAD_FAILED');
    });

    test('未调用 registerExtension 加载失败', async () => {
      const result = await extensionRegistry.loadExtension({
        source: 'console.log("no register");',
        sourceType: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOAD_FAILED');
    });

    test('源码语法错误加载失败', async () => {
      const result = await extensionRegistry.loadExtension({
        source: 'this is not valid javascript {{{',
        sourceType: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOAD_FAILED');
    });

    test('overrideName 覆盖扩展名', async () => {
      const config = makeConfig({ name: 'original-name' });
      const source = makeSource(config);
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'user',
        overrideName: 'overridden-name',
      });
      expect(result.success).toBe(true);
      expect(result.extensionName).toBe('overridden-name');
      expect(extensionRegistry.getExtension('original-name')).toBeUndefined();
      expect(extensionRegistry.getExtension('overridden-name')).toBeDefined();
    });

    test('builtin source 标记', async () => {
      const config = makeConfig({ name: 'builtin-ext' });
      const source = makeSource(config);
      const result = await extensionRegistry.loadExtension({
        source,
        sourceType: 'builtin',
      });
      expect(result.success).toBe(true);
      const ext = extensionRegistry.getExtension('builtin-ext');
      expect(ext?.source).toBe('builtin');
    });
  });

  describe('unloadExtension 卸载', () => {
    test('卸载已注册扩展', async () => {
      const config = makeConfig({ name: 'to-unload' });
      await extensionRegistry.loadExtension({
        source: makeSource(config),
        sourceType: 'user',
      });
      expect(extensionRegistry.getExtension('to-unload')).toBeDefined();
      expect(extensionRegistry.unloadExtension('to-unload')).toBe(true);
      expect(extensionRegistry.getExtension('to-unload')).toBeUndefined();
    });

    test('卸载不存在的扩展返回 false', () => {
      expect(extensionRegistry.unloadExtension('non-existent')).toBe(false);
    });

    test('卸载时调用 onUnload 回调', () => {
      let unloaded = false;
      const config = makeConfig({
        name: 'with-unload',
        onUnload: () => {
          unloaded = true;
        },
      });
      // 直接注册（不经 source 序列化，保留函数引用）
      extensionRegistry.registerExtension(config);
      extensionRegistry.unloadExtension('with-unload');
      expect(unloaded).toBe(true);
    });
  });

  describe('扩展点查询', () => {
    test('getSlashCommands 返回所有命令', () => {
      const config = makeConfig({
        name: 'cmd-ext',
        capabilities: { slashCommand: true },
        slashCommands: [
          { name: 'roll', description: '骰子', execute: () => ({ success: true }) },
          { name: 'flip', description: '硬币', execute: () => ({ success: true }) },
        ],
      });
      extensionRegistry.registerExtension(config);
      const cmds = extensionRegistry.getSlashCommands();
      expect(cmds).toHaveLength(2);
      expect(cmds.map((c) => c.name).sort()).toEqual(['flip', 'roll']);
    });

    test('禁用扩展后命令不可见', () => {
      const config = makeConfig({
        name: 'disabled-ext',
        capabilities: { slashCommand: true },
        slashCommands: [
          { name: 'cmd', description: 'x', execute: () => ({ success: true }) },
        ],
      });
      extensionRegistry.registerExtension(config);
      expect(extensionRegistry.getSlashCommands()).toHaveLength(1);
      extensionRegistry.setExtensionStatus('disabled-ext', 'disabled');
      expect(extensionRegistry.getSlashCommands()).toHaveLength(0);
    });

    test('getMessageProcessors 返回所有处理器', () => {
      const config = makeConfig({
        name: 'proc-ext',
        capabilities: { messageProcessor: true },
        messageProcessors: [
          { id: 'p1', hook: 'beforeSend', process: (t) => t.toUpperCase() },
          { id: 'p2', hook: 'afterReceive', process: (t) => t.trim() },
        ],
      });
      extensionRegistry.registerExtension(config);
      expect(extensionRegistry.getMessageProcessors()).toHaveLength(2);
    });

    test('getSettingsPanelItems 返回面板项', () => {
      const config = makeConfig({
        name: 'panel-ext',
        capabilities: { settingsPanel: true },
        settingsPanelItems: [
          { id: 'p1', title: '面板1', render: () => '<div>1</div>' },
        ],
      });
      extensionRegistry.registerExtension(config);
      expect(extensionRegistry.getSettingsPanelItems()).toHaveLength(1);
    });

    test('getContextMenuItems 返回菜单项', () => {
      const config = makeConfig({
        name: 'menu-ext',
        capabilities: { contextMenu: true },
        contextMenuItems: [
          { id: 'm1', title: '菜单1', context: 'message', onClick: () => {} },
        ],
      });
      extensionRegistry.registerExtension(config);
      expect(extensionRegistry.getContextMenuItems()).toHaveLength(1);
    });
  });

  describe('executeSlashCommand 执行', () => {
    test('执行存在的命令', () => {
      const config = makeConfig({
        name: 'exec-ext',
        capabilities: { slashCommand: true },
        slashCommands: [
          {
            name: 'roll',
            description: '掷骰子',
            execute: (args) => ({
              success: true,
              message: `掷出 ${args[0] ?? '6'}`,
            }),
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.executeSlashCommand('roll', ['20']);
      expect(result.success).toBe(true);
      expect(result.message).toBe('掷出 20');
    });

    test('执行不存在的命令返回失败', () => {
      const result = extensionRegistry.executeSlashCommand('nonexistent', []);
      expect(result.success).toBe(false);
      expect(result.message).toContain('未知命令');
    });

    test('命令抛错时返回失败信息', () => {
      const config = makeConfig({
        name: 'error-ext',
        capabilities: { slashCommand: true },
        slashCommands: [
          {
            name: 'fail',
            description: '总会失败',
            execute: () => {
              throw new Error('命令执行错误');
            },
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.executeSlashCommand('fail', []);
      expect(result.success).toBe(false);
      expect(result.message).toContain('命令执行错误');
    });

    test('命令返回 sendMessage 触发 AI 回复', () => {
      const config = makeConfig({
        name: 'send-ext',
        capabilities: { slashCommand: true },
        slashCommands: [
          {
            name: 'greet',
            description: '打招呼',
            execute: () => ({
              success: true,
              sendMessage: '你好',
            }),
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.executeSlashCommand('greet', []);
      expect(result.sendMessage).toBe('你好');
    });
  });

  describe('runMessageProcessors 处理链', () => {
    test('beforeSend 处理器修改文本', () => {
      const config = makeConfig({
        name: 'before-ext',
        capabilities: { messageProcessor: true },
        messageProcessors: [
          {
            id: 'upper',
            hook: 'beforeSend',
            process: (text) => text.toUpperCase(),
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.runMessageProcessors(
        'hello',
        { characterId: 'c1', characterName: 'Test', role: 'user', timestamp: 0 },
        'beforeSend'
      );
      expect(result).toBe('HELLO');
    });

    test('afterReceive 处理器不触发 beforeSend', () => {
      const config = makeConfig({
        name: 'after-ext',
        capabilities: { messageProcessor: true },
        messageProcessors: [
          {
            id: 'trim',
            hook: 'afterReceive',
            process: (text) => text.trim(),
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      // beforeSend 不应被处理
      const result = extensionRegistry.runMessageProcessors(
        'hello',
        { characterId: 'c1', characterName: 'Test', role: 'user', timestamp: 0 },
        'beforeSend'
      );
      expect(result).toBe('hello');
    });

    test('多个处理器按顺序处理', () => {
      const config = makeConfig({
        name: 'chain-ext',
        capabilities: { messageProcessor: true },
        messageProcessors: [
          {
            id: 'p1',
            hook: 'beforeSend',
            process: (text) => text + ' A',
          },
          {
            id: 'p2',
            hook: 'beforeSend',
            process: (text) => text + ' B',
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.runMessageProcessors(
        'start',
        { characterId: 'c1', characterName: 'T', role: 'user', timestamp: 0 },
        'beforeSend'
      );
      expect(result).toBe('start A B');
    });

    test('处理器抛错不阻塞主流程', () => {
      const config = makeConfig({
        name: 'err-proc-ext',
        capabilities: { messageProcessor: true },
        messageProcessors: [
          {
            id: 'err',
            hook: 'beforeSend',
            process: () => {
              throw new Error('处理失败');
            },
          },
        ],
      });
      extensionRegistry.registerExtension(config);
      const result = extensionRegistry.runMessageProcessors(
        'original',
        { characterId: 'c1', characterName: 'T', role: 'user', timestamp: 0 },
        'beforeSend'
      );
      // 失败时返回原文
      expect(result).toBe('original');
    });
  });

  describe('listExtensions 列表', () => {
    test('返回所有已注册扩展', async () => {
      await extensionRegistry.loadExtension({
        source: makeSource(makeConfig({ name: 'ext1' })),
        sourceType: 'user',
      });
      await extensionRegistry.loadExtension({
        source: makeSource(makeConfig({ name: 'ext2' })),
        sourceType: 'user',
      });
      const list = extensionRegistry.listExtensions();
      expect(list).toHaveLength(2);
      expect(list.map((e) => e.config.name).sort()).toEqual(['ext1', 'ext2']);
    });

    test('包含 loadedAt 时间戳', async () => {
      await extensionRegistry.loadExtension({
        source: makeSource(makeConfig({ name: 'ts-ext' })),
        sourceType: 'user',
      });
      const ext = extensionRegistry.getExtension('ts-ext');
      expect(ext?.loadedAt).toBeGreaterThan(0);
    });
  });
});
