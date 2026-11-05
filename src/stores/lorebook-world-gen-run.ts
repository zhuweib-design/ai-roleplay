/**
 * lorebook-world-gen-run — 世界书 AI 生成/扩展的执行体（R4-3 拆分）
 *
 * 从 `stores/lorebook.ts` 的 `generateRandomWorldbook` / `extendWorldbook` 切出。
 * 需要读写的 store 状态通过 `WorldGenContext` 传入（不 import store，避免环形依赖），
 * 所以这里可以脱离 pinia 被单测直接驱动。
 */
import type { Ref } from 'vue';
import { t } from '@/i18n';
import type { Lorebook, LorebookEntry } from '@/core/lorebook';
import { MAX_LOREBOOK_ENTRIES, validateLorebook } from '@/core/lorebook';
import { createApiClient } from '../api';
import { useSettingsStore } from './settings';
import {
  type WorldTemplateId,
  getWorldTemplateMeta,
  generateWorldSeed,
  buildWorldGenerationMessages,
  buildWorldExtendMessages,
  parseGeneratedWorld,
  parseExtendedRegions,
} from '@core/world-generator';
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import {
  describeWorldParseError,
  generatedWorldToEntries,
  generatedRegionsToEntries,
} from './lorebook-world-gen';

/** 世界生成要驱动的 store 状态（由 store 传引用进来） */
export interface WorldGenContext {
  lorebooks: Ref<Lorebook[]>;
  currentLorebookId: Ref<string | null>;
  currentEntryId: Ref<string | null>;
  isGeneratingWorld: Ref<boolean>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistLorebook: (id: string) => Promise<void>;
}

/**
 * AI 生成新世界 (F06.8 创建模式)
 *
 * 流程：校验 API profile → 防重入 → 构建 prompt → 调用 API（非流式，温度 1.0）
 * → 解析 → 创建 Lorebook（含 worldDescription + entries）→ 持久化
 *
 * @returns 新 Lorebook id（失败返回 null）
 */
