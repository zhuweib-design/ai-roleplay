<script setup lang="ts">
/**
 * GroupChatView — 群聊管理页 (W5 · F10.1-F10.2)
 *
 * 功能：
 * - 顶部 Header：群聊列表 + 创建按钮
 * - 主体：左侧群聊列表 + 右侧群聊消息区
 * - 创建群聊向导（Modal）：选择 2-8 个角色卡 + 群聊名 + 模式
 * - 多角色消息列表（每条 AI 消息显示角色名和头像）
 * - 发言顺序：自然轮换（自动）/ 指定发言（@角色名）
 * - 成员管理：添加/移除成员（不超过 8 人上限）
 *
 * 无障碍：
 * - 语义化 main / aside / section
 * - aria-live 区域通知新消息
 * - 键盘可访问（Tab 导航、Enter 发送、Esc 关闭弹窗）
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useDrilldown } from '@/composables/useDrilldown';
import { useViewport } from '@/core/viewport';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { createApiClient } from '@/api';
import { uiCharToCard } from '@/services/type-adapters';
import { buildGroupHistory, buildGroupSystemPrompt } from '@/services/group-chat-prompt';
import { recordGroupObservation } from '@/services/group-chat-runtime';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { parseNarrationSegments } from '@/core/narration';
import Icon from '@/components/common/Icon.vue';
import ChatModeSwitch from '@/components/chat/ChatModeSwitch.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import GroupInfoPanel from '@/components/group/GroupInfoPanel.vue';
import BottomSheet from '@/components/common/BottomSheet.vue';
import ContextReadinessBar from '@/components/layout/ContextReadinessBar.vue';
import Toast from '@/components/common/Toast.vue';
import ThinkingBlock from '@/components/chat/ThinkingBlock.vue';
import { resolveLatestStatus } from '@core/status-parser';
import type { GroupChatMode, GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';
// F10.3 随机 NPC 生成
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@core/character-generator';
import { t } from '@/i18n';
import { ChatManager, classifyChatError } from '@/services/chat-manager';

// 需求6 补充：群聊记录筛选（状态 + 关键词）
const groupFilter = ref<'all' | 'active' | 'archived'>('all');
const groupSearch = ref('');
const filteredGroups = computed(() => {
  const q = groupSearch.value.trim().toLowerCase();
  return groupStore.groups.filter((g) => {
    if (groupFilter.value === 'active' && g.lifecycleStatus === 'archived') return false;
    if (groupFilter.value === 'archived' && g.lifecycleStatus !== 'archived') return false;
    if (q && !g.name.toLowerCase().includes(q)) return false;
    return true;
  });
});

const groupStore = useGroupChatStore();
const chatStore = useChatStore();
const characterStore = useCharacterStore();
const settingsStore = useSettingsStore();
const router = useRouter();
const route = useRoute();

// E17：成员此前在界面上只是一个名字（看得见进不去）。点成员名直接到该角色的编辑页，
// 并带上来源，配合全局"返回来源页"让用户不会回不到群聊。
const { pushWithReturn } = useReadinessJump();
function editMember(characterId: string): void {
  pushWithReturn({ name: 'character-edit', params: { id: characterId } });
}

/** 返回对话页 */
function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

// 群聊 Runtime 状态查看：整块（含展开态记忆与成员选择）已搬进 GroupInfoPanel，
// 父组件不再持有这些状态——两处各存一份会分叉（桌面展开、手机收起）。

/** 手机端「群设置」抽屉开关（桌面用页头内联面板，不渲染抽屉） */
const settingsDrawerOpen = ref(false);

/**
 * 手机端「两级互换」（MOBILE_PLAN 批次 1-2）：群列表 → 群对话。
 * 桌面是并置两栏，level 恒为 1 且不写历史（useDrilldown 的默认行为）。
 */
const { isMobile } = useViewport();
const {
  level: swapLevel,
  open: openSwapDetail,
  goBack: swapGoBack,
} = useDrilldown({
  // 系统返回或页内返回落到一级时，顺手把抽屉收掉：抽屉盖在二级上，留着会遮住列表
  onLeaveDetail: () => {
    settingsDrawerOpen.value = false;
  },
});

/** 二级页的「← 全部群聊」：回列表级，同时把抽屉收掉 */
function backToGroupList(): void {
  settingsDrawerOpen.value = false;
  swapGoBack();
}

// ── UI 状态 ──
const createModalOpen = ref(false);
const deleteGroupTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const addMemberModalOpen = ref(false);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');


// ── 群聊生成中止 ──
// 当前进行中的 ChatManager；同一时刻只允许一个群聊生成，避免并发中止串扰。
let activeGroupManager: ChatManager | null = null;
// 本轮是否由用户主动中止；中止后不得提交公共回合，也不得投递旁听事件。
let groupGenerationAborted = false;


// ── F10.3 随机 NPC 生成状态 ──
const npcModalOpen = ref(false);
const selectedNpcTemplate = ref<CharacterTemplateId>('fantasy');
const npcGenerating = computed(() => groupStore.isGeneratingNpc);
const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

// 创建群聊表单
const newGroupName = ref('');
const newGroupDesc = ref('');
const newGroupMode = ref<GroupChatMode>('natural');
const selectedMemberIds = ref<Set<string>>(new Set());

// 添加成员弹窗的选择
const addMemberCandidates = ref<Set<string>>(new Set());

// @提及下拉
const showMentionDropdown = ref(false);
const mentionQuery = ref('');

// 当前选中要添加成员的群聊 id
const addMemberTargetGroupId = ref<string | null>(null);

// ── 计算属性 ──
const currentGroup = computed(() => groupStore.currentGroup);
const currentMessages = computed(() => groupStore.currentMessages);
const currentMembers = computed(() => groupStore.currentMembers);

// 当前群组是否存在未处理的群组定义 CAS 冲突
const currentGroupConflict = computed(() => {
  const conflict = chatStore.groupRuntimeConflict;
  if (!conflict || !currentGroup.value) return null;
  return conflict.groupId === currentGroup.value.id ? conflict : null;
});

const pendingRuntimeTurns = computed(() => {
  const groupId = currentGroup.value?.id;
  return groupId
    ? chatStore.pendingGroupRuntimeTurns.filter((item) => item.groupId === groupId)
    : [];
});

// 创建群聊时可选的角色卡（排除已选中的）
const availableCharacters = computed(() => characterStore.characters);

/** 各成员当前状态按 characterId 从公开回复中派生。 */
const memberStatuses = computed(() => {
  const group = currentGroup.value;
  if (!group) return [];
  return group.members
    .map((m) => {
      const schema =
        characterStore.characters.find((c) => c.id === m.characterId)?.statusSchema ?? null;
      const own = group.messages.filter((msg) => msg.characterId === m.characterId);
      return { characterId: m.characterId, name: m.name, status: resolveLatestStatus(own, schema) };
    })
    .filter((x) => x.status !== null);
});

// 添加成员弹窗中可选的角色卡（排除已在群聊中的）
const addMemberAvailable = computed(() => {
  if (!currentGroup.value) return [];
  const memberIds = new Set(currentGroup.value.members.map((m) => m.characterId));
  return characterStore.characters.filter((c) => !memberIds.has(c.id));
});

// @提及候选成员
const mentionCandidates = computed(() => {
  if (!currentGroup.value) return [];
  const q = mentionQuery.value.toLowerCase();
  return currentGroup.value.members.filter(
    (m) => m.allowAutoSelect && (q === '' || m.name.toLowerCase().includes(q))
  );
});

