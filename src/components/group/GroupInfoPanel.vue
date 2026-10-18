<script setup lang="ts">
/**
 * GroupInfoPanel — 群信息面板（成员 / 动作 / 发言模式 / Runtime / 状态）
 *
 * 为什么抽成组件：这一块在桌面要挂在页头里，在手机上要整个搬进「群设置」抽屉
 * （MOBILE_PLAN 批次 1-2）。两份内联模板会长成两套行为，而它们改的是同一批状态
 * ——改了一边忘另一边，症状是"桌面归档能用、手机不能"。所以模板只留一份，
 * 由父级用 `v-if` 决定挂在页头还是抽屉里，同一时刻只有一份在 DOM。
 *
 * 为什么不直接把抽屉写进 GroupChatView：那个文件已经 2797 行，再塞 300 行模板
 * 与 350 行样式会把它推到 3500 行；而这块内容有明确边界（只读 group + 发动作事件），
 * 正好是最容易切干净的一刀。
 *
 * 布局差异用 `layout` 表达而不是两套模板：
 * - `inline`：桌面页头里，按钮横排、密度高
 * - `sheet`：手机抽屉里，按钮整行铺开、命中区抬到 44px（批次 3 的口径提前落到新代码上）
 */
import { computed, ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Collapse from '@/components/common/Collapse.vue';
import StatusHud from '@/components/chat/StatusHud.vue';
import RuntimeStatePanel from '@/components/chat/RuntimeStatePanel.vue';
import { useSectionMemory } from '@/composables/useSectionMemory';
import { useCharacterStore } from '@/stores/character';
import { t } from '@/i18n';
import type { CharacterStatus } from '@core/status-schema';
import type { GroupChat, GroupChatMode, GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';

const props = withDefaults(
  defineProps<{
    group: GroupChat;
    members: GroupMember[];
    /** 各成员派生出的状态；status 为 null 的成员父级已过滤，这里仍按可空接住以便直接用 */
    statuses: Array<{ characterId: string; name: string; status: CharacterStatus | null }>;
    /** 待重试的 Runtime 回合数；0 表示不显示重试横幅 */
    pendingCount: number;
    /** 当前群是否有未处理的群定义 CAS 冲突 */
    conflict: boolean;
    /** 生成中：NPC 生成与重试按钮要禁用 */
    streaming: boolean;
    /**
     * 是否渲染动作组。
     * 桌面页头把动作组放在标题行右侧（保持原布局不动），所以那个场景传 false，
     * 由父组件自己放在标题行里；手机抽屉里传 true，动作组作为抽屉第一段整行铺开。
     * 模板只有一份，位置差异用这个开关表达。
     */
    showActions?: boolean;
    layout?: 'inline' | 'sheet';
  }>(),
  { layout: 'inline', showActions: true }
);

const emit = defineEmits<{
  addMember: [];
  generateNpc: [];
  archive: [];
  restore: [];
  remove: [];
  exportSt: [];
  importSt: [event: Event];
  setMode: [mode: GroupChatMode];
  editMember: [characterId: string];
  removeMember: [member: GroupMember, event: Event];
  retryRuntime: [];
  adoptConflict: [];
  dismissConflict: [];
}>();

const characterStore = useCharacterStore();

const archived = computed(() => props.group.lifecycleStatus === 'archived');

// Runtime 排障面默认收起（实测 94px，占原页头 234px 的四成）。展开态按群记忆，
// key 带 group id，切群不会把上一个群的展开态带过来。
const runtimeInspectOpen = useSectionMemory(() => `group.runtimeInspect:${props.group.id}`);
const runtimeInspectMemberId = ref<string | null>(null);

const runtimeInspectMember = computed<GroupMember | null>(() => {
  // 用 props.members 而不是 props.group.members：成员条渲染的是前者，
  // 两处取值不同源时会出现"下拉里有这个人、成员条里没有"的鬼故事。
  const members = props.members ?? [];
  if (members.length === 0) return null;
  return members.find((m) => m.characterId === runtimeInspectMemberId.value) ?? members[0]!;
});

const runtimeInspectCharacter = computed<UICharacter | null>(() => {
  const member = runtimeInspectMember.value;
  if (!member) return null;
  return characterStore.characters.find((item) => item.id === member.characterId) ?? null;
});

function memberInitial(name: string): string {
  return name.charAt(0) || '?';
}

function avatarOf(member: GroupMember): UICharacter {
  return {
    id: member.characterId,
    name: member.name,
    avatar: member.avatar,
    avatarType: member.avatar ? 'image' : 'gradient',
    initial: memberInitial(member.name),
  } as UICharacter;
}
</script>

<template>
  <div class="group-info-panel" :class="`is-${layout}`">
    <!-- 动作组：桌面在标题行右侧（父组件用 showActions=false 自己摆），手机在抽屉里整行铺开 -->
    <div v-if="showActions" class="group-actions" role="group" :aria-label="t('group.settingsActionsAria')">
      <template v-if="!archived">
        <button
          type="button"
          class="action-btn add-member"
          :aria-label="t('group.addMemberAria')"
          @click="emit('addMember')"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('group.addMember') }}</span>
        </button>
        <button
          type="button"
          class="action-btn generate-npc"
          :aria-label="t('group.generateNpcAria')"
          :disabled="streaming"
          @click="emit('generateNpc')"
        >
          <Icon name="star" :size="14" />
          <span>{{ t('group.generateNpc') }}</span>
        </button>
        <button
          type="button"
          class="action-btn archive-btn"
          :aria-label="t('group.archiveAria')"
          @click="emit('archive')"
        >
          <Icon name="save" :size="14" />
          <span>{{ t('group.archive') }}</span>
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="action-btn restore-btn"
          :aria-label="t('group.restoreAria')"
          @click="emit('restore')"
        >
          <Icon name="refresh-cw" :size="14" />
          <span>{{ t('group.restore') }}</span>
        </button>
      </template>
      <button
        type="button"
        class="action-btn delete"
        :aria-label="t('group.deleteAria')"
        @click="emit('remove')"
      >
        <Icon name="trash-2" :size="14" />
        <span>{{ t('group.delete') }}</span>
      </button>
      <!-- T-07: SillyTavern 群聊格式互导 -->
      <button
        type="button"
        class="action-btn"
        :aria-label="t('group.exportStAria')"
        v-tip="t('group.exportStTitle')"
        @click="emit('exportSt')"
      >
        <Icon name="download" :size="14" />
        <span>{{ t('group.exportSt') }}</span>
      </button>
      <label class="action-btn" v-tip="t('group.importStTitle')">
        <Icon name="upload" :size="14" />
        <span>{{ t('group.importSt') }}</span>
        <input
          type="file"
          accept=".json,application/json"
          class="sr-only"
          @change="emit('importSt', $event)"
        />
      </label>
    </div>

    <!-- 群组定义 CAS 冲突：显式提示，不静默覆盖远端 -->
    <div v-if="conflict" class="conflict-banner" role="alert">
      <Icon name="alert-triangle" :size="14" />
      <span class="conflict-text">{{ t('group.runtimeConflict') }}</span>
      <button type="button" class="link-btn conflict-action" @click="emit('adoptConflict')">
        {{ t('group.runtimeConflictAdopt') }}
      </button>
      <button type="button" class="link-btn conflict-action" @click="emit('dismissConflict')">
        {{ t('group.runtimeConflictDismiss') }}
      </button>
    </div>

    <!-- Virtual Character OS：成员级 Runtime 最小状态查看与回放自检（排障面，默认收起） -->
    <Collapse
      v-if="members.length > 0"
      v-model:open="runtimeInspectOpen"
      title-key="group.runtimeInspectTitle"
      hint-key="group.runtimeInspectHint"
      icon="cpu"
      :level="3"
      :advanced="true"
      plain
    >
      <div class="group-runtime-inspect">
        <label class="group-runtime-label" for="group-runtime-member">{{ t('runtime.title') }}</label>
        <select
          id="group-runtime-member"
          class="group-runtime-select"
          :value="runtimeInspectMember?.characterId ?? ''"
          @change="runtimeInspectMemberId = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="member in members" :key="member.characterId" :value="member.characterId">
            {{ member.name }}
          </option>
        </select>
        <RuntimeStatePanel
          v-if="runtimeInspectCharacter"
          :key="runtimeInspectCharacter.id"
          :character="runtimeInspectCharacter"
          :label="runtimeInspectMember?.name"
        />
      </div>
    </Collapse>

    <!-- 成员列表 -->
    <div class="members-bar" role="list" :aria-label="t('group.membersAria')">
      <div
        v-for="member in members"
        :key="member.characterId"
        class="member-chip"
        role="listitem"
        v-tip="t('group.memberTitle', { name: member.name, talk: member.talkativeness ?? 50 })"
      >
        <Avatar :character="avatarOf(member)" :size="24" />
        <button
          type="button"
          class="member-name"
          data-rel-jump="rel-group-member"
          :aria-label="t('group.editMember', { name: member.name })"
          @click="emit('editMember', member.characterId)"
        >
          {{ member.name }}
        </button>
        <button
          v-if="members.length > 2"
          type="button"
          class="member-remove"
          :aria-label="t('group.removeMember', { name: member.name })"
          @click="emit('removeMember', member, $event)"
        >
          <Icon name="x-circle" :size="12" />
        </button>
      </div>
    </div>

    <div v-if="pendingCount > 0" class="runtime-retry-banner" role="status" aria-live="polite">
      <span>{{ t('group.runtimePending', { count: pendingCount }) }}</span>
      <button type="button" class="action-btn" :disabled="streaming" @click="emit('retryRuntime')">
        {{ t('group.runtimeRetry') }}
      </button>
    </div>

    <!-- 发言模式切换 -->
    <div class="mode-switcher" role="radiogroup" :aria-label="t('group.modeAria')">
      <button
        type="button"
        role="radio"
        :aria-checked="group.mode === 'natural'"
        class="mode-btn"
        :class="{ active: group.mode === 'natural' }"
        @click="emit('setMode', 'natural')"
      >
        <Icon name="refresh-cw" :size="12" />
        <span>{{ t('group.modeNatural') }}</span>
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="group.mode === 'designated'"
        class="mode-btn"
        :class="{ active: group.mode === 'designated' }"
        @click="emit('setMode', 'designated')"
      >
        <Icon name="user" :size="12" />
        <span>{{ t('group.modeDesignated') }}</span>
      </button>
    </div>

    <div v-if="statuses.length > 0" class="member-status-bar" :aria-label="t('status.hudAria')">
      <div v-for="ms in statuses" :key="ms.characterId" class="member-status-row">
        <span class="member-status-name">{{ ms.name }}</span>
        <StatusHud variant="inline" :status="ms.status" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-info-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.group-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 抽屉里：每个动作整行铺开，命中区抬到 44px，拇指扫得动 */
