/**
 * 群聊 store · 随机 NPC 生成（F10.3，R4-6 自 stores/group-chat.ts 切出）
 *
 * 存储适配器由持久化工厂持有，这里通过 getStorageAdapter 取用，不在本模块再存一份。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import type { CharacterCard } from '@/core/character-card';
import { createApiClient } from '@/api';
import { useSettingsStore } from './settings';
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import type { CharacterTemplateId } from '@core/character-generator';
import {
  type NpcSceneContext,
  buildNpcGenerationMessages,
  parseGeneratedNpc,
  generatedNpcToCard,
  validateNpcParams,
} from '@core/npc-generator';
import { MAX_GROUP_MEMBERS, type GroupChat } from '@/core/group-chat';

export interface GroupNpcDeps {
  groups: Ref<GroupChat[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  isGeneratingNpc: Ref<boolean>;
  getStorageAdapter: () => StorageAdapter | null;
  addMember: (groupId: string, character: CharacterCard) => boolean;
}

export function createGroupNpcOps(deps: GroupNpcDeps) {
  const {
    groups,
    lastError,
    lastInfo,
    isGeneratingNpc,
    getStorageAdapter,
    addMember,
  } = deps;

  /**
   * 生成随机 NPC 并加入群聊
   *
   * 业务流程：
   * 1. 校验群聊存在、未满员、API 已配置
   * 2. 构建场景上下文 + 群聊上下文
   * 3. 调用 LLM 生成 NPC（非流式，温度 1.0）
   * 4. 解析返回 → 转换为临时角色卡
   * 5. 保存到 character store（标记为 __temporary_npc）
   * 6. 添加到群聊成员
   *
   * @param groupId 群聊 ID
   * @param templateId 生成模板
   * @param sceneContext 场景上下文（可选，来自 F06.6）
   * @returns 新角色 ID（失败返回 null）
   */
  async function generateRandomNpc(
    groupId: string,
    templateId: CharacterTemplateId,
    sceneContext: NpcSceneContext = {}
  ): Promise<string | null> {
    lastError.value = null;
    lastInfo.value = null;

    // 防重入
    if (isGeneratingNpc.value) return null;

    const g = groups.value.find((x) => x.id === groupId);
    if (!g) {
      lastError.value = t('group.notFound');
      return null;
    }

    // 构建生成参数
    const params = {
      templateId,
      sceneContext,
      groupContext: {
        groupName: g.name,
        existingMemberNames: g.members.map((m) => m.name),
        memberCount: g.members.length,
        maxMembers: MAX_GROUP_MEMBERS,
      },
    };

    // 校验
    const errors = validateNpcParams(params);
    if (errors.length > 0) {
      lastError.value = errors.join('；');
      return null;
    }

    // 获取 API profile
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      lastError.value = t('group.noApiNpc');
      return null;
    }

    const apiClient = createApiClient(profile);

    // 先立"生成中"标志，再做异步准备（防重入不能等异步准备）
    isGeneratingNpc.value = true;

    try {
      // 调用 API（非流式，温度 1.0 增加创意；输出预算由模型上下文推导）
      const prepared = await prepareGenerationPrompt(
        () => buildNpcGenerationMessages(params),
        undefined,
        resolveContextWindow(profile, settingsStore.maxContextTokens),
        settingsStore.reservedTokens
      );
      const raw = await apiClient.chat({
        messages: prepared.messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: prepared.maxTokens,
      });

      // 解析返回
      const npc = parseGeneratedNpc(raw, sceneContext);
      if (!npc) {
        lastError.value = t('group.npcParseFailed');
        return null;
      }

      // 转换为角色卡并保存到 character store
      const cardInput = generatedNpcToCard(npc);
      const newCharId = `npc-${Date.now()}`;
      const now = new Date().toISOString();
      const newCard: CharacterCard = {
        ...cardInput,
        id: newCharId,
        createdAt: now,
        updatedAt: now,
      } as CharacterCard;

      // 通过 store 的存储适配器保存（适配器由持久化工厂持有，此处取用）
      const adapter = getStorageAdapter();
      if (adapter) {
        try {
          await adapter.saveCharacter(newCard);
        } catch (err) {
          lastError.value = t('group.npcSaveFailed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      }

      // 添加到群聊成员（触发 join 系统消息）
      addMember(groupId, newCard);

      lastInfo.value = t('group.npcGenerated2', { name: npc.name });
      return newCharId;
    } catch (err) {
      lastError.value = t('group.npcGenFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      isGeneratingNpc.value = false;
    }
  }

  return {
    generateRandomNpc,
  };
}