// ── 监听 store 错误 ──
watch(
  () => groupStore.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => groupStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// 首次进入或切换群聊时同步服务端历史（远端模式生效，本地模式为 no-op）
watch(
  () => groupStore.currentGroupId,
  (id) => {
    if (id) void syncRemoteTurnsForGroup(id);
  },
  { immediate: true }
);

// ── D-5（REAL_DEVICE_TEST_2026-10-03）：显式落底 ──
// 原实现 watch(messages.length) + messagesEndRef.scrollIntoView：
// 应用启动自动选中群组时（length 无 0→X 变化或 ref 未绑定）根本不触发，且 smooth
// 动画起步的低 scrollTop 会被触顶扩页误判（D-5 实测 scrollTop=0 停在列表顶部）。
// 改为：监听 currentGroupId（手动选择/自动选中/首载统一入口），双 nextTick + rAF
// 等布局与字体就绪后，直接把滚动容器置底；并用时间窗屏蔽随后的程序滚动事件。
function scrollToBottom(): void {
  const el = messagesAreaRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  lastScrollTop = el.scrollTop;
  suppressScrollUntil = Date.now() + 250;
}

async function scrollToBottomSoon(): Promise<void> {
  await nextTick();
  await nextTick();
  await new Promise((r) => requestAnimationFrame(r));
  scrollToBottom();
}

watch(
  () => groupStore.currentGroupId,
  () => {
    void scrollToBottomSoon();
  },
  { immediate: true }
);

// 监听消息列表变化，新消息到达时若已近底部则跟随滚底（保持既有行为）
watch(
  () => currentMessages.value.length,
  () => {
    const el = messagesAreaRef.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) void scrollToBottomSoon();
  }
);

// ── UX-03：游标分页 —— 顶部触顶 / 手动按钮加载更早消息，scrollTop 补偿保持阅读位置 ──
const messagesAreaRef = ref<HTMLElement | null>(null);
const loadingOlderTurns = ref(false);
// D-5：程序补偿滚动会派发真实 scroll 事件（异步、晚于 loadingOlderTurns 复位），
// 且平滑滚底起步阶段 scrollTop 极低——两类都不应被误判为"用户上滚到顶"。
// 用"上一次 scrollTop 方向判定 + 补偿后时间窗"双重过滤。
let lastScrollTop = 0;
let suppressScrollUntil = 0;

async function loadEarlier(): Promise<void> {
  if (loadingOlderTurns.value || !groupStore.hasOlderTurns) return;
  loadingOlderTurns.value = true;
  try {
    const beforeHeight = messagesAreaRef.value?.scrollHeight ?? 0;
    groupStore.loadOlderTurns();
    await nextTick();
    // 更早的消息在顶部展开，按新增高度补偿 scrollTop，避免阅读位置跳变
    const el = messagesAreaRef.value;
    if (el) {
      el.scrollTop += el.scrollHeight - beforeHeight;
      lastScrollTop = el.scrollTop;
    }
    // 补偿赋值派发的 scroll 事件异步到达——时间窗内一律视为程序滚动
    suppressScrollUntil = Date.now() + 250;
  } finally {
    loadingOlderTurns.value = false;
  }
}

function onMessagesScroll(): void {
  const el = messagesAreaRef.value;
  if (!el) return;
  // D-5：程序滚动时间窗内的 scroll 事件直接忽略（只更新方向基准）
  if (suppressScrollUntil > 0) {
    if (Date.now() < suppressScrollUntil) {
      lastScrollTop = el.scrollTop;
      return;
    }
    suppressScrollUntil = 0;
  }
  const goingUp = el.scrollTop < lastScrollTop;
  lastScrollTop = el.scrollTop;
  // 只有"用户上滚"才扩页——打开会话时的程序落底/平滑动画不再被误判
  if (goingUp && el.scrollTop <= 80) void loadEarlier();
}

// O-12（REAL_DEVICE_TEST_2026-10-03）：归档只读态显式化——输入框与发送按钮直接禁用，
// 不再等用户提交后才收到失败 toast（业务拦截仍保留，双保险）
const isArchivedReadonly = computed(() => currentGroup.value?.lifecycleStatus === 'archived');

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// ── 群聊列表操作 ──
function selectGroup(id: string) {
  groupStore.selectGroup(id);
  void syncRemoteTurnsForGroup(id);
  // 地址栏跟着当前群走（M15-d）：刷新或分享后仍落回这个群，深链的另一半。
  // 用 replace 是为了不让"连着点三个群"堆出三条历史记录。
  const navigate =
    route.query.group !== id
      ? router.replace({ query: { ...route.query, group: id } })
      : Promise.resolve();
  /**
   * 顺序是有讲究的：**必须在 router.replace 之后**才压自己那层。
   * vue-router 的 replace 是整体替换当前历史记录的 state，如果先 pushState 再 replace，
   * 我们打在 state 上的 `__aijiuDrilldown` 标记会被覆盖掉——于是"页内返回"认不出这一层
   * 是自己压的，history.back() 不会执行，用户按返回时会先遇到一条空记录。
   */
  void navigate
    .catch(() => undefined)
    .then(() => {
      if (!isMobile.value) return;
      settingsDrawerOpen.value = false;
      openSwapDetail(id);
    });
}

/**
 * 深链 `/group?group=<id>`（M15-d）。
 *
 * 这是 M15-a 把守卫升级成"按键核对"之后**新接的第一条**深链：目的之一是让
 * "下一个加深链的人"这条路径真跑一遍——群列表在读库完成前没有这个 id，
 * 所以必须走 useDeepLinkId 的闸门，而不是在 setup 里直查 `groups`。
 * 找不到就明确提示（不悄悄换群，理由同 M12-a 那次"写到别的角色身上"）。
 */
useDeepLinkId({
  key: 'group',
  // 闸门由登记表给：视图只说键名，不自己挑要等哪个库（M16-b 关掉"键对、库错"这条路）
  onResolved: (id) => {
    if (!groupStore.groups.some((g) => g.id === id)) {
      showToast('error', t('group.notFound'));
      return;
    }
    if (id !== groupStore.currentGroupId) selectGroup(id);
  },
});

/**
 * 拉取服务端公共回合并合并到本地历史（跨设备历史同步）。
 * 只在远端模式生效；合并按逻辑回合键幂等，重复切换不会产生重复消息。
 */
async function syncRemoteTurnsForGroup(groupId: string): Promise<void> {
  const group = groupStore.groups.find((item) => item.id === groupId);
  if (!group || group.members.length === 0) return;
  const result = await chatStore.fetchRemoteGroupTurns({
    group,
    characters: characterStore.characters,
  });
  if (result.enabled && result.turns.length > 0) {
    // 服务端成员 ID 是 Runtime UUID，需映射回本地角色卡
    const runtimeToLocal = new Map(
      characterStore.characters.map((character) => [
        chatStore.runtimeCharacterIdFor(character),
        character.id,
      ]),
    );
    groupStore.mergeRemoteTurns(groupId, result.turns, runtimeToLocal);
  }
  await chatStore.recoverRemoteGroupOutbox({ group, characters: characterStore.characters });
}

function openCreateModal() {
  newGroupName.value = '';
  newGroupDesc.value = '';
  newGroupMode.value = 'natural';
  selectedMemberIds.value = new Set();
  createModalOpen.value = true;
}

function toggleMemberSelection(charId: string) {
  if (selectedMemberIds.value.has(charId)) {
    selectedMemberIds.value.delete(charId);
  } else {
    if (selectedMemberIds.value.size >= 8) {
      showToast('error', t('group.maxMembers'));
      return;
    }
    selectedMemberIds.value.add(charId);
  }
}

