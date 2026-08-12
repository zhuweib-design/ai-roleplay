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
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { useGroupChatStore } from '@/stores/group-chat';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import type { GroupChatMode, GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';
// F10.3 随机 NPC 生成
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@core/character-generator';

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
const characterStore = useCharacterStore();
const settingsStore = useSettingsStore();
const router = useRouter();

/** 返回对话页 */
function goBack() {
  router.push({ name: 'chat' });
}

// ── UI 状态 ──
const createModalOpen = ref(false);
const deleteGroupTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const addMemberModalOpen = ref(false);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
const messagesEndRef = useTemplateRef<HTMLElement>('messagesEnd');

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

// 创建群聊时可选的角色卡（排除已选中的）
const availableCharacters = computed(() => characterStore.characters);

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

// 监听消息列表变化，自动滚动到底部
watch(
  () => currentMessages.value.length,
  async () => {
    await nextTick();
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' });
  }
);

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// ── 群聊列表操作 ──
function selectGroup(id: string) {
  groupStore.selectGroup(id);
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
      showToast('error', '群聊人数已达上限 8 人');
      return;
    }
    if (selectedMemberIds.value.size < 2) {
      // 至少 2 人
    }
    selectedMemberIds.value.add(charId);
  }
}

function confirmCreate() {
  if (selectedMemberIds.value.size < 2) {
    showToast('error', '群聊至少需要 2 个成员');
    return;
  }
  if (!newGroupName.value.trim()) {
    showToast('error', '群聊名称不能为空');
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
  }
}

function deleteGroup(id: string) {
  deleteGroupTargetId.value = id;
  deleteModalOpen.value = true;
}

function confirmDeleteGroup() {
  if (deleteGroupTargetId.value) {
    groupStore.deleteGroup(deleteGroupTargetId.value);
  }
  deleteModalOpen.value = false;
  deleteGroupTargetId.value = null;
}

// ── T-07: SillyTavern 群聊导入 ──
async function handleStImport(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  input.value = '';
  const knownIds = characterStore.characters.map((c) => c.id);
  const id = await groupStore.importGroupFromStFile(file, knownIds);
  if (id) {
    groupStore.selectGroup(id);
  }
}

