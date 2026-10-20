import { t as i18nT } from '@/i18n';
import {
  encryptApiKey,
  decryptApiKey,
  isEncrypted,
  verifyMasterPassword,
  reencryptApiKey,
} from '@core/api-key-crypto';
import { setRemoteApiKeyState } from '@core/remote-api-key-state';
import type { SettingsCtx } from './ctx';

/**
 * R2-5：安全域（AC20 主密码会话 + P1-4 远程向量密钥）。
 *
 * ⚠️ 不可分割的两半：远程密钥的加解密时机完全由主密码状态驱动
 * （设密码时收敛存量明文、解锁时解密、改密码时轮换、锁定时置 locked），
 * 硬拆两文件会让"谁在什么时候改状态"散落，是引入安全回归的最短路径。
 */

/** 远程向量配置的 localStorage 键 */
const REMOTE_EMBEDDING_KEY = 'aijiuguan.remoteEmbedding';

export function createSecurityActions(ctx: SettingsCtx) {
  /**
   * 生成主密码验证器（加密随机明文）
   * @param pw 主密码
   * @returns 加密字符串（含 enc:v1: 前缀）
   */
  async function generateVerifier(pw: string): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...Array.from(randomBytes)));
    return encryptApiKey(verifier, pw);
  }

  // ── P1-4：远程向量网关 apiKey 纳入主密码加密体系 ──
  //
  // 该密钥原先以**明文**存于 localStorage['aijiuguan.remoteEmbedding']，游离于
  // 主密码体系之外（apiProfiles / translationConfig 的 apiKey 都会加密，唯独它没有），
  // 也不在备份导出的明文密钥检查范围内。
  //
  // 读取侧的特殊性：VectorModelManager.defaultFactory() 是**同步静态**方法，
  // 而 decryptApiKey() 是异步的（Web Crypto）。故不采用「读取时解密」（会把调用链
  // 整体异步化），而是「解锁时解密一次写入内存态，读取时同步取用」。
  //
  // ⚠️ 边界：本改动只消除**磁盘明文**。lock() 不清内存中的 apiKey 明文是既有局限
  // （见 lock() 注释），内存态的语义与该既有行为保持一致，不夸大安全收益。

  function readRemoteEmbedding(): Record<string, unknown> | null {
    try {
      const raw = localStorage.getItem(REMOTE_EMBEDDING_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  function writeRemoteEmbedding(payload: Record<string, unknown>): void {
    localStorage.setItem(REMOTE_EMBEDDING_KEY, JSON.stringify(payload));
  }

  /** 把 localStorage 中远程配置的 apiKey 用主密码加密（已加密则跳过） */
  async function encryptRemoteEmbeddingKey(pw: string): Promise<void> {
    const cfg = readRemoteEmbedding();
    if (!cfg || typeof cfg.apiKey !== 'string' || !cfg.apiKey) return;
    if (isEncrypted(cfg.apiKey)) return;
    cfg.apiKey = await encryptApiKey(cfg.apiKey, pw);
    writeRemoteEmbedding(cfg);
  }

  /** 用新密码重新加密远程配置的 apiKey（改主密码时调用） */
  async function reencryptRemoteEmbeddingKey(oldPw: string, newPw: string): Promise<void> {
    const cfg = readRemoteEmbedding();
    if (!cfg || typeof cfg.apiKey !== 'string' || !cfg.apiKey) return;
    if (!isEncrypted(cfg.apiKey)) return; // 明文（未解锁场景）：交由持久化侧处理
    cfg.apiKey = await reencryptApiKey(cfg.apiKey, oldPw, newPw);
    writeRemoteEmbedding(cfg);
  }

  /** 依据主密码状态同步内存态（同步路径：未设主密码 / 未解锁 / 明文存量） */
  function syncRemoteApiKeyState(): void {
    if (!ctx.masterPasswordVerifier.value) {
      setRemoteApiKeyState({ state: 'plain' });
      return;
    }
    if (!ctx.masterPassword.value) {
      setRemoteApiKeyState({ state: 'locked' });
      return;
    }
    const stored = readRemoteEmbedding()?.apiKey;
    if (typeof stored === 'string' && stored && !isEncrypted(stored)) {
      setRemoteApiKeyState({ state: 'unlocked', key: stored });
    } else {
      // 密文需异步解密，先置 locked，由 loadRemoteApiKeyDecrypted 接管
      setRemoteApiKeyState({ state: 'locked' });
    }
  }

  /** 异步解密并写入内存态（unlock / setMasterPassword 成功后调用） */
  async function loadRemoteApiKeyDecrypted(): Promise<void> {
    if (!ctx.masterPassword.value) {
      setRemoteApiKeyState({ state: 'locked' });
      return;
    }
    const stored = readRemoteEmbedding()?.apiKey;
    if (typeof stored !== 'string' || !stored) {
      setRemoteApiKeyState({ state: 'unlocked', key: '' });
      return;
    }
    if (!isEncrypted(stored)) {
      setRemoteApiKeyState({ state: 'unlocked', key: stored });
      return;
    }
    try {
      setRemoteApiKeyState({
        state: 'unlocked',
        key: await decryptApiKey(stored, ctx.masterPassword.value),
      });
    } catch {
      // 解密失败：置为不可用；用户重新保存远程配置即可恢复
      setRemoteApiKeyState({ state: 'locked' });
    }
  }

  /**
   * 解密内存中所有已加密的 apiKey 字段
   * 在 unlock 成功后调用
   *
   * 解密失败的字段保留密文不动（用户选择"保留密文待重试"策略）
   */
  async function decryptAllApiKeys(): Promise<void> {
    if (!ctx.masterPassword.value) return;
    for (const profile of ctx.apiProfiles.value) {
      if (profile.apiKey && isEncrypted(profile.apiKey)) {
        try {
          profile.apiKey = await decryptApiKey(profile.apiKey, ctx.masterPassword.value);
        } catch {
          // 保留密文，记录到 lastError
          ctx.lastError.value = i18nT('masterPwd.apiKeyDecryptFailed', { name: profile.name });
        }
      }
    }
    if (ctx.translationConfig.value.apiKey && isEncrypted(ctx.translationConfig.value.apiKey)) {
      try {
        ctx.translationConfig.value.apiKey = await decryptApiKey(
          ctx.translationConfig.value.apiKey,
          ctx.masterPassword.value
        );
      } catch {
        ctx.lastError.value = i18nT('masterPwd.translationKeyDecryptFailed');
      }
    }
    // E22：图像 Provider 的密钥与上面两处同进同出（漏了它就会出现"能生成图但密钥是密文"）
    if (ctx.imageGenConfig.value.apiKey && isEncrypted(ctx.imageGenConfig.value.apiKey)) {
      try {
        ctx.imageGenConfig.value.apiKey = await decryptApiKey(
          ctx.imageGenConfig.value.apiKey,
          ctx.masterPassword.value
        );
      } catch {
        ctx.lastError.value = i18nT('masterPwd.imageGenKeyDecryptFailed');
      }
    }
  }

  /**
   * 首次设置主密码
   *
   * 流程：
   * 1. 生成随机 verifier 明文
   * 2. 用主密码加密 verifier → 持久化到 masterPasswordVerifier
   * 3. 注入内存
   * 4. 持久化设置（此时所有 apiKey 会被自动加密）
   *
   * @param pw 主密码（用户输入，明文）
   */
  async function setMasterPassword(pw: string): Promise<void> {
    if (!pw) throw new Error(i18nT('masterPwd.pwdPlaceholder'));
    ctx.masterPasswordVerifier.value = await generateVerifier(pw);
    ctx.masterPassword.value = pw;
    // P1-4：存量明文远程密钥在此收敛为密文，并写入内存态
    await encryptRemoteEmbeddingKey(pw);
    await loadRemoteApiKeyDecrypted();
    await ctx.persistSettings();
  }

  /**
   * 解锁应用（验证主密码并注入内存）
   *
   * @param pw 用户输入的主密码
   * @returns true=解锁成功；false=密码错误
   */
  async function unlock(pw: string): Promise<boolean> {
    if (!ctx.masterPasswordVerifier.value) return false;
    const ok = await verifyMasterPassword(ctx.masterPasswordVerifier.value, pw);
    if (!ok) return false;
    ctx.masterPassword.value = pw;
    // 解密内存中所有已加密的 apiKey
    await decryptAllApiKeys();
    // P1-4：解密远程向量密钥并写入内存态（供同步的 defaultFactory 取用）
    await loadRemoteApiKeyDecrypted();
    return true;
  }

  /**
   * 锁定应用（清除内存中的主密码）
   *
   * 注意：内存中的 apiKey 不会被重新加密（保留明文直到下次刷新）。
   * 真正的"锁定"语义需刷新页面或重新加载设置。
   */
  function lock(): void {
    ctx.masterPassword.value = '';
    // P1-4：锁定后不再向 provider 下发远程向量密钥（内存态置 locked）
    syncRemoteApiKeyState();
  }

  /**
   * 修改主密码（需先解锁）
   *
   * 流程：
   * 1. 验证旧密码
   * 2. 用旧密码解密所有 apiKey
   * 3. 用新密码重新加密所有 apiKey
   * 4. 更新 verifier
   *
   * @param oldPw 旧主密码
   * @param newPw 新主密码
   * @returns true=成功；false=旧密码错误
   */
  async function changeMasterPassword(oldPw: string, newPw: string): Promise<boolean> {
    if (!ctx.masterPasswordVerifier.value) return false;
    const ok = await verifyMasterPassword(ctx.masterPasswordVerifier.value, oldPw);
    if (!ok) return false;

    // 内存中 apiKey 应该是明文（已解锁状态），用新密码加密
    // 但为了兼容"已加密"场景（如未解锁就改密码），使用 reencryptApiKey 双保险
    for (const profile of ctx.apiProfiles.value) {
      if (profile.apiKey && isEncrypted(profile.apiKey)) {
        // 已加密：用旧密码解密后用新密码加密
        profile.apiKey = await reencryptApiKey(profile.apiKey, oldPw, newPw);
      }
      // 明文（已解锁状态）：不修改内存值，持久化时透明层会处理
    }
    if (ctx.translationConfig.value.apiKey && isEncrypted(ctx.translationConfig.value.apiKey)) {
      ctx.translationConfig.value.apiKey = await reencryptApiKey(
        ctx.translationConfig.value.apiKey,
        oldPw,
        newPw
      );
    }
    // P1-4：远程向量密钥同样随主密码轮换（否则改密码后它再也解不开）
    await reencryptRemoteEmbeddingKey(oldPw, newPw);

    // 更新 verifier
    ctx.masterPasswordVerifier.value = await generateVerifier(newPw);
    ctx.masterPassword.value = newPw;
    await ctx.persistSettings();
    return true;
  }

  /**
   * 恢复会话级主密码（应用启动时调用）
   *
   * 主密码仅存运行时内存（不落任何存储），刷新后无法自动恢复。
   * 恒返回 false —— UI 在 hasMasterPassword=true 时显示解锁 Modal。
   *
   * @returns 恒为 false（保持锁定状态，需手动解锁）
   */
  async function restoreSession(): Promise<boolean> {
    return false;
  }

  /**
   * P1-4：供设置页保存远程向量配置时加密 apiKey
   * 未设主密码时原样返回（与 apiProfiles 的透明加密语义一致）
   */
  async function encryptRemoteSecret(plain: string): Promise<string> {
    if (!plain || isEncrypted(plain)) return plain;
    if (!ctx.masterPassword.value) return plain;
    return encryptApiKey(plain, ctx.masterPassword.value);
  }

  /**
   * P1-4：供设置页回填表单时解密 apiKey
   * 未加密时原样返回；已加密但未解锁时返回空串（不回填密文）
   */
  async function decryptRemoteSecret(stored: string): Promise<string> {
    if (!stored || !isEncrypted(stored)) return stored;
    if (!ctx.masterPassword.value) return '';
    try {
      return await decryptApiKey(stored, ctx.masterPassword.value);
    } catch {
      return '';
    }
  }

  return {
    setMasterPassword,
    unlock,
    lock,
    changeMasterPassword,
    restoreSession,
    decryptAllApiKeys,
    encryptRemoteSecret,
    decryptRemoteSecret,
    syncRemoteApiKeyState,
  };
}