function confirmCreate() {
  if (selectedMemberIds.value.size < 2) {
    showToast('error', t('group.minMembers'));
    return;
  }
  if (!newGroupName.value.trim()) {
    showToast('error', t('group.nameRequired'));
    return;
  }

  // 取角色卡完整数据
  const characters = characterStore.characters
    .filter((c) => selectedMemberIds.value.has(c.id))
    .map((c) => characterToCard(c));

  const id = groupStore.createGroup(
    {
      name: newGroupName.value.trim(),
      description: newGroupDesc.value.trim(),
      memberIds: Array.from(selectedMemberIds.value),
      mode: newGroupMode.value,
    },
    characters
  );

  if (id) {
    createModalOpen.value = false;
    /*
     * 手机：建完直接进这个群的对话。
     * 两级互换之后，一级只有列表——新建完留在列表上，用户看到的是"我建的群在哪"，
     * 还得再点一下才进得去。用户刚建完的下一步必然是说话，所以这里替他点这一下。
     * 桌面不动：两栏并置时新群已经在右侧出现过，再改 URL 是多余行为变更。
     */
    if (isMobile.value) selectGroup(id);
  }
}

function deleteGroup(id: string) {
  deleteGroupTargetId.value = id;
  deleteModalOpen.value = true;
}

function confirmDeleteGroup() {
  if (deleteGroupTargetId.value) {
    const id = deleteGroupTargetId.value;
    groupStore.deleteGroup(id);
    void chatStore.discardPendingGroupRuntimeTurns(id);
  }
  deleteModalOpen.value = false;
  deleteGroupTargetId.value = null;
}

// ── T-07: SillyTavern 群聊导入 ──
async function handleStImport(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  input.value = '';
  const knownIds = characterStore.characters.map((c) => c.id);
  const id = await groupStore.importGroupFromStFile(file, knownIds);
  if (id) {
    groupStore.selectGroup(id);
    return;
  }
  // O-23：同名/同 id 冲突 → 弹确认（覆盖该群聊全部消息）→ 用户确认后 force 重导
  if (groupStore.lastError && groupStore.lastError.includes(t('group.importDuplicate').split('「')[0]!)) {
    const confirmed = window.confirm(t('group.importOverwriteConfirm'));
    if (confirmed) {
      const forceId = await groupStore.importGroupFromStFile(file, knownIds, { force: true });
      if (forceId) groupStore.selectGroup(forceId);
    }
  }
}

// ── 成员管理 ──
function handleExportGroupSt() {
  const groupId = currentGroup.value?.id;
  if (!groupId) return;
  void groupStore.downloadGroupSt(groupId);
}

function openAddMemberModal() {
  if (!currentGroup.value) return;
  if (currentGroup.value.members.length >= 8) {
    showToast('error', t('group.maxMembers'));
    return;
  }
  addMemberTargetGroupId.value = currentGroup.value.id;
  addMemberCandidates.value = new Set();
  addMemberModalOpen.value = true;
}

function toggleAddMemberCandidate(charId: string) {
  if (addMemberCandidates.value.has(charId)) {
    addMemberCandidates.value.delete(charId);
  } else {
    addMemberCandidates.value.add(charId);
  }
}

async function confirmAddMembers(): Promise<void> {
  const group = currentGroup.value;
  if (!addMemberTargetGroupId.value || !group || group.id !== addMemberTargetGroupId.value) return;
  const targets = characterStore.characters.filter((c) => addMemberCandidates.value.has(c.id));
  for (const char of targets) {
    const synced = await chatStore.syncRemoteGroupMember({
      group,
      characters: characterStore.characters,
      memberCharacterId: char.id,
      operation: 'add',
    });
    if (!synced.synced) {
      showToast('error', t('group.runtimeMemberSyncFailed'));
      break;
    }
    groupStore.addMember(group.id, characterToCard(char));
  }
  addMemberModalOpen.value = false;
  addMemberTargetGroupId.value = null;
}

async function removeMember(member: GroupMember, e: Event): Promise<void> {
  e.stopPropagation();
  const group = currentGroup.value;
  if (!group) return;
  if (group.members.length <= 2) {
    showToast('error', t('group.minMembers'));
    return;
  }
  const synced = await chatStore.syncRemoteGroupMember({
    group,
    characters: characterStore.characters,
    memberCharacterId: member.characterId,
    operation: 'remove',
  });
  if (!synced.synced) {
    showToast('error', t('group.runtimeMemberSyncFailed'));
    return;
  }
  groupStore.removeMember(group.id, member.characterId);
}

// ── F10.3 随机 NPC 生成 ──

function openNpcModal() {
  if (!currentGroup.value) return;
  if (currentGroup.value.members.length >= 8) {
    showToast('error', t('group.maxMembers'));
    return;
  }
  if (!hasApiProfile.value) {
    showToast('error', t('group.apiRequired'));
    return;
  }
  npcModalOpen.value = true;
}

function selectNpcTemplate(id: CharacterTemplateId) {
  selectedNpcTemplate.value = id;
}

