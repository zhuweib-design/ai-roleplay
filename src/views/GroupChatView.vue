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
 *
 * R1-1 / R4-9 拆分后的分工（本文件只剩"页头 + 两级骨架 + 主区接线"）：
 * - 群列表与筛选 → `GroupListPanel`
 * - 消息渲染与滚动 → `GroupMessageList`
 * - 输入区与 @提及下拉 → `GroupMessageInput`
 * - 三个弹窗 → `GroupCreateModal` / `GroupMemberModals` / `GroupNpcModal`
 * - 发送链路（流式 / 中止 / 指定发言）→ `useGroupComposer`
 * - 成员增删与上限 → `useGroupMembers`
 * - 归档 / 恢复 / 冲突采纳 → `useGroupLifecycle`
 * - 建群 / 删群 / ST 导入导出 / 随机 NPC / 发言模式 → `useGroupActions`
 *
 * 留在宿主的只有三类：骨架与路由接线（selectGroup 的地址栏与压栈顺序）、
 * 跨模块共享的只读派生量（currentGroup / currentMembers / memberStatuses）、
 * 以及 Toast——四个 composable 共用同一个出口，所以它的状态不能下沉。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useDrilldown } from '@/composables/useDrilldown';
import { useGroupComposer } from '@/composables/useGroupComposer';
import { useGroupMembers } from '@/composables/useGroupMembers';
import { useGroupLifecycle } from '@/composables/useGroupLifecycle';
import { useGroupActions } from '@/composables/useGroupActions';
import { useViewport } from '@/core/viewport';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import ChatModeSwitch from '@/components/chat/ChatModeSwitch.vue';
import GroupInfoPanel from '@/components/group/GroupInfoPanel.vue';
import GroupListPanel from '@/components/group/GroupListPanel.vue';
import GroupMessageList from '@/components/group/GroupMessageList.vue';
import GroupMessageInput from '@/components/group/GroupMessageInput.vue';
import GroupCreateModal from '@/components/group/GroupCreateModal.vue';
import GroupMemberModals from '@/components/group/GroupMemberModals.vue';
import GroupNpcModal from '@/components/group/GroupNpcModal.vue';
import BottomSheet from '@/components/common/BottomSheet.vue';
import ContextReadinessBar from '@/components/layout/ContextReadinessBar.vue';
import Toast from '@/components/common/Toast.vue';
import { resolveLatestStatus } from '@core/status-parser';
import { t } from '@/i18n';

const groupStore = useGroupChatStore();
const chatStore = useChatStore();
const characterStore = useCharacterStore();
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

// ── UI 状态（toast 三件套留宿主：四个 composable 共用同一出口）──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// ── 计算属性 ──
const currentGroup = computed(() => groupStore.currentGroup);
const currentMembers = computed(() => groupStore.currentMembers);

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

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// 发送链路与成员管理各拆一个 composable：前者管流式/中止/指定发言，
// 后者管加人删人与上限。两边都只拿 showToast，不反向依赖视图。
const { isArchivedReadonly, sendMessage, stopGroupGeneration, onMention } = useGroupComposer({
  showToast,
});
const {
  addMemberModalOpen,
  addMemberAvailable,
  openAddMemberModal,
  confirmAddMembers,
  removeMember,
} = useGroupMembers({ showToast });

// 生命周期四件事共用"先服务端成功、再改本地"这条规则，所以合成一处；
// 它顺带产出冲突对象与待重试回合两个派生量，GroupInfoPanel 直接用。
const {
  currentGroupConflict,
  pendingRuntimeTurns,
  archiveCurrentGroup,
  restoreCurrentGroup,
  adoptRemoteGroupDefinition,
  retryPendingRuntimeTurns,
} = useGroupLifecycle({ showToast });

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

// ── 写操作（建群/删群/ST 导入导出/NPC/模式）──
// 整块在 useGroupActions 里，这里只解构模板要绑的开关与处理器。
const {
  createModalOpen,
  deleteModalOpen,
  npcModalOpen,
  npcGenerating,
  openCreateModal,
  confirmCreate,
  deleteGroup,
  confirmDeleteGroup,
  handleStImport,
  handleExportGroupSt,
  openNpcModal,
  confirmGenerateNpc,
  setMode,
} = useGroupActions({ showToast, selectGroup });

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
      <GroupListPanel
        :groups="groupStore.groups"
        :current-group-id="groupStore.currentGroupId"
        @select="selectGroup"
        @create="openCreateModal"
      />

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
          <GroupMessageList
            :messages="groupStore.visibleMessages"
            :members="currentMembers"
            :group-id="groupStore.currentGroupId"
            :has-older="groupStore.hasOlderTurns"
            :hidden-older-count="groupStore.hiddenOlderCount"
            @load-earlier="groupStore.loadOlderTurns()"
          />

          <!-- 输入区 -->
          <GroupMessageInput
            :value="groupStore.inputText"
            :streaming="groupStore.isStreaming"
            :archived-readonly="isArchivedReadonly"
            :members="currentMembers"
            @update:value="groupStore.setInput($event)"
            @send="sendMessage"
            @stop="stopGroupGeneration"
            @mention="onMention"
          />
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
    <GroupCreateModal
      v-model:open="createModalOpen"
      :characters="characterStore.characters"
      @submit="confirmCreate"
      @error="showToast('error', $event)"
    />

    <!-- 添加成员 / 删除确认 -->
    <GroupMemberModals
      v-model:add-open="addMemberModalOpen"
      v-model:delete-open="deleteModalOpen"
      :candidates="addMemberAvailable"
      @add-submit="confirmAddMembers"
      @delete-confirm="confirmDeleteGroup"
    />

    <!-- F10.3 随机 NPC 生成弹窗 -->
    <GroupNpcModal
      v-model:open="npcModalOpen"
      :generating="npcGenerating"
      :member-count="currentGroup?.members.length ?? 0"
      @generate="confirmGenerateNpc"
    />

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

/* 响应式 */
@media (max-width: 1024px) {
  .group-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  /*
   * 两级互换（批次 1-2）。两条都要，缺一条形态就不成立：
   *
   * 1. 把 .group-body 从 grid 换成纵向 flex。scoped 规则的特异性(0,2,0)高于全局
   *    `.m-swap`(0,1,0)，不自己换的话 m-swap.css 里的 display 会被这条 grid 压住，
   *    症状是"两级同时显示、消息区还是 32px"。
   * 2. 页头收紧：手机上群名一行即可，动作/成员/Runtime/模式全在「群设置」抽屉里。
   *
   * （一级页群列表取消 max-height:42vh 那条跟着 GroupListPanel 走了。）
   */
  .group-body {
    display: flex;
    flex-direction: column;
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
</style>