.is-sheet .group-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.is-sheet .action-btn {
  min-height: var(--touch-min, 44px);
  justify-content: flex-start;
  padding: 0 var(--space-3, 12px);
  font-size: var(--font-size-md, 14px);
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
  font-family: inherit;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}

.action-btn.delete {
  color: var(--error-fg);
  border-color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    background: var(--error);
    color: var(--on-accent);
  }
}

.action-btn.generate-npc {
  color: var(--accent-orange);
  border-color: var(--accent-orange);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.generate-npc:hover:not(:disabled) {
    background: var(--accent-orange);
    color: var(--on-accent);
  }
}

.action-btn.generate-npc:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.archive-btn {
  color: var(--muted-foreground);
  border-color: var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.archive-btn:hover {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

.action-btn.restore-btn {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.restore-btn:hover {
    background: var(--accent-blue);
    color: var(--on-accent);
  }
}

.conflict-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md, 8px);
  background: var(--warning-bg);
  /* 用 warning-text：专门为「警示色作文字」派生的可读变体，直接 --warning-fg 仅 4.26:1 */
  color: var(--warning-text);
  border: 1px solid var(--warning-border);
  font-size: 13px;
}

.conflict-text {
  flex: 1 1 auto;
  min-width: 0;
}

.conflict-action {
  flex-shrink: 0;
}