async function confirmGenerateNpc() {
  if (!currentGroup.value) return;
  const id = await groupStore.generateRandomNpc(
    currentGroup.value.id,
    selectedNpcTemplate.value
  );
  if (id) {
    npcModalOpen.value = false;
    showToast('success', t('group.npcGenerated'));
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

// ── F10.4 临时群聊生命周期 ──

async function archiveCurrentGroup(): Promise<void> {
  const group = currentGroup.value;
  if (!group) return;
  // 远端模式先同步归档，服务端成功后才修改本地生命周期，避免本地与服务端状态分叉。
  const synced = await chatStore.syncRemoteGroupStatus({
    group,
    characters: characterStore.characters,
    status: 'archived',
  });
  if (!synced.synced) {
    showToast('error', t('group.runtimeStatusSyncFailed'));
    return;
  }
  const ok = groupStore.archiveGroup(group.id);
  if (ok) {
    showToast('info', t('group.archived'));
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

async function restoreCurrentGroup(): Promise<void> {
  const group = currentGroup.value;
  if (!group) return;
  const synced = await chatStore.syncRemoteGroupStatus({
    group,
    characters: characterStore.characters,
    status: 'active',
  });
  if (!synced.synced) {
    showToast('error', t('group.runtimeStatusSyncFailed'));
    return;
  }
  // 成员卡缺失校验仍由 store 负责，保持既有错误文案与行为不变。
  const ok = groupStore.restoreGroup(
    group.id,
    (charId) => characterStore.characters.some((c) => c.id === charId)
  );
  if (ok) {
    showToast('success', t('group.restored'));
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

/**
 * 以服务端为准：把远端成员定义与状态应用回本地群聊，清除冲突。
 * 只对齐成员与生命周期，不改写本地消息历史。
 */
async function adoptRemoteGroupDefinition(): Promise<void> {
  const group = currentGroup.value;
  const conflict = currentGroupConflict.value;
  if (!group || !conflict) return;

  if (conflict.remoteMemberIds) {
    // 远端成员 ID 是 Runtime UUID，需映射回本地角色卡
    const runtimeToLocal = new Map(
      characterStore.characters.map((character) => [
        chatStore.runtimeCharacterIdFor(character),
        character.id,
      ]),
    );
    const remoteLocalIds = conflict.remoteMemberIds
      .map((runtimeId) => runtimeToLocal.get(runtimeId))
      .filter((id): id is string => Boolean(id));

    if (remoteLocalIds.length !== conflict.remoteMemberIds.length) {
      // 存在本地缺失的角色卡，不能静默丢弃成员
      showToast('error', t('group.runtimeConflictMissingCards'));
      return;
    }

    const kept = group.members.filter((member) => remoteLocalIds.includes(member.characterId));
    const added = remoteLocalIds
      .filter((localId) => !kept.some((member) => member.characterId === localId))
      .map((localId) => characterStore.characters.find((character) => character.id === localId))
      .filter((character): character is UICharacter => Boolean(character))
      .map((character) => characterToCard(character));
    const removedIds = group.members
      .filter((member) => !remoteLocalIds.includes(member.characterId))
      .map((member) => member.characterId);

    if (!groupStore.replaceMembers(group.id, kept, added, removedIds)) {
      showToast('error', groupStore.lastError ?? t('group.runtimeConflictApplyFailed'));
      return;
    }
  }

  if (conflict.remoteStatus && conflict.remoteStatus !== group.lifecycleStatus) {
    if (conflict.remoteStatus === 'archived') groupStore.archiveGroup(group.id);
    else groupStore.restoreGroup(group.id);
  }

  chatStore.clearGroupRuntimeConflict();
  showToast('success', t('group.runtimeConflictAdopted'));
}

async function retryPendingRuntimeTurns(): Promise<void> {
  const group = currentGroup.value;
  if (!group || groupStore.isStreaming || pendingRuntimeTurns.value.length === 0) return;
  for (const pending of [...pendingRuntimeTurns.value]) {
    const result = await chatStore.retryPendingGroupRuntimeTurn({
      group,
      characters: characterStore.characters,
      groupTurnId: pending.turnId,
    });
    if (!result.committed) {
      showToast('error', t('group.runtimeRetryFailed'));
      return;
    }
  }
  showToast('success', t('group.runtimeRetrySucceeded'));
}

// ── 消息发送 ──
/**
 * 停止当前群聊生成。
 * 保留已生成的部分内容，但本轮不提交公共回合，也不投递旁听事件。
 */
function stopGroupGeneration() {
  if (!activeGroupManager) return;
  groupGenerationAborted = true;
  activeGroupManager.stop();
}

function sendMessage() {
  const group = currentGroup.value;
  if (!group || groupStore.isStreaming) return;
  if (group.lifecycleStatus === 'archived') {
    showToast('error', t('group.archivedReadonly'));
    return;
  }
  const text = groupStore.inputText.trim();
  if (!text) return;
  const speaker = group.mode === 'natural'
    ? groupStore.pickNextSpeaker(group.id)
    : group.members.find((member) => member.characterId === group.designatedSpeakerId && member.allowAutoSelect);
  if (!speaker) {
    showToast('info', t('group.selectSpeaker'));
    return;
  }
  const character = characterStore.characters.find((item) => item.id === speaker.characterId);
  if (!character) {
    showToast('error', t('group.memberMissing'));
    return;
  }
  const profile = settingsStore.activeProfile;
  if (!profile) {
    showToast('error', t('group.apiRequired'));
    return;
  }
  if (!groupStore.addUserMessage(group.id, text)) {
    if (groupStore.lastError) showToast('error', groupStore.lastError);
    return;
  }
  const userMessageId = group.messages.at(-1)!.id;
  groupStore.setInput('');
  void generateGroupReply(group.id, speaker, character, userMessageId, text, profile);
}

async function generateGroupReply(
  groupId: string,
  speaker: GroupMember,
  character: UICharacter,
  userMessageId: string,
  text: string,
  profile: NonNullable<ReturnType<typeof useSettingsStore>['activeProfile']>
): Promise<void> {
  const current = groupStore.groups.find((item) => item.id === groupId);
  if (!current) return;
  // 固定本轮的群组定义与历史，避免生成期间 UI 变更导致上下文和提交使用不同成员。
  const group = { ...current, members: current.members.map((member) => ({ ...member })),
    messages: current.messages.map((message) => ({ ...message })) };
  groupStore.setStreaming(true);
  groupGenerationAborted = false;
  const card = uiCharToCard(character);
  let messageId: string | null = null;
  let thinking = '';
  const generationErrors: Error[] = [];
  try {
    const runtime = await chatStore.ensureGroupRuntimeIntegration({
      group, characters: characterStore.characters, speakerCharacterId: speaker.characterId,
    });
    const manager = new ChatManager({
      apiClient: createApiClient(profile),
      model: profile.model,
      systemPrompt: buildGroupSystemPrompt(group, speaker),
      // 旁白人称：群聊已接同一套分段渲染（见 segmentsOf 与 .msg-psy），所以这里照常注入；
      // 规则文本由 buildPrompt 追加，不在 buildGroupSystemPrompt 里另写一份
      narrationPerspective: settingsStore.narrationPerspective,
    });
    activeGroupManager = manager;
    const reply = await manager.sendMessage({
      card,
      history: buildGroupHistory(group, speaker, userMessageId),
      userMessage: text,
      runtimeTurnId: userMessageId,
      // 服务端群聊模式下由公共 Turn 事务统一写入所有成员 Event。
      persistRuntime: !(typeof import.meta.env.VITE_RUNTIME_BASE_URL === 'string' && import.meta.env.VITE_RUNTIME_BASE_URL.trim()),
      runtime: runtime ?? undefined,
    }, {
      onThinking: (_delta, full) => { thinking = full; },
      onDelta: (_delta, full) => {
        if (!full) return;
        if (!messageId) messageId = groupStore.addAssistantMessage(groupId, speaker.characterId, speaker.name, full);
        else groupStore.updateAssistantMessage(groupId, messageId, { content: full, thinking });
      },
      onStatus: (status) => {
        if (messageId && status) groupStore.updateAssistantMessage(groupId, messageId, { status });
      },
      onError: (error) => {
        if (classifyChatError(error) === 'aborted') groupGenerationAborted = true;
        else generationErrors.push(error);
      },
    });
    if (reply) {
      if (!messageId) messageId = groupStore.addAssistantMessage(groupId, speaker.characterId, speaker.name, reply);
      if (messageId) groupStore.updateAssistantMessage(groupId, messageId, { content: reply, thinking });
      // 用户主动中止：保留已生成的部分内容，但不提交公共回合，也不投递旁听事件。
      const runtimeCommit = !groupGenerationAborted && generationErrors.length === 0 && messageId
        ? await chatStore.commitRuntimeGroupTurn({
          group,
          characters: characterStore.characters,
          speakerCharacterId: speaker.characterId,
          turnId: userMessageId,
          userMessage: text,
          assistantMessage: reply,
        })
        : { enabled: false, committed: false };
      if (runtimeCommit.enabled) {
        if (runtimeCommit.committed && group.mode === 'designated') {
          groupStore.clearDesignatedSpeaker(groupId, speaker.characterId);
        }
        if (!runtimeCommit.committed) showToast('error', t('group.runtimeCommitFailed'));
      } else if (!groupGenerationAborted && generationErrors.length === 0 && messageId) {
        if (group.mode === 'designated') groupStore.clearDesignatedSpeaker(groupId, speaker.characterId);
        // 本地 Runtime 模式下保留原有逐成员旁听路径；远程模式由服务端事务统一扇出。
        await Promise.allSettled(group.members
          .filter((member) => member.characterId !== speaker.characterId)
          .map(async (member) => {
            const listener = characterStore.characters.find((item) => item.id === member.characterId);
            if (!listener) return;
            const integration = await chatStore.ensureRuntimeIntegration(listener, uiCharToCard(listener), 'group-' + groupId);
            if (!integration) return;
            await recordGroupObservation(integration, {
              groupId,
              assistantMessageId: messageId!,
              speakerId: speaker.characterId,
              userMessage: text,
              assistantMessage: reply,
            });
          }));
      }
    }
    if (groupGenerationAborted) {
      showToast('info', t('chat.stopGenerating'));
    } else if (generationErrors.length > 0 || !reply) {
      showToast('error', generationErrors[0]?.message ?? t('group.emptyReply'));
    }
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : String(error));
  } finally {
    activeGroupManager = null;
    groupStore.setStreaming(false);
  }
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function onInputChange(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  groupStore.setInput(value);

  // @提及检测
  const lastAtIndex = value.lastIndexOf('@');
  if (lastAtIndex >= 0) {
    const textAfterAt = value.slice(lastAtIndex + 1);
    if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
      mentionQuery.value = textAfterAt;
      showMentionDropdown.value = true;
      return;
    }
  }
  showMentionDropdown.value = false;
}

function insertMention(member: GroupMember) {
  if (!currentGroup.value) return;
  const text = groupStore.inputText;
  const lastAtIndex = text.lastIndexOf('@');
  if (lastAtIndex >= 0) {
    const newText =
      text.slice(0, lastAtIndex + 1) + member.name + ' ' + text.slice(lastAtIndex + 1 + mentionQuery.value.length);
    groupStore.setInput(newText);
    // 触发指定发言
    const speaker = groupStore.designateSpeaker(currentGroup.value.id, member.characterId);
    if (speaker) {
      showToast('info', t('group.mentionAssigned', { name: member.name }));
    }
  }
  showMentionDropdown.value = false;
}

function setMode(mode: GroupChatMode) {
  if (!currentGroup.value) return;
  groupStore.setMode(currentGroup.value.id, mode);
}

// ── 辅助 ──
function characterToCard(c: UICharacter): import('@core/character-card').CharacterCard {
  return {
    ...uiCharToCard(c),
    firstMessage: c.messages[0]?.content ?? '',
    alternateGreetings: c.messages.slice(1).map((message) => message.content),
  };
}

function memberInitial(name: string): string {
  return name.charAt(0) || '?';
}

/** 群聊与单聊共用同一套分段解析，避免两处各写一份、行为慢慢分叉 */
function segmentsOf(content: string) {
  const parsed = parseNarrationSegments(content);
  return parsed.some((s) => s.kind === 'speech')
    ? parsed
    : [{ kind: 'speech' as const, text: content }];
}

function messageTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function isUser(msg: { role: string }): boolean {
  return msg.role === 'user';
}

function isSystem(msg: { role: string }): boolean {
  return msg.role === 'system';
}
</script>

<template>
  <div class="group-chat-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('group.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('group.back') }}</span>
        </button>
        <h1>{{ t('group.title') }}</h1>
        <span class="header-count">{{ t('group.count', { count: groupStore.groups.length }) }}</span>
        <!-- 群聊不占移动端底栏 tab（见 core/mobile-nav.ts），这一行就是它在页内的位置指示 -->
        <ChatModeSwitch class="group-mode-switch-slot" />
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn new-btn"
          :aria-label="t('group.newAria')"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="16" />
          <span class="btn-label">{{ t('group.new') }}</span>
        </button>
      </div>
    </header>

    <!--
      群聊与单聊的能力集不同：不加载世界书、不做文档检索、角色级模型参数不生效。
      与其让用户假设一致，不如在页头把差异说出来（E18/E08 的"显式声明不存在"）。
    -->
    <ContextReadinessBar />
    <p class="group-capability-note" role="note" v-tip="t('group.capabilityNote')">
      {{ t('group.capabilityNote') }}
    </p>

    <!-- 主体：桌面并置两栏；手机两级互换（群列表 → 群对话），由 .m-swap 切换 -->
    <div class="group-body m-swap" :data-level="swapLevel">
      <!-- 左侧群聊列表（手机：一级页，满屏） -->
      <aside class="group-list-panel m-swap__master tk-scroll" :aria-label="t('group.listAria')">
        <!-- 需求6 筛选：状态 + 关键词 -->
        <div class="group-filter-bar">
          <div class="group-filter-tabs" role="tablist" :aria-label="t('group.filterAria')">
            <button
              v-for="f in ([
                { id: 'all', label: t('group.filterAll') },
                { id: 'active', label: t('group.filterActive') },
                { id: 'archived', label: t('group.filterArchived') },
              ] as const)"
              :key="f.id"
              type="button"
              class="filter-tab"
              :class="{ active: groupFilter === f.id }"
              role="tab"
              :aria-selected="groupFilter === f.id"
              @click="groupFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <input
            v-model="groupSearch"
            type="search"
            class="group-search-input"
            :placeholder="t('group.searchPlaceholder')"
            :aria-label="t('group.searchAria')"
          />
        </div>
        <ul class="group-list" role="list">
          <li v-for="g in filteredGroups" :key="g.id" role="listitem">
            <button
              type="button"
              class="group-item"
              :class="{
                active: g.id === groupStore.currentGroupId,
                archived: g.lifecycleStatus === 'archived',
              }"
              :aria-current="g.id === groupStore.currentGroupId ? 'true' : undefined"
              @click="selectGroup(g.id)"
            >
              <div class="group-avatar">
                <Icon name="users" :size="20" />
              </div>
              <div class="group-info">
                <div class="group-name">
                  {{ g.name }}
                  <span v-if="g.lifecycleStatus === 'archived'" class="archived-badge">{{ t('group.archivedBadge') }}</span>
                </div>
                <div class="group-meta">{{ t('group.meta', { members: g.members.length, messages: g.messages.length }) }}</div>
              </div>
            </button>
          </li>
          <EmptyState
            v-if="filteredGroups.length === 0"
            as="li"
            :title-key="groupStore.groups.length === 0 ? 'group.noGroups' : 'group.noMatch'"
            icon="users"
            :action-key="groupStore.groups.length === 0 ? 'group.createFirst' : undefined"
            @action="openCreateModal"
          />
        </ul>
      </aside>

      <!-- 右侧群聊主区（手机：二级页，满屏） -->
      <main class="group-main-panel m-swap__detail" id="main-content" tabindex="-1">
        <div v-if="!currentGroup" class="empty-group">
          <Icon name="users" :size="48" />
          <p>{{ t('group.selectHint') }}</p>
          <button type="button" class="primary-btn" @click="openCreateModal">
            {{ t('group.createNew') }}
          </button>
        </div>

        <div v-else class="group-content">
          <!-- 群聊信息栏 -->
          <header class="group-header" :class="{ 'is-compact': isMobile }">
            <div class="group-title-row">
              <!-- 手机：回列表级。文案说出目的地（「全部群聊」）而不是裸的「返回」 -->
              <button
                v-if="isMobile"
                type="button"
                class="m-swap__back"
                :aria-label="t('group.allGroups')"
                @click="backToGroupList"
              >
                <Icon name="arrow-left" :size="16" />
                <span>{{ t('group.allGroups') }}</span>
              </button>
              <h2>
                {{ currentGroup.name }}
                <span
                  v-if="currentGroup.lifecycleStatus === 'archived'"
                  class="lifecycle-badge archived"
                >
                  {{ t('group.archivedBadge') }}
                </span>
              </h2>
              <!-- 手机：群设置入口。动作 / 成员 / Runtime / 发言模式全在抽屉里 -->
              <button
                v-if="isMobile"
                type="button"
                class="group-settings-btn"
                :aria-label="t('group.settingsOpenAria')"
                @click="settingsDrawerOpen = true"
              >
                <Icon name="menu" :size="16" />
                <span>{{ t('group.settingsTitle') }}</span>
              </button>
            </div>

            <!--
              桌面：整块内联在页头（动作组一行、成员条一行、模式一行）。
              手机：这一块不渲染，改由页脚那个 BottomSheet 抽屉承载。
              两处是**同一个组件**——模板只有一份，否则"桌面能归档、手机不能"是迟早的事。
            -->
            <GroupInfoPanel
              v-if="!isMobile"
              :group="currentGroup"
              :members="currentMembers"
              :statuses="memberStatuses"
              :pending-count="pendingRuntimeTurns.length"
              :conflict="currentGroupConflict !== null"
              :streaming="groupStore.isStreaming"
              @add-member="openAddMemberModal"
              @generate-npc="openNpcModal"
              @archive="archiveCurrentGroup"
              @restore="restoreCurrentGroup"
              @remove="deleteGroup(currentGroup.id)"
              @export-st="handleExportGroupSt"
              @import-st="handleStImport"
              @set-mode="setMode"
              @edit-member="editMember"
              @remove-member="removeMember"
              @retry-runtime="retryPendingRuntimeTurns"
              @adopt-conflict="adoptRemoteGroupDefinition"
              @dismiss-conflict="chatStore.clearGroupRuntimeConflict()"
            />
          </header>

          <!-- 消息列表 -->
          <section
            ref="messagesAreaRef"
            class="messages-area tk-scroll"
            role="log"
            aria-live="polite"
            :aria-label="t('group.messagesAria')"
            @scroll="onMessagesScroll"
          >
            <!-- UX-03：游标分页 —— 窗口外更早的消息按页加载 -->
            <div v-if="groupStore.hasOlderTurns" class="load-earlier-row">
              <button
                type="button"
                class="load-earlier-btn"
                :disabled="loadingOlderTurns"
                @click="loadEarlier"
              >
                {{ t('group.loadEarlier', { count: groupStore.hiddenOlderCount }) }}
              </button>
            </div>
            <div
              v-for="msg in groupStore.visibleMessages"
              :key="msg.id"
              class="msg-row"
              :class="{
                'msg-user': isUser(msg),
                'msg-assistant': msg.role === 'assistant',
                'msg-system': isSystem(msg),
              }"
            >
              <template v-if="isSystem(msg)">
                <div class="msg-system-content">
                  {{ msg.content }}
                </div>
              </template>
              <template v-else>
                <Avatar
                  v-if="msg.role === 'assistant'"
                  :character="{
                    id: msg.characterId ?? '',
                    name: msg.characterName ?? '',
                    avatar: currentMembers.find((m) => m.characterId === msg.characterId)?.avatar,
                    avatarType: 'gradient',
                    initial: memberInitial(msg.characterName ?? ''),
                  } as UICharacter"
                  :size="32"
                />
                <!-- 一条回复可能拆成「对白 — 心理 — 对白」：心理段要落在气泡外面，
                     所以气泡从"整条消息的外壳"降级为"每段对白一个气泡"，
                     外壳换成 .msg-body（纵向），发言人名/思考/时间挂在外壳上。 -->
                <div class="msg-body">
                  <div v-if="msg.role === 'assistant'" class="msg-sender">
                    {{ msg.characterName }}
                  </div>
                  <ThinkingBlock
                    v-if="msg.role === 'assistant'"
                    :thinking="msg.thinking"
                    :message-id="msg.id"
                  />
                  <template v-for="(seg, si) in segmentsOf(msg.content)" :key="si">
                    <div v-if="seg.kind === 'speech'" class="msg-bubble">
                      <div class="msg-content">{{ seg.text }}</div>
                    </div>
                    <p v-else class="msg-psy">{{ seg.text }}</p>
                  </template>
                  <div class="msg-time">{{ messageTime(msg.timestamp) }}</div>
                </div>
              </template>
            </div>
            <div aria-hidden="true" />
          </section>

          <!-- 输入区 -->
          <footer class="input-area">
            <div class="input-wrapper">
              <textarea
                :value="groupStore.inputText"
                @input="onInputChange"
                @keydown="onInputKeydown"
                :placeholder="isArchivedReadonly ? t('group.archivedReadonlyPlaceholder') : t('group.inputPlaceholder')"
                :aria-label="t('group.inputAria')"
                rows="2"
                class="msg-input"
                :disabled="groupStore.isStreaming || isArchivedReadonly"
              />
              <!-- @提及下拉 -->
              <div
                v-if="showMentionDropdown && mentionCandidates.length > 0"
                class="mention-dropdown"
                role="listbox"
                :aria-label="t('group.mentionAria')"
              >
                <button
                  v-for="member in mentionCandidates"
                  :key="member.characterId"
                  type="button"
                  class="mention-item"
                  role="option"
                  @click="insertMention(member)"
                >
                  <Avatar
                    :character="{
                      id: member.characterId,
                      name: member.name,
                      avatar: member.avatar,
                      avatarType: member.avatar ? 'image' : 'gradient',
                      initial: memberInitial(member.name),
                    } as UICharacter"
                    :size="20"
                  />
                  <span>{{ member.name }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="!groupStore.isStreaming"
              type="button"
              class="send-btn"
              :disabled="!groupStore.inputText.trim() || isArchivedReadonly"
              :aria-label="t('group.sendAria')"
              @click="sendMessage"
            >
              <Icon name="send" :size="16" />
            </button>
            <button
              v-else
              type="button"
              class="send-btn stop-btn"
              :aria-label="t('chat.stopGenerating')"
              @click="stopGroupGeneration"
            >
              <Icon name="stop" :size="14" />
            </button>
            <span v-if="groupStore.isStreaming" role="status" aria-live="polite">{{ t('bubble.generatingText') }}</span>
          </footer>
        </div>
      </main>
    </div>

    <!--
      手机「群设置」抽屉：动作 / 成员 / Runtime / 发言模式 / 成员状态。
      桌面不渲染——页头内联的是同一个 GroupInfoPanel，模板只有一份。
    -->
    <BottomSheet
      v-if="isMobile && currentGroup"
      :open="settingsDrawerOpen"
      :heading="t('group.settingsTitle')"
      @close="settingsDrawerOpen = false"
    >
      <GroupInfoPanel
        layout="sheet"
        :group="currentGroup"
        :members="currentMembers"
        :statuses="memberStatuses"
        :pending-count="pendingRuntimeTurns.length"
        :conflict="currentGroupConflict !== null"
        :streaming="groupStore.isStreaming"
        @add-member="openAddMemberModal"
        @generate-npc="openNpcModal"
        @archive="archiveCurrentGroup"
        @restore="restoreCurrentGroup"
        @remove="deleteGroup(currentGroup.id)"
        @export-st="handleExportGroupSt"
        @import-st="handleStImport"
        @set-mode="setMode"
        @edit-member="editMember"
        @remove-member="removeMember"
        @retry-runtime="retryPendingRuntimeTurns"
        @adopt-conflict="adoptRemoteGroupDefinition"
        @dismiss-conflict="chatStore.clearGroupRuntimeConflict()"
      />
    </BottomSheet>

    <!-- 创建群聊向导 -->
    <Modal
      v-model="createModalOpen"
      :title="t('group.createTitle')"
    >
      <div class="create-form">
        <div class="form-row">
          <label class="form-label" for="new-group-name">{{ t('group.createName') }}</label>
          <input
            id="new-group-name"
            v-model="newGroupName"
            type="text"
            class="form-input"
            :placeholder="t('group.createNamePlaceholder')"
            maxlength="50"
          />
        </div>

        <div class="form-row">
          <label class="form-label" for="new-group-desc">{{ t('group.createDesc') }}</label>
          <textarea
            id="new-group-desc"
            v-model="newGroupDesc"
            class="form-textarea"
            :placeholder="t('group.createDescPlaceholder')"
            rows="2"
          />
        </div>

        <div class="form-row">
          <span class="form-label">{{ t('group.createMode') }}</span>
          <div class="mode-options" role="radiogroup" :aria-label="t('group.createModeAria')">
            <button
              type="button"
              role="radio"
              :aria-checked="newGroupMode === 'natural'"
              class="mode-option"
              :class="{ active: newGroupMode === 'natural' }"
              @click="newGroupMode = 'natural'"
            >
              <Icon name="refresh-cw" :size="14" />
              <div>
                <div class="mode-name">{{ t('group.modeNatural') }}</div>
                <div class="mode-desc">{{ t('group.modeNaturalDesc') }}</div>
              </div>
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="newGroupMode === 'designated'"
              class="mode-option"
              :class="{ active: newGroupMode === 'designated' }"
              @click="newGroupMode = 'designated'"
            >
              <Icon name="user" :size="14" />
              <div>
                <div class="mode-name">{{ t('group.modeDesignated') }}</div>
                <div class="mode-desc">{{ t('group.modeDesignatedDesc') }}</div>
              </div>
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span class="form-label">{{ t('group.selectMembers', { count: selectedMemberIds.size }) }}</span>
          </div>
          <ul class="char-pick-list tk-scroll" role="group" :aria-label="t('group.charPickAria')">
            <li v-for="c in availableCharacters" :key="c.id">
              <button
                type="button"
                class="char-pick"
                :class="{ selected: selectedMemberIds.has(c.id) }"
                :aria-pressed="selectedMemberIds.has(c.id)"
                @click="toggleMemberSelection(c.id)"
              >
                <Avatar :character="c" :size="32" />
                <div class="char-pick-info">
                  <div class="char-pick-name">{{ c.name }}</div>
                  <div class="char-pick-tags">{{ c.tags.slice(0, 2).join('、') }}</div>
                </div>
                <Icon
                  v-if="selectedMemberIds.has(c.id)"
                  name="check"
                  :size="16"
                  class="check-icon"
                />
              </button>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="createModalOpen = false"
        >
          {{ t('group.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmCreate"
        >
          {{ t('group.create') }}
        </button>
      </template>
    </Modal>

    <!-- 添加成员弹窗 -->
    <Modal
      v-model="addMemberModalOpen"
      :title="t('group.addMemberTitle')"
      described-by="add-member-hint"
    >
      <div class="add-member-form">
        <p id="add-member-hint" class="form-hint">{{ t('group.addMemberHint') }}</p>
        <ul class="char-pick-list tk-scroll" role="group" :aria-label="t('group.charPickAria')">
          <li v-for="c in addMemberAvailable" :key="c.id">
            <button
              type="button"
              class="char-pick"
              :class="{ selected: addMemberCandidates.has(c.id) }"
              :aria-pressed="addMemberCandidates.has(c.id)"
              @click="toggleAddMemberCandidate(c.id)"
            >
              <Avatar :character="c" :size="32" />
              <div class="char-pick-info">
                <div class="char-pick-name">{{ c.name }}</div>
                <div class="char-pick-tags">{{ c.tags.slice(0, 2).join('、') }}</div>
              </div>
              <Icon
                v-if="addMemberCandidates.has(c.id)"
                name="check"
                :size="16"
                class="check-icon"
              />
            </button>
          </li>
          <li v-if="addMemberAvailable.length === 0" class="empty-add">
            <p>{{ t('group.allMembersIn') }}</p>
          </li>
        </ul>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="addMemberModalOpen = false"
        >
          {{ t('group.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmAddMembers"
        >
          {{ t('group.add') }}
        </button>
      </template>
    </Modal>

    <!-- 删除确认 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('group.deleteTitle')"
      described-by="group-delete-desc"
    >
      <p id="group-delete-desc">{{ t('group.deleteConfirm') }}</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('group.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm modal-danger"
          @click="confirmDeleteGroup"
        >
          {{ t('group.delete') }}
        </button>
      </template>
    </Modal>

    <!-- F10.3 随机 NPC 生成弹窗 -->
    <Modal
      v-model="npcModalOpen"
      :title="t('group.npcTitle')"
      described-by="npc-hint"
    >
      <div class="npc-generate-form">
        <p id="npc-hint" class="form-hint">
          {{ t('group.npcHint') }}
        </p>

        <!-- 生成中状态 -->
        <div v-if="npcGenerating" class="npc-generating-state" role="status" aria-live="polite">
          <div class="gen-spinner" aria-hidden="true"></div>
          <p>{{ t('group.npcGenerating') }}</p>
        </div>

        <!-- 模板选择 -->
        <div v-else class="npc-template-grid" role="radiogroup" :aria-label="t('group.npcTemplateAria')">
          <button
            v-for="tpl in CHARACTER_TEMPLATES"
            :key="tpl.id"
            type="button"
            role="radio"
            :aria-checked="selectedNpcTemplate === tpl.id"
            class="npc-template-card"
            :class="{ selected: selectedNpcTemplate === tpl.id }"
            @click="selectNpcTemplate(tpl.id)"
          >
            <div class="tpl-label">{{ tpl.label }}</div>
            <div class="tpl-desc">{{ tpl.description }}</div>
          </button>
        </div>

        <!-- 群聊人数提示 -->
        <p v-if="currentGroup && currentGroup.members.length >= 7" class="npc-warn">
          {{ t('group.npcWarn', { count: currentGroup.members.length, left: 8 - currentGroup.members.length }) }}
        </p>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          :disabled="npcGenerating"
          @click="npcModalOpen = false"
        >
          {{ t('group.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          :disabled="npcGenerating"
          @click="confirmGenerateNpc"
        >
          {{ npcGenerating ? t('group.generatingNpc') : t('group.npcGenerateBtn') }}
        </button>
      </template>
    </Modal>

    <!-- Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.group-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
  color: var(--foreground);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-count {
  font-size: 12px;
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  /*
    页头多了"单聊 ⇄ 群聊"这一段之后，390px 宽度放不下原来那一排：
    计数与返回按钮的文字先让位（返回按钮的 aria-label 仍在，读屏与截图都拿得到名字），
    主操作"新建群聊"的文字保留——它是这页唯一的入口，不能只剩一个加号。
  */
  .header-title {
    gap: 8px;
    min-width: 0;
  }

  .header-count {
    display: none;
  }

  .header-btn.back .btn-label {
    display: none;
  }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.header-btn.back {
  background: none;
  border-color: transparent;
}

.header-btn.new-btn {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.new-btn:hover {
    opacity: 0.9;
  }
}

.group-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 0;
  overflow: hidden;
}

/* 左侧群聊列表 */
.group-list-panel {
  border-right: 1px solid var(--border);
  background: var(--card);
  overflow-y: auto;
}

/* 需求6 筛选栏 */
.group-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.group-filter-tabs {
  display: flex;
  gap: 4px;
}
.filter-tab {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.filter-tab.active {
  border-color: var(--ring);
  color: var(--text-primary);
  font-weight: 600;
}
.filter-tab:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.group-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-primary);
  font-size: 13px;
}
.group-search-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.group-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}



.link-btn {
  background: none;
  border: none;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .group-item:hover {
    background: var(--card-elevated);
  }
}

.group-item.active {
  background: var(--card-elevated);
  border-left-color: var(--primary);
}

.group-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.group-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-meta {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

/* 右侧主区 */
.group-main-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
}

.empty-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted-foreground);
}

.empty-group p {
  margin: 0;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .primary-btn:hover {
    opacity: 0.9;
  }
}

.group-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 群聊信息栏 */
.group-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 窄屏实测（2026-10-16 模拟器 412px）：不换行 + 标题没有 min-width:0 时，
     flex 会把标题和 6 个按钮一起压到"内容最小宽"以下 ⇒ 标题变成一列一个字。
     允许换行 + 放开收缩下限，窄屏下按钮整排另起一行，标题保持一行。 */
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.group-title-row h2 {
  margin: 0;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
}

.group-item.archived {
  opacity: 0.6;
}

.archived-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  background: color-mix(in srgb, var(--muted-foreground) 15%, transparent);
  border-radius: var(--radius-pill, 999px);
  vertical-align: middle;
}

/* 群聊标题中的生命周期徽章 */
.lifecycle-badge.archived {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent);
  border-radius: var(--radius-pill, 999px);
  vertical-align: middle;
}

/* F10.3 NPC 生成 Modal */
.npc-generate-form {
  padding: 4px 0;
}

.npc-generate-form .form-hint {
  margin: 0 0 16px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.npc-template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.npc-template-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border, #3a3d52);
  border-radius: var(--radius-md, 8px);
  background: var(--card-elevated, #1c1e2a);
  color: var(--foreground, #f5f5f7);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .npc-template-card:hover {
    border-color: var(--accent-orange);
  }
}

.npc-template-card.selected {
  border-color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
}

.npc-template-card .tpl-label {
  font-weight: 600;
  font-size: 14px;
}

.npc-template-card .tpl-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.npc-generating-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
  color: var(--accent-orange);
}

.gen-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, var(--accent-orange) 30%, transparent);
  border-top-color: var(--accent-orange);
  border-radius: 50%;
  animation: npc-spin 0.8s linear infinite;
}

@keyframes npc-spin {
  to {
    transform: rotate(360deg);
  }
}

.npc-warn {
  margin: 12px 0 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--accent-orange) 10%, transparent);
  border-left: 3px solid var(--accent-orange);
  font-size: 12px;
  color: var(--accent-orange);
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .gen-spinner {
    animation-duration: 2s;
  }
}

/* 成员列表 */
/* 群组定义 CAS 冲突提示条 */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--background);
}