// ── 成员管理 ──
function openAddMemberModal() {
  if (!currentGroup.value) return;
  if (currentGroup.value.members.length >= 8) {
    showToast('error', '群聊人数已达上限 8 人');
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

function confirmAddMembers() {
  if (!addMemberTargetGroupId.value) return;
  const targets = characterStore.characters.filter((c) =>
    addMemberCandidates.value.has(c.id)
  );
  targets.forEach((char) => {
    const card = characterToCard(char);
    groupStore.addMember(addMemberTargetGroupId.value!, card);
  });
  addMemberModalOpen.value = false;
  addMemberTargetGroupId.value = null;
}

function removeMember(member: GroupMember, e: Event) {
  e.stopPropagation();
  if (!currentGroup.value) return;
  if (currentGroup.value.members.length <= 2) {
    showToast('error', '群聊至少需要 2 个成员');
    return;
  }
  groupStore.removeMember(currentGroup.value.id, member.characterId);
}

// ── F10.3 随机 NPC 生成 ──

function openNpcModal() {
  if (!currentGroup.value) return;
  if (currentGroup.value.members.length >= 8) {
    showToast('error', '群聊人数已达上限 8 人');
    return;
  }
  if (!hasApiProfile.value) {
    showToast('error', '未配置 API 连接，请先在设置页添加 API 配置');
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
    showToast('success', '随机 NPC 已生成并加入群聊');
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

// ── F10.4 临时群聊生命周期 ──

function archiveCurrentGroup() {
  if (!currentGroup.value) return;
  const ok = groupStore.archiveGroup(currentGroup.value.id);
  if (ok) {
    showToast('info', '群聊已归档，对话记录已保留');
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

function restoreCurrentGroup() {
  if (!currentGroup.value) return;
  // 校验所有成员的角色卡是否仍存在
  const ok = groupStore.restoreGroup(
    currentGroup.value.id,
    (charId) => characterStore.characters.some((c) => c.id === charId)
  );
  if (ok) {
    showToast('success', '群聊已恢复活跃');
  } else if (groupStore.lastError) {
    showToast('error', groupStore.lastError);
  }
}

// ── 消息发送 ──
function sendMessage() {
  if (!currentGroup.value) return;
  // F10.4 归档群聊为只读状态
  if (currentGroup.value.lifecycleStatus === 'archived') {
    showToast('error', '群聊已归档，不能发送消息');
    return;
  }
  const text = groupStore.inputText.trim();
  if (!text) return;

  const ok = groupStore.addUserMessage(currentGroup.value.id, text);
  if (!ok) {
    if (groupStore.lastError) showToast('error', groupStore.lastError);
    return;
  }
  groupStore.setInput('');

  // 模拟 AI 回复（实际应调用 chat-manager + api-client）
  simulateAiReply();
}

async function simulateAiReply() {
  if (!currentGroup.value) return;
  const groupId = currentGroup.value.id;

  // 选择下一位发言者
  const speaker =
    currentGroup.value.mode === 'natural'
      ? groupStore.pickNextSpeaker(groupId)
      : null;

  if (!speaker) {
    // 指定模式下等待用户 @
    return;
  }

  // 添加占位 AI 消息
  groupStore.addAssistantMessage(
    groupId,
    speaker.characterId,
    speaker.name,
    '...'
  );

  // 模拟流式输出
  // 实际实现应调用 chat-manager.streamChat()
  setTimeout(() => {
    const reply = `（${speaker.name}）这是来自 ${speaker.name} 的模拟回复。`;
    groupStore.updateLastAssistantMessage(groupId, reply);
  }, 500);
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
      showToast('info', `已指定 ${member.name} 下次发言`);
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
  // 通过 type-adapters 转换（这里简化使用 uiCharToCard）
  // 直接 import 会有循环依赖风险，所以通过 store 间接获取
  // 这里临时构造一个最小化结构用于群聊创建
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    description: c.description,
    personality: '',
    scenario: '',
    firstMessage: c.messages[0]?.content ?? '',
    alternateGreetings: c.messages.slice(1).map((m) => m.content),
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: c.tags,
    favorite: c.favorite,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function memberInitial(name: string): string {
  return name.charAt(0) || '?';
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
          aria-label="返回对话页"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">返回</span>
        </button>
        <h1>群聊</h1>
        <span class="header-count">{{ groupStore.groups.length }} 个</span>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn new-btn"
          aria-label="新建群聊"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="16" />
          <span class="btn-label">新建群聊</span>
        </button>
      </div>
    </header>

    <!-- 主体：左群聊列表 + 右群聊消息区 -->
    <div class="group-body">
      <!-- 左侧群聊列表 -->
      <aside class="group-list-panel tk-scroll" aria-label="群聊列表">
        <!-- 需求6 筛选：状态 + 关键词 -->
        <div class="group-filter-bar">
          <div class="group-filter-tabs" role="tablist" aria-label="群聊状态筛选">
            <button
              v-for="f in ([
                { id: 'all', label: '全部' },
                { id: 'active', label: '进行中' },
                { id: 'archived', label: '已归档' },
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
            placeholder="搜索群聊名称…"
            aria-label="搜索群聊名称"
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
                  <span v-if="g.lifecycleStatus === 'archived'" class="archived-badge">已归档</span>
                </div>
                <div class="group-meta">{{ g.members.length }} 人 · {{ g.messages.length }} 条消息</div>
              </div>
            </button>
          </li>
          <li v-if="filteredGroups.length === 0" class="empty-state">
            <Icon name="users" :size="32" />
            <p v-if="groupStore.groups.length === 0">暂无群聊</p>
            <p v-else>没有匹配的群聊</p>
            <button
              v-if="groupStore.groups.length === 0"
              type="button"
              class="link-btn"
              @click="openCreateModal"
            >
              创建第一个群聊
            </button>
          </li>
        </ul>
      </aside>

      <!-- 右侧群聊主区 -->
      <main class="group-main-panel" id="main-content" tabindex="-1">
        <div v-if="!currentGroup" class="empty-group">
          <Icon name="users" :size="48" />
          <p>选择左侧的群聊开始对话</p>
          <button type="button" class="primary-btn" @click="openCreateModal">
            创建新群聊
          </button>
        </div>

        <div v-else class="group-content">
          <!-- 群聊信息栏 -->
          <header class="group-header">
            <div class="group-title-row">
              <h2>
                {{ currentGroup.name }}
                <span
                  v-if="currentGroup.lifecycleStatus === 'archived'"
                  class="lifecycle-badge archived"
                >
                  已归档
                </span>
              </h2>
              <div class="group-header-actions">
                <template v-if="currentGroup.lifecycleStatus !== 'archived'">
                  <button
                    type="button"
                    class="action-btn add-member"
                    aria-label="添加成员"
                    @click="openAddMemberModal"
                  >
                    <Icon name="plus" :size="14" />
                    <span>添加成员</span>
                  </button>
                  <button
                    type="button"
                    class="action-btn generate-npc"
                    aria-label="生成随机 NPC"
                    :disabled="npcGenerating"
                    @click="openNpcModal"
                  >
                    <Icon name="star" :size="14" />
                    <span>{{ npcGenerating ? '生成中...' : '生成随机 NPC' }}</span>
                  </button>
                  <button
                    type="button"
                    class="action-btn archive-btn"
                    aria-label="归档群聊"
                    @click="archiveCurrentGroup"
                  >
                    <Icon name="save" :size="14" />
                    <span>归档</span>
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="action-btn restore-btn"
                    aria-label="恢复群聊"
                    @click="restoreCurrentGroup"
                  >
                    <Icon name="refresh-cw" :size="14" />
                    <span>恢复群聊</span>
                  </button>
                </template>
                <button
                  type="button"
                  class="action-btn delete"
                  aria-label="删除群聊"
                  @click="deleteGroup(currentGroup.id)"
                >
                  <Icon name="trash-2" :size="14" />
                  <span>删除</span>
                </button>
                <!-- T-07: SillyTavern 群聊格式互导 -->
                <button
                  type="button"
                  class="action-btn"
                  aria-label="导出为 SillyTavern 格式"
                  title="导出为 SillyTavern 群聊 JSON"
                  @click="groupStore.downloadGroupSt(currentGroup.id)"
                >
                  <Icon name="download" :size="14" />
                  <span>导出 ST</span>
                </button>
                <label class="action-btn" title="从 SillyTavern 群聊 JSON 导入">
                  <Icon name="upload" :size="14" />
                  <span>导入 ST</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    class="sr-only"
                    @change="handleStImport"
                  />
                </label>
              </div>
            </div>

            <!-- 成员列表 -->
            <div class="members-bar" role="list" aria-label="群聊成员">
              <div
                v-for="member in currentMembers"
                :key="member.characterId"
                class="member-chip"
                role="listitem"
                :title="`${member.name}（健谈度：${member.talkativeness ?? 50}）`"
              >
                <Avatar
                  :character="{
                    id: member.characterId,
                    name: member.name,
                    avatar: member.avatar,
                    avatarType: member.avatar ? 'image' : 'gradient',
                    initial: memberInitial(member.name),
                  } as UICharacter"
                  :size="24"
                />
                <span class="member-name">{{ member.name }}</span>
                <button type="button"
                  v-if="currentMembers.length > 2"
                  class="member-remove"
                  :aria-label="`移除 ${member.name}`"
                  @click="removeMember(member, $event)"
                >
                  <Icon name="x-circle" :size="12" />
                </button>
              </div>
            </div>

            <!-- 发言模式切换 -->
            <div class="mode-switcher" role="radiogroup" aria-label="发言模式">
              <button
                type="button"
                role="radio"
                :aria-checked="currentGroup.mode === 'natural'"
                class="mode-btn"
                :class="{ active: currentGroup.mode === 'natural' }"
                @click="setMode('natural')"
              >
                <Icon name="refresh-cw" :size="12" />
                <span>自然轮换</span>
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="currentGroup.mode === 'designated'"
                class="mode-btn"
                :class="{ active: currentGroup.mode === 'designated' }"
                @click="setMode('designated')"
              >
                <Icon name="user" :size="12" />
                <span>指定发言</span>
              </button>
            </div>
          </header>

          <!-- 消息列表 -->
          <section
            class="messages-area tk-scroll"
            role="log"
            aria-live="polite"
            aria-label="群聊消息"
          >
            <div
              v-for="msg in currentMessages"
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
                <div class="msg-bubble">
                  <div v-if="msg.role === 'assistant'" class="msg-sender">
                    {{ msg.characterName }}
                  </div>
                  <div class="msg-content">{{ msg.content }}</div>
                  <div class="msg-time">{{ messageTime(msg.timestamp) }}</div>
                </div>
              </template>
            </div>
            <div ref="messagesEnd" aria-hidden="true" />
          </section>

          <!-- 输入区 -->
          <footer class="input-area">
            <div class="input-wrapper">
              <textarea
                :value="groupStore.inputText"
                @input="onInputChange"
                @keydown="onInputKeydown"
                placeholder="输入消息...（@角色名 指定发言）"
                aria-label="消息输入框"
                rows="2"
                class="msg-input"
                :disabled="groupStore.isStreaming"
              />
              <!-- @提及下拉 -->
              <div
                v-if="showMentionDropdown && mentionCandidates.length > 0"
                class="mention-dropdown"
                role="listbox"
                aria-label="提及角色"
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
              type="button"
              class="send-btn"
              :disabled="!groupStore.inputText.trim() || groupStore.isStreaming"
              aria-label="发送消息"
              @click="sendMessage"
            >
              <Icon name="send" :size="16" />
            </button>
          </footer>
        </div>
      </main>
    </div>

    <!-- 创建群聊向导 -->
    <Modal
      v-model="createModalOpen"
      title="创建群聊"
    >
      <div class="create-form">
        <div class="form-row">
          <label class="form-label" for="new-group-name">群聊名称</label>
          <input
            id="new-group-name"
            v-model="newGroupName"
            type="text"
            class="form-input"
            placeholder="例如：冒险小队"
            maxlength="50"
          />
        </div>

        <div class="form-row">
          <label class="form-label" for="new-group-desc">群聊描述（可选）</label>
          <textarea
            id="new-group-desc"
            v-model="newGroupDesc"
            class="form-textarea"
            placeholder="群聊主题或场景描述"
            rows="2"
          />
        </div>

        <div class="form-row">
          <span class="form-label">发言模式</span>
          <div class="mode-options" role="radiogroup" aria-label="发言模式选择">
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
                <div class="mode-name">自然轮换</div>
                <div class="mode-desc">按健谈度概率自动选择</div>
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
                <div class="mode-name">指定发言</div>
                <div class="mode-desc">用户 @ 指定角色发言</div>
              </div>
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span class="form-label">选择成员（{{ selectedMemberIds.size }}/8，至少 2 人）</span>
          </div>
          <ul class="char-pick-list tk-scroll" role="group" aria-label="可选角色">
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
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmCreate"
        >
          创建
        </button>
      </template>
    </Modal>

    <!-- 添加成员弹窗 -->
    <Modal
      v-model="addMemberModalOpen"
      title="添加成员"
    >
      <div class="add-member-form">
        <p class="form-hint">选择要加入群聊的角色（可多选）</p>
        <ul class="char-pick-list tk-scroll" role="group" aria-label="可选角色">
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
            <p>所有角色都已在群聊中</p>
          </li>
        </ul>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="addMemberModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmAddMembers"
        >
          添加
        </button>
      </template>
    </Modal>

    <!-- 删除确认 -->
    <Modal
      v-model="deleteModalOpen"
      title="删除群聊"
    >
      <p>确定要删除这个群聊吗？所有消息记录将一并删除，且无法恢复。</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm modal-danger"
          @click="confirmDeleteGroup"
        >
          删除
        </button>
      </template>
    </Modal>

    <!-- F10.3 随机 NPC 生成弹窗 -->
    <Modal
      v-model="npcModalOpen"
      title="生成随机 NPC"
    >
      <div class="npc-generate-form">
        <p class="form-hint">
          选择 NPC 风格模板，AI 将根据当前场景上下文生成临时 NPC 加入群聊。
        </p>

        <!-- 生成中状态 -->
        <div v-if="npcGenerating" class="npc-generating-state" role="status" aria-live="polite">
          <div class="gen-spinner" aria-hidden="true"></div>
          <p>正在生成 NPC，请稍候...</p>
        </div>

        <!-- 模板选择 -->
        <div v-else class="npc-template-grid" role="radiogroup" aria-label="NPC 模板">
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
          当前群聊 {{ currentGroup.members.length }}/8 人，仅剩 {{ 8 - currentGroup.members.length }} 个名额。
        </p>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          :disabled="npcGenerating"
          @click="npcModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          :disabled="npcGenerating"
          @click="confirmGenerateNpc"
        >
          {{ npcGenerating ? '生成中...' : '生成 NPC' }}
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

.header-btn.new-btn:hover {
  opacity: 0.9;
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

.empty-state {
  padding: 32px 12px;
  text-align: center;
  color: var(--muted-foreground);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-state p {
  margin: 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--secondary);
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

.group-item:hover {
  background: var(--card-elevated);
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

.primary-btn:hover {
  opacity: 0.9;
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
  margin-bottom: 10px;
}

.group-title-row h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.group-header-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--card-elevated);
}

.action-btn.delete {
  color: var(--error);
  border-color: var(--error);
}

.action-btn.delete:hover {
  background: var(--error);
  color: var(--on-accent);
}

/* F10.3 生成随机 NPC 按钮 */
.action-btn.generate-npc {
  color: var(--accent-orange);
  border-color: var(--accent-orange);
}

.action-btn.generate-npc:hover:not(:disabled) {
  background: var(--accent-orange);
  color: var(--on-accent);
}

.action-btn.generate-npc:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* F10.4 归档/恢复按钮 */
.action-btn.archive-btn {
  color: var(--muted-foreground);
  border-color: var(--border, #3a3d52);
}

.action-btn.archive-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground, #f5f5f7);
}

.action-btn.restore-btn {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

.action-btn.restore-btn:hover {
  background: var(--accent-blue);
  color: var(--on-accent);
}

/* 群聊列表中的归档标记 */
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

.npc-template-card:hover {
  border-color: var(--accent-orange);
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
.members-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 4px;
  border-radius: var(--radius-sm);
  background: var(--background);
  border: 1px solid var(--border);
  font-size: 12px;
}

.member-name {
  font-size: 12px;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
}

.member-remove:hover {
  background: var(--error);
  color: var(--on-accent);
}

/* 模式切换 */
.mode-switcher {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

.mode-btn.active {
  background: var(--primary);
  color: var(--on-primary);
}

/* 消息区 */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--background);
}

.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.msg-user {
  flex-direction: row-reverse;
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
  max-width: 70%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  word-wrap: break-word;
}

.msg-sender {
  font-size: 11px;
  color: var(--secondary);
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
  height: 36px;
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-end;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.mention-item:hover {
  background: var(--card-elevated);
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

.char-pick:hover {
  background: var(--card-elevated);
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
  color: var(--secondary);
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
@media (max-width: 900px) {
  .group-body {
    grid-template-columns: 1fr;
  }
  .group-list-panel {
    display: none;
  }
  .mode-options {
    grid-template-columns: 1fr;
  }
}
</style>