.group-runtime-inspect {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-runtime-label {
  font-size: 11px;
  color: var(--muted-foreground);
}

.group-runtime-select {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.group-runtime-select:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7） */
  .group-runtime-select {
    font-size: 16px;
  }
}

.members-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  /* E17：名字现在是可点的跳转，去掉按钮默认外观，只保留可点语义 */
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

@media (max-width: 640px) {
  .member-name {
    font-size: 16px;
  }
}

@media (hover: hover) {
  .member-name:hover {
    text-decoration: underline;
  }
}

.member-name:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
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

@media (hover: hover) and (pointer: fine) {
  .member-remove:hover {
    background: var(--error);
    color: var(--on-accent);
  }
}

.runtime-retry-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--warning, var(--border));
  border-radius: var(--radius-md);
  color: var(--foreground);
  background: var(--card-elevated);
  font-size: 12px;
}

.runtime-retry-banner .action-btn {
  flex: 0 0 auto;
}

.mode-switcher {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  align-self: flex-start;
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
  font-family: inherit;
}

.is-sheet .mode-btn {
  min-height: var(--touch-min, 44px);
  padding: 0 var(--space-3, 12px);
}

.mode-btn.active {
  background: var(--primary);
  color: var(--on-primary);
}

.member-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-status-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.member-status-name {
  font-size: 12px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
</style>