/* UX-03：加载更早消息 */
.load-earlier-row {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.load-earlier-btn {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 999px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .load-earlier-btn:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.load-earlier-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.msg-user {
  flex-direction: row-reverse;
}

/* 一条消息的外壳：发言人名、思维链、若干气泡与心理段、时间，纵向排 */
.msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: 70%;
}

.msg-user .msg-body {
  align-items: flex-end;
}

.msg-user .msg-bubble {
  background: var(--primary);
  color: var(--on-primary);
  margin-left: auto;
}

.msg-assistant .msg-bubble {
  background: var(--card);
}

.msg-system {
  justify-content: center;
}

.msg-system-content {
  font-size: 11px;
  color: var(--muted-foreground);
  padding: 4px 10px;
  background: var(--card);
  border-radius: var(--radius-md);
  font-style: italic;
}

.msg-bubble {
  /* 宽度上限移到 .msg-body 上，气泡自己只吃满外壳（否则多个气泡各按 70% 算会叠出两层留白） */
  max-width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  word-wrap: break-word;
}

/* 心理段：与单聊同一套规格（无底色、左竖线、字号与颜色各降一档） */
.msg-psy {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--muted-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.msg-sender {
  font-size: 11px;
  color: var(--secondary-text);
  margin-bottom: 2px;
  font-weight: 500;
}

.msg-content {
  white-space: pre-wrap;
}

.msg-time {
  font-size: 10px;
  color: var(--muted-foreground);
  margin-top: 4px;
  text-align: right;
}

.msg-user .msg-time {
  color: rgba(255, 255, 255, 0.7);
}

/* 输入区 */
.input-area {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.input-wrapper {
  flex: 1;
  position: relative;
}

.msg-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: none;
}

.msg-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.msg-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: var(--size-control-md);
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-end;
}

@media (hover: hover) and (pointer: fine) {
  .send-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 生成中：同一按钮切换为中止动作，用危险语义色与发送区分。
   注：不用实心 --danger（在深色主题下为浅红，白字对比度不足），
   改用 danger 三件套（bg/fg/border），与既有警示文本一致。 */
.send-btn.stop-btn {
  background: var(--danger-bg);
  color: var(--danger-fg);
  border: 1px solid var(--danger-border);
}

/* @提及下拉 */
.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  margin-bottom: 4px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}

@media (hover: hover) and (pointer: fine) {
  .mention-item:hover {
    background: var(--card-elevated);
  }
}

/* 创建群聊表单 */
.create-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label-row {
  display: flex;
  justify-content: space-between;
}

.form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.form-input,
.form-textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.form-input:focus,
.form-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
}