export async function runGenerateRandomWorldbook(
  ctx: WorldGenContext,
  templateId: WorldTemplateId,
  scope: Lorebook['scope'] = 'global',
  sourceContext?: string,
  /** scope='character' 时要归属的角色；给了就写进记录，不再被抹成 undefined */
  characterId?: string
): Promise<string | null> {
  ctx.lastError.value = null;
  ctx.lastInfo.value = null;

  if (ctx.isGeneratingWorld.value) {
    ctx.lastError.value = t('lb.generatingBusy');
    return null;
  }

  // 1. 获取当前激活的 API profile
  const settingsStore = useSettingsStore();
  const profile = settingsStore.activeProfile;
  if (!profile) {
    ctx.lastError.value = t('lb.noApiGen');
    return null;
  }

  // 2. 构建 Prompt：输出预算由"模型最大上下文"自动推导，源素材超预算时自动截断
  const seed = generateWorldSeed();
  const meta = getWorldTemplateMeta(templateId);

  // 先立"生成中"标志，再做异步准备（防重入不能等异步准备）
  ctx.isGeneratingWorld.value = true;

  try {
    // 3. 调用 API（非流式，温度 1.0 增加创意；输出预算 = 上下文 − 输入 − 预留）
    const prepared = await prepareGenerationPrompt(
      (src) => buildWorldGenerationMessages(templateId, seed, src),
      sourceContext,
      resolveContextWindow(profile, settingsStore.maxContextTokens),
      settingsStore.reservedTokens
    );
    const apiClient = createApiClient(profile);
    const raw = await apiClient.chat({
      messages: prepared.messages,
      model: profile.model,
      temperature: 1.0,
      maxTokens: prepared.maxTokens,
    });

    // 4. 解析（失败时把证据说清楚：空返回 / 不是 JSON / 被截断 / 字段名不对）
    const generated = parseGeneratedWorld(raw);
    if (!generated) {
      ctx.lastError.value = describeWorldParseError(raw);
      return null;
    }

    // 5. 转换为 Lorebook
    const entries = generatedWorldToEntries(generated);
    const lbId = `lorebook-${Date.now()}`;
    const now = new Date().toISOString();
    const lb: Lorebook = {
      id: lbId,
      name: generated.world.name || t('lb.aiGeneratedName', { label: meta?.label ?? 'AI' }),
      description: t('lb.aiGeneratedDesc', { label: meta?.label ?? 'AI', time: new Date().toLocaleString('zh-CN') }),
      entries,
      scope,
      // 归属角色：以前这里无条件写 `characterId: undefined`，而 updateLorebook 又不
      // 允许改 characterId —— 于是"调用方之后再调整绑定"这条注释指的路根本不存在。
      ...(characterId ? { characterId } : {}),
      worldDescription: {
        name: generated.world.name,
        type: generated.world.type,
        keys: generated.world.keys,
        content: generated.world.content,
      },
      createdAt: now,
      updatedAt: now,
    };

    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      ctx.lastError.value = t('lb.genValidateFailed', { errors: errors.join('；') });
      return null;
    }

    ctx.lorebooks.value.unshift(lb);
    ctx.currentLorebookId.value = lbId;
    ctx.currentEntryId.value = null;
    await ctx.persistLorebook(lbId);

    ctx.lastInfo.value = t('lb.genDone', { name: lb.name, count: entries.length });
    return lbId;
  } catch (err) {
    ctx.lastError.value = t('lb.genFailed2', { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    ctx.isGeneratingWorld.value = false;
  }
}

/**
 * AI 扩展现有 Lorebook (F06.8 扩展模式)
 *
 * 基于现有条目生成 2-3 个相关新大区/子区域补充，自动追加到末尾。
 *
 * @returns 新增条目数（失败返回 0）
 */
export async function runExtendWorldbook(
  ctx: WorldGenContext,
  lorebookId: string
): Promise<number> {
  ctx.lastError.value = null;
  ctx.lastInfo.value = null;

  if (ctx.isGeneratingWorld.value) {
    ctx.lastError.value = t('lb.generatingBusy');
    return 0;
  }

  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) {
    ctx.lastError.value = t('lb.extendNotFound');
    return 0;
  }

  if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
    ctx.lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
    return 0;
  }

  // 1. 获取 API profile
  const settingsStore = useSettingsStore();
  const profile = settingsStore.activeProfile;
  if (!profile) {
    ctx.lastError.value = t('lb.noApiExtend');
    return 0;
  }

  const seed = generateWorldSeed();

  // 先立"生成中"标志，再做异步准备（防重入不能等异步准备）
  ctx.isGeneratingWorld.value = true;

  try {
    // 2. 构建 Prompt：已有条目摘要超预算时按"保尾"截断（结构说明在尾部）
    const prepared = await prepareGenerationPrompt(
      () => buildWorldExtendMessages(lb.entries, lb.worldDescription ?? null, seed),
      undefined,
      resolveContextWindow(profile, settingsStore.maxContextTokens),
      settingsStore.reservedTokens
    );
    // 3. 调用 API
    const apiClient = createApiClient(profile);
    const raw = await apiClient.chat({
      messages: prepared.messages,
      model: profile.model,
      temperature: 1.0,
      maxTokens: prepared.maxTokens,
    });

    // 4. 解析
    const regions = parseExtendedRegions(raw);
    if (regions.length === 0) {
      ctx.lastError.value = t('lb.extendParseFailed');
      return 0;
    }

    // 5. 转换为 LorebookEntry[] 并追加
    const baseOrder = lb.entries.length > 0
      ? Math.max(...lb.entries.map((e) => e.insertionOrder)) + 10
      : 100;
    const newEntries = generatedRegionsToEntries(regions, baseOrder);

    // 防止超出条目上限
    const remainingSlots = MAX_LOREBOOK_ENTRIES - lb.entries.length;
    const entriesToAdd: LorebookEntry[] = newEntries.slice(0, remainingSlots);

    lb.entries.push(...entriesToAdd);
    await ctx.persistLorebook(lorebookId);

    ctx.lastInfo.value = t('lb.extended2', { count: entriesToAdd.length, name: lb.name });
    return entriesToAdd.length;
  } catch (err) {
    ctx.lastError.value = t('lb.extendFailed2', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  } finally {
    ctx.isGeneratingWorld.value = false;
  }
}
