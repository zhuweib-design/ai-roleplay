import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import type { CharacterCard } from '@/core/character-card';
import {
  type GroupChat,
  type GroupMember,
  type GroupChatCreateInput,
  type GroupChatMode,
  validateGroupChatInput,
  MAX_GROUP_MEMBERS,
} from '@/core/group-chat';
// F10.3 随机 NPC 生成（v1.1 新增）
import { createApiClient } from '@/api';
import { useSettingsStore } from './settings';
import { exportGroupChatToStJson, importGroupChatFromSt } from '@/core/st-compat';
import type { CharacterTemplateId } from '@core/character-generator';
import {
  type NpcSceneContext,
  buildNpcGenerationMessages,
  parseGeneratedNpc,
  generatedNpcToCard,
  validateNpcParams,
} from '@core/npc-generator';

/**
 * Group Chat Store (W3 · F10)
 *
 * 职责：
 * 1. 群聊列表 CRUD（内存 + 持久化）
 * 2. 当前选中群聊与消息历史
 * 3. 成员管理（添加/移除）
 * 4. 发言顺序控制（自然轮换 / 指定发言）
 *
 * 不负责：
 * - 角色卡 CRUD（由 character store 负责）
 * - API 调用（由 chat-manager + api-client 负责）
 */
export const useGroupChatStore = defineStore('groupChat', () => {
  // ── 状态 ──
  const groups = ref<GroupChat[]>([]);
  const currentGroupId = ref<string | null>(null);
  const isStreaming = ref(false);
  const inputText = ref('');
  // F10.3 随机 NPC 生成中状态
  const isGeneratingNpc = ref(false);

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  // 最近一次错误/提示
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // ── 计算属性 ──
  const currentGroup = computed(
    () => groups.value.find((g) => g.id === currentGroupId.value) ?? null
  );

  const currentMessages = computed(
    () => currentGroup.value?.messages ?? []
  );

  const currentMembers = computed(
    () => currentGroup.value?.members ?? []
  );

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadGroupChats();
      groups.value = list;
      if (list.length > 0 && !currentGroupId.value) {
        currentGroupId.value = list[0].id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function persistGroup(id: string): Promise<void> {
    if (!storageAdapter) return;
    const g = groups.value.find((x) => x.id === id);
    if (!g) return;
    try {
      g.updatedAt = new Date().toISOString();
      await storageAdapter.saveGroupChat(g);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteGroupChat(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── T-07: SillyTavern 群聊格式导入/导出 ──

  /** 导出群聊为 ST 格式 JSON 文本 */
  function exportGroupToStJson(groupId: string): string | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) {
      lastError.value = t('group.notFound');
      return null;
    }
    return exportGroupChatToStJson(g);
  }

  /** 触发下载 ST 格式群聊 JSON */
  function downloadGroupSt(groupId: string): boolean {
    const json = exportGroupToStJson(groupId);
    if (json === null) return false;
    const g = groups.value.find((x) => x.id === groupId);
    const safeName = (g?.name ?? 'group').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('group.stExportName', { name: safeName });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    lastInfo.value = t('group.exportedSt', { name: g?.name ?? '' });
    return true;
  }

  /**
   * 从 ST 格式 JSON 文件导入群聊
   * 成员角色须存在于本地（knownCharacterIds 由调用方传入，缺失的成员跳过）
   */
  async function importGroupFromStFile(
    file: File,
    knownCharacterIds: string[]
  ): Promise<string | null> {
    lastError.value = null;
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const chat = importGroupChatFromSt(json);
      // 校验成员角色存在
      const known = new Set(knownCharacterIds);
      const missing: string[] = [];
      const validMembers = chat.members.filter((m) => {
        const exists = known.has(m.characterId);
        if (!exists) missing.push(m.characterId);
        return exists;
      });
      if (validMembers.length < 2) {
        lastError.value = t('group.importNeedMembers2', { missing: missing.join('、') || t('lb.unnamed') });
        return null;
      }
      chat.members = validMembers;
      // 群聊消息中引用缺失角色的消息保留（仍可读）
      groups.value.push(chat);
      await persistGroup(chat.id);
      lastInfo.value =
        t('group.imported3', { name: chat.name, members: validMembers.length, msgs: chat.messages.length, skipped: '' }) +
        (missing.length > 0 ? t('group.importSkipped', { count: missing.length }) : '');
      return chat.id;
    } catch (err) {
      lastError.value = t('group.importFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // ── 群聊动作 ──

  function selectGroup(id: string): void {
    currentGroupId.value = id;
  }

  /**
   * 创建群聊
   * @param input 创建参数
   * @param characters 角色卡列表（用于构造成员和首消息）
   * @returns 新群聊 id（失败返回 null）
   */
  function createGroup(
    input: GroupChatCreateInput,
    characters: CharacterCard[]
  ): string | null {
    const errors = validateGroupChatInput(input);
    if (errors.length > 0) {
      lastError.value = t('group.createFailed', { errors: errors.join('；') });
      return null;
    }

    const id = `group-${Date.now()}`;
    const now = new Date().toISOString();

    // 构造成员列表
    const members: GroupMember[] = input.memberIds.map((charId) => {
      const card = characters.find((c) => c.id === charId);
      // F10.4 临时 NPC 标记（与 addMember 判定一致；修复：此前 createGroup 路径丢失该标记）
      const isTemp =
        card?.isTemporary === true ||
        (Array.isArray(card?.tags) && card.tags.includes('__temporary_npc'));
      return {
        characterId: charId,
        name: card?.name ?? t('group.unknownChar'),
        avatar: card?.avatar,
        talkativeness: card?.talkativeness,
        joinedAt: now,
        allowAutoSelect: true,
        isTemporary: isTemp,
      };
    });

    // 生成首消息（从成员的 alternateGreetings 中随机选取）
    let firstMessage = input.firstMessage ?? '';
    if (!firstMessage) {
      const candidates: { text: string; charName: string; charId: string }[] = [];
      members.forEach((m) => {
        const card = characters.find((c) => c.id === m.characterId);
        if (card?.alternateGreetings?.length) {
          card.alternateGreetings.forEach((g) => {
            if (g.trim()) {
              candidates.push({
                text: g,
                charName: m.name,
                charId: m.characterId,
              });
            }
          });
        }
      });
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        firstMessage = pick.text;
      } else if (members.length > 0) {
        // 兜底：使用第一个成员的 firstMessage
        const card = characters.find((c) => c.id === members[0].characterId);
        firstMessage = card?.firstMessage ?? '';
      }
    }

    const group: GroupChat = {
      id,
      name: input.name,
      description: input.description ?? '',
      members,
      firstMessage,
      messages: firstMessage
        ? [
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: firstMessage,
              timestamp: now,
              swipes: [],
              swipeIndex: 0,
              characterId: members[0]?.characterId,
              characterName: members[0]?.name,
              eventType: 'none',
            },
          ]
        : [],
      mode: input.mode ?? 'natural',
      lastSpeakerId: null,
      createdAt: now,
      updatedAt: now,
      lifecycleStatus: 'active',
      archivedAt: null,
    };

    groups.value.unshift(group);
    currentGroupId.value = id;
    void persistGroup(id);
    lastInfo.value = t('group.created', { name: group.name });
    return id;
  }

  /**
   * 更新群聊元信息
   */
  function updateGroup(
    id: string,
    patch: Partial<Pick<GroupChat, 'name' | 'description' | 'mode'>>
  ): boolean {
    const g = groups.value.find((x) => x.id === id);
    if (!g) return false;
    Object.assign(g, patch);
    void persistGroup(id);
    return true;
  }

  /**
   * 删除群聊
   */
  function deleteGroup(id: string): void {
    const idx = groups.value.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const removed = groups.value.splice(idx, 1)[0];
    void deleteFromStorage(id);
    lastInfo.value = t('group.deleted', { name: removed.name });
    if (currentGroupId.value === id) {
      currentGroupId.value = groups.value[0]?.id ?? null;
    }
  }

  // ── 成员动作 ──

  /**
   * 添加成员到群聊
   */
  function addMember(
    groupId: string,
    character: CharacterCard
  ): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊不允许添加成员
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoAdd');
      return false;
    }

    if (g.members.length >= MAX_GROUP_MEMBERS) {
      lastError.value = t('group.memberLimit2', { max: MAX_GROUP_MEMBERS });
      return false;
    }

    if (g.members.some((m) => m.characterId === character.id)) {
      lastError.value = t('group.alreadyInGroup');
      return false;
    }

    const now = new Date().toISOString();
    // F10.4 检测是否为临时 NPC（通过 isTemporary 标记或 tags 包含 __temporary_npc）
    const isTemp =
      character.isTemporary === true ||
      (Array.isArray((character as { tags?: unknown }).tags) &&
        ((character as { tags: string[] }).tags as string[]).includes('__temporary_npc'));

    g.members.push({
      characterId: character.id,
      name: character.name,
      avatar: character.avatar,
      talkativeness: character.talkativeness,
      joinedAt: now,
      allowAutoSelect: true,
      isTemporary: isTemp,
    });

    // 添加系统消息
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.joined', { name: character.name }),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'join',
    });

    void persistGroup(groupId);
    return true;
  }

  /**
   * 移除成员 (F10.4: 临时 NPC 离开后若群聊无临时 NPC 则自动归档)
   */
  function removeMember(groupId: string, characterId: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊不允许移除成员
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoRemove');
      return false;
    }

    const idx = g.members.findIndex((m) => m.characterId === characterId);
    if (idx < 0) return false;

    const removed = g.members.splice(idx, 1)[0];
    const now = new Date().toISOString();

    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.left', { name: removed.name }),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'leave',
    });

    // F10.4 若移除的是临时 NPC，检查剩余临时 NPC 数量
    // 所有临时 NPC 都离开后，群聊自动归档
    if (removed.isTemporary) {
      const remainingTempNpc = g.members.some((m) => m.isTemporary);
      if (!remainingTempNpc) {
        archiveGroupInternal(g, now);
        lastInfo.value = t('group.autoArchived', { name: removed.name });
        void persistGroup(groupId);
        return true;
      }
    }

    void persistGroup(groupId);
    return true;
  }

  // ── F10.4 临时群聊生命周期 ──

  /**
   * 归档群聊内部实现（不触发 persistGroup，由调用方负责持久化）
   */
  function archiveGroupInternal(g: GroupChat, now: string): void {
    g.lifecycleStatus = 'archived';
    g.archivedAt = now;
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.archivedReadonly2'),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });
  }

  /**
   * 手动归档群聊
   */
  function archiveGroup(groupId: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archived2');
      return false;
    }
    const now = new Date().toISOString();
    archiveGroupInternal(g, now);
    lastInfo.value = t('group.archivedDone', { name: g.name });
    void persistGroup(groupId);
    return true;
  }

  /**
   * 恢复归档的群聊（NPC 角色卡需仍存在）
   * @param groupId 群聊 ID
   * @param characterExists 校验函数，判断角色卡是否仍存在
   */
  function restoreGroup(
    groupId: string,
    characterExists?: (characterId: string) => boolean
  ): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;
    if (g.lifecycleStatus !== 'archived') {
      lastError.value = t('group.notArchived');
      return false;
    }

    // 校验所有成员的角色卡是否仍存在
    if (characterExists) {
      const missing = g.members.filter((m) => !characterExists(m.characterId));
      if (missing.length > 0) {
        lastError.value = t('group.restoreMissing', { names: missing.map((m) => m.name).join('、') });
        return false;
      }
    }

    g.lifecycleStatus = 'active';
    g.archivedAt = null;
    const now = new Date().toISOString();
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.restoredActive'),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });
    lastInfo.value = t('group.restoredDone', { name: g.name });
    void persistGroup(groupId);
    return true;
  }

  // ── 发言顺序控制 (F10.2) ──

  /**
   * 自然轮换：按健谈度概率选择下一位发言者
   * 同一角色不会连续两轮发言
   * @returns 选中的成员，或 null（无可用发言者）
   */
  function pickNextSpeaker(groupId: string): GroupMember | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return null;

    const candidates = g.members.filter(
      (m) => m.allowAutoSelect && m.characterId !== g.lastSpeakerId
    );

    if (candidates.length === 0) {
      // 退而求其次：允许 lastSpeaker 之外的所有成员
      const all = g.members.filter((m) => m.allowAutoSelect);
      if (all.length === 0) return null;
      // 唯一选择只能是上一位发言者
      return all[0];
    }

    // 按健谈度加权随机选择
    const weights = candidates.map((m) => {
      const t = m.talkativeness ?? 50;
      return Math.max(1, t); // 权重最低为 1
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * 指定下一位发言者（@角色名）
   */
  function designateSpeaker(
    groupId: string,
    characterId: string
  ): GroupMember | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return null;
    return (
      g.members.find((m) => m.characterId === characterId && m.allowAutoSelect) ??
      null
    );
  }

  // ── 消息动作 ──

  /**
   * 添加用户消息
   */
  function addUserMessage(groupId: string, content: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊为只读状态，不能发新消息
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoSend');
      return false;
    }

    const now = new Date().toISOString();
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });

    void persistGroup(groupId);
    return true;
  }

  /**
   * 添加 AI 消息（流式过程中调用）
   */
  function addAssistantMessage(
    groupId: string,
    characterId: string,
    characterName: string,
    content: string
  ): void {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return;

    const now = new Date().toISOString();
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      characterId,
      characterName,
      eventType: 'none',
    });

    g.lastSpeakerId = characterId;
    void persistGroup(groupId);
  }

  /**
   * 更新最后一条 AI 消息内容（流式更新）
   */
  function updateLastAssistantMessage(
    groupId: string,
    content: string
  ): void {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return;

    // 从末尾向前找最近的 assistant 消息
    for (let i = g.messages.length - 1; i >= 0; i--) {
      const msg = g.messages[i];
      if (msg.role === 'assistant' && msg.characterId) {
        msg.content = content;
        void persistGroup(groupId);
        return;
      }
    }
  }

  /**
   * 切换发言模式
   */
  function setMode(groupId: string, mode: GroupChatMode): void {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return;
    g.mode = mode;
    void persistGroup(groupId);
  }

  function setInput(text: string): void {
    inputText.value = text;
  }

  function setStreaming(v: boolean): void {
    isStreaming.value = v;
  }

  // ── F10.3 随机 NPC 生成 ──

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
    const messages = buildNpcGenerationMessages(params);

    isGeneratingNpc.value = true;

    try {
      // 调用 API（非流式，温度 1.0 增加创意，Token 限制 1000）
      const raw = await apiClient.chat({
        messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: 1000,
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

      // 通过 storageAdapter 保存（复用持久化逻辑）
      if (storageAdapter) {
        try {
          await storageAdapter.saveCharacter(newCard);
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

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  return {
    // 状态
    groups,
    currentGroupId,
    isStreaming,
    inputText,
    isGeneratingNpc,
    lastError,
    lastInfo,
    // 计算属性
    currentGroup,
    currentMessages,
    currentMembers,
    // 依赖注入
    setStorageAdapter,
    loadFromStorage,
    persistGroup,
    deleteFromStorage,
    // 群聊动作
    selectGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    // 成员动作
    addMember,
    removeMember,
    // F10.4 临时群聊生命周期
    archiveGroup,
    restoreGroup,
    // 发言顺序
    pickNextSpeaker,
    designateSpeaker,
    // 消息动作
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    setMode,
    setInput,
    setStreaming,
    // F10.3 随机 NPC 生成
    generateRandomNpc,
    // T-07: SillyTavern 群聊格式互导
    exportGroupToStJson,
    downloadGroupSt,
    importGroupFromStFile,
    clearLastError,
  };
});