.mode-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.mode-option > div {
  flex: 1;
}

.mode-name {
  font-size: 12px;
  font-weight: 500;
}

.mode-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.char-pick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.char-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.char-pick:last-child {
  border-bottom: none;
}

@media (hover: hover) and (pointer: fine) {
  .char-pick:hover {
    background: var(--card-elevated);
  }
}

.char-pick.selected {
  background: var(--card-elevated);
}

.char-pick-info {
  flex: 1;
  min-width: 0;
}

.char-pick-name {
  font-size: 13px;
  font-weight: 500;
}

.char-pick-tags {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.check-icon {
  color: var(--secondary-text);
}

.empty-add {
  padding: 20px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.empty-add p {
  margin: 0;
}

.add-member-form .form-hint {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 响应式 */
@media (max-width: 1024px) {
  .group-body {
    grid-template-columns: 1fr;
  }
  /* 窄屏不隐藏群聊列表,堆叠+限高滚动,保留选择能力 */
  .group-list-panel {
    display: block;
    max-height: 42vh;
    overflow-y: auto;
  }
  .mode-options {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .group-search-input,
  .msg-input,
  .form-input,
  .form-textarea {
    font-size: 16px;
  }

  /*
   * 两级互换（批次 1-2）。三条都要，缺一条形态就不成立：
   *
   * 1. 把 .group-body 从 grid 换成纵向 flex。scoped 规则的特异性(0,2,0)高于全局
   *    `.m-swap`(0,1,0)，不自己换的话 m-swap.css 里的 display 会被这条 grid 压住，
   *    症状是"两级同时显示、消息区还是 32px"。
   * 2. 一级页的群列表取消 1024 档那个 max-height:42vh。那是"堆叠两段"的遗产，
   *    现在一级就是满屏列表，留 42% 会让列表只占半屏、下半屏是空的。
   * 3. 页头收紧：手机上群名一行即可，动作/成员/Runtime/模式全在「群设置」抽屉里。
   */
  .group-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .group-list-panel {
    max-height: none;
    min-height: 0;
  }
  .group-header {
    padding: 8px 12px;
  }
  .group-title-row {
    margin-bottom: 0;
    align-items: center;
    flex-wrap: nowrap;
  }
  .group-title-row h2 {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* 群设置入口：44px 命中区，视觉上不显大靠 padding 让它贴右 */
  .group-settings-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    min-height: var(--touch-min, 44px);
    padding: 0 var(--space-2, 8px);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--background);
    color: var(--foreground);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  /*
   * 能力说明收成一行：它是"显式声明群聊缺哪些能力"（E18/E08），不能删，
   * 但手机上三行文字约 60px，比它解释的问题还贵。单行省略 + tip 看全文。
   */
  .group-capability-note {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 12px;
  }
}
.group-capability-note {
  margin: 0;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

/* 批次 3-2：页头动作按钮 */
@media (max-width: 640px) {
  .header-btn {
    min-height: var(--touch-min);
    min-width: var(--touch-min);
  }
}

/* 批次 3-2：群聊页自己的筛选 chip（组件版在 FilterTabs.vue 里另有一条） */
@media (max-width: 640px) {
  .filter-tab {
    min-height: var(--touch-min);
  }
}
</style>
