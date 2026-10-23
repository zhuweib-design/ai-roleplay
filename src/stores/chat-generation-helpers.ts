/**
 * chat-generation-helpers — 生成引擎的纯函数工具（R4-4 拆分）
 *
 * 从 chat-generation.ts 抽出，**零 store 依赖**：只做类型转换与去重合并，
 * 便于单独推理与复用。宿主通过普通 import 使用。
 */
import { ApiError } from '../api/types';
import type { ApiErrorKind } from '../api/types';
import type { ChatManagerConfig } from '../services/chat-manager';
import type { useDataBankStore } from './data-bank';
import type { buildChatSessionContext } from './chat-context';
import type { VectorRagSource } from '@/core/dual-channel-runtime';

/** 合并关键词 RAG 与向量 RAG，按正文去重并控制动态上下文上限。 */
export function mergeRagContext(base: string | undefined, extra: string, maxChars = 12_000): string | undefined {
  const blocks = [base ?? '', extra]
    .flatMap((value) => value.split(/\n\n+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  let length = 0;
  for (const block of blocks) {
    const key = block.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    const nextLength = length + block.length + (unique.length > 0 ? 2 : 0);
    if (nextLength > maxChars) break;
    seen.add(key);
    unique.push(block);
    length = nextLength;
  }
  return unique.length > 0 ? unique.join('\n\n') : undefined;
}

export function staticVectorSources(
  documents: ReturnType<typeof useDataBankStore>['documents'],
  lorebooks: NonNullable<ReturnType<typeof buildChatSessionContext>['lorebooks']>,
  characterId: string,
  chatId: string | null,
): VectorRagSource[] {
  const sources: VectorRagSource[] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    if (doc.scope === 'character' && doc.characterId !== characterId) continue;
    if (doc.scope === 'chat' && doc.chatId !== chatId) continue;
    for (const chunk of doc.chunks ?? []) {
      const id = `document:${doc.id}:${chunk.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      sources.push({
        id,
        text: `${doc.name}\n${chunk.content}`,
        meta: { scope: 'document', documentId: doc.id, chunkId: chunk.id },
      });
    }
  }
  for (const book of lorebooks) {
    if (book.worldDescription?.content) {
      const id = `world:${book.id}:description`;
      sources.push({
        id,
        text: `${book.worldDescription.name ?? book.name}\n${book.worldDescription.content}`,
        meta: { scope: 'world', lorebookId: book.id },
      });
    }
    for (const entry of book.entries ?? []) {
      if (!entry.enabled || !entry.content.trim()) continue;
      const id = `lorebook:${book.id}:${entry.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      sources.push({
        id,
        text: `${entry.title}\n${entry.content}`,
        meta: { scope: 'world', lorebookId: book.id, entryId: entry.id },
      });
    }
  }
  return sources;
}

/**
 * 将任意错误对象转换为 lastError 记录
 * 若为 ApiError，提取 kind 与 statusCode 供 UI 精确诊断
 */
export function toLastErrorRecord(
  err: Error,
  type: 'aborted' | 'api' | 'network' | 'unknown'
): {
  type: 'aborted' | 'api' | 'network' | 'unknown';
  message: string;
  kind?: ApiErrorKind;
  statusCode?: number;
  original?: Error;
} {
  if (err instanceof ApiError) {
    return {
      type,
      message: err.message,
      kind: err.kind,
      statusCode: err.statusCode,
      original: err,
    };
  }
  return {
    type,
    message: err.message,
    original: err,
  };
}

/**
 * P0-3：把采样参数对象转为 ChatManagerConfig 的 patch
 *
 * 关键：**只输出已设置的键**。若把 `undefined` 也写进去，
 * `{...config, ...overrides}` 会用 undefined 覆盖掉下一档的默认值 ——
 * 这正是既有 `profile.maxTokens` 成为死代码的原因（§0.3），新参数不能再踩。
 */
export function buildSamplingConfigPatch(
  sampling?: { topP?: number | null; presencePenalty?: number | null; frequencyPenalty?: number | null } | null
): Partial<Pick<ChatManagerConfig, 'topP' | 'presencePenalty' | 'frequencyPenalty'>> {
  const patch: Partial<Pick<ChatManagerConfig, 'topP' | 'presencePenalty' | 'frequencyPenalty'>> = {};
  if (!sampling) return patch;
  if (typeof sampling.topP === 'number' && Number.isFinite(sampling.topP)) {
    patch.topP = sampling.topP;
  }
  if (typeof sampling.presencePenalty === 'number' && Number.isFinite(sampling.presencePenalty)) {
    patch.presencePenalty = sampling.presencePenalty;
  }
  if (typeof sampling.frequencyPenalty === 'number' && Number.isFinite(sampling.frequencyPenalty)) {
    patch.frequencyPenalty = sampling.frequencyPenalty;
  }
  return patch;
}
