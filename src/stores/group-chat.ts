import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createGroupPersistenceOps } from './group-chat-persistence';
import { createGroupStOps } from './group-chat-st';
import { createGroupCrudOps } from './group-chat-crud';
import { createGroupMemberOps } from './group-chat-members';
import { createGroupSpeakingOps } from './group-chat-speaking';
import { createGroupMessageOps } from './group-chat-messages';
import { createGroupNpcOps } from './group-chat-npc';
import type { GroupChat } from '@/core/group-chat';

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
  // 群列表的加载闸门（深链 `?group=` 要用，见 src/composables/useDeepLinkId.ts）：
  // loaded = "读库已经跑完一次"；去重用的 loadInFlight 归持久化工厂。
  const loaded = ref(false);
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

  // ── UX-03：群聊消息游标分页（尾部窗口） ──
  // 长群聊一次性渲染全部消息会让 DOM 随消息数线性膨胀（PLAN_AUDIT UX-03：
  // GroupChatView 全量 v-for、无 cursor/pageSize）。采用尾部窗口 + 上翻扩页：
  // cursor = 当前可见条数，只渲染最近 N 条，向上翻阅按页扩窗，切换群组重置。
  // （单聊为完整双向虚拟化 spacer 方案；群聊消息含成员徽章等复杂行内布局，
  //  高度估算不可靠，故用无 spacer 的分页方案，DOM 上限 = 已翻阅页数 × 页大小。）
  const TURN_PAGE_SIZE = 60;
  const visibleTurnCursor = ref(TURN_PAGE_SIZE);

  const visibleMessages = computed(() => {
    const all = currentMessages.value;
    return all.length <= visibleTurnCursor.value
      ? all
      : all.slice(all.length - visibleTurnCursor.value);
  });

  const hasOlderTurns = computed(
    () => currentMessages.value.length > visibleTurnCursor.value
  );

  /** 窗口外更早的消息条数（UI 提示用） */
  const hiddenOlderCount = computed(() =>
    Math.max(0, currentMessages.value.length - visibleTurnCursor.value)
  );

  /** 向上扩一页（渲染更早的消息）；@returns 扩窗后是否还有更早的 */
  function loadOlderTurns(): boolean {
    const total = currentMessages.value.length;
    visibleTurnCursor.value = Math.min(total, visibleTurnCursor.value + TURN_PAGE_SIZE);
    return visibleTurnCursor.value < total;
  }

  /** 游标重置回默认页大小（切换 / 创建 / 删除群组时调用） */
  function resetTurnCursor(): void {
    visibleTurnCursor.value = TURN_PAGE_SIZE;
  }

  // ── 功能域工厂（R4-6：每块自持实例状态，宿主只装配 + 转发） ──
  const persistence = createGroupPersistenceOps({
    groups,
    currentGroupId,
    loaded,
    lastError,
  });
  const {
    setStorageAdapter,
    getStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    persistGroup,
    deleteFromStorage,
  } = persistence;

  const { exportGroupToStJson, downloadGroupSt, importGroupFromStFile } = createGroupStOps({
    groups,
    lastError,
    lastInfo,
    persistGroup,
  });

  const { selectGroup, createGroup, updateGroup, deleteGroup } = createGroupCrudOps({
    groups,
    currentGroupId,
    lastError,
    lastInfo,
    persistGroup,
    deleteFromStorage,
    resetTurnCursor,
  });

  const { addMember, removeMember, replaceMembers, archiveGroup, restoreGroup } =
    createGroupMemberOps({ groups, lastError, lastInfo, persistGroup });

  const { pickNextSpeaker, designateSpeaker, clearDesignatedSpeaker, mergeRemoteTurns } =
    createGroupSpeakingOps({ groups, persistGroup });

  const {
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    updateLastAssistantMessage,
    setMode,
  } = createGroupMessageOps({ groups, lastError, persistGroup });

  const { generateRandomNpc } = createGroupNpcOps({
    groups,
    lastError,
    lastInfo,
    isGeneratingNpc,
    getStorageAdapter,
    addMember,
  });

  // ── 单 ref 薄方法留宿主（§7.12 O-11：下放反多一层转发） ──

  function setInput(text: string): void {
    inputText.value = text;
  }

  function setStreaming(v: boolean): void {
    isStreaming.value = v;
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
    visibleMessages,
    hasOlderTurns,
    hiddenOlderCount,
    loadOlderTurns,
    // 依赖注入
    setStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    loaded,
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
    replaceMembers,
    mergeRemoteTurns,
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
    clearDesignatedSpeaker,
    updateAssistantMessage,
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
