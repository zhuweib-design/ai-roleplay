<script setup lang="ts">
/**
 * ArchivesView — 对话记录归档与筛选 (F10.5, v1.1 新增)
 *
 * 功能：
 * - 显示所有群聊记录列表（按更新时间倒序）
 * - 支持按角色名筛选、按时间范围筛选、按关键词搜索消息内容
 * - 点击记录查看完整对话
 * - 归档群聊以特殊标记显示
 *
 * 数据源：复用 group-chat store 的 groups 数据
 * 归档群聊（lifecycleStatus='archived'）以特殊样式标注
 *
 * 无障碍：
 * - 语义化 main/aside
 * - 搜索框 aria-label
 * - 列表 role="list"
 * - 键盘可访问
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGroupChatStore } from '@/stores/group-chat';
import { useReadinessJump } from '@/composables/useReadinessJump';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Avatar from '@/components/common/Avatar.vue';
import ArchiveDetailModal from '@/components/archives/ArchiveDetailModal.vue';
import type { GroupChat } from '@/core/group-chat';
import type { UICharacter } from '@/types';
import { formatDateTime } from '@/utils/format';
import { t } from '@/i18n';

const groupStore = useGroupChatStore();
const router = useRouter();
// 「前往群聊」用带返回路径的跳转契约（from 白名单见 composables/useReadinessJump.ts）
const { pushWithReturn } = useReadinessJump();

/** 返回对话页 */
function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

// ── 筛选状态 ──
const searchKeyword = ref('');
const filterMemberName = ref('');
const filterStartDate = ref('');
const filterEndDate = ref('');
const showArchivedOnly = ref(false);

// ── 选中查看的群聊 ──
const viewModalOpen = ref(false);
const viewingGroup = ref<GroupChat | null>(null);


// ── Toast 段已移除（R4-17）：三个 ref 全仓无写入点，组件永不显示 ──
// ── 计算属性：筛选后的群聊列表 ──

const filteredGroups = computed<GroupChat[]>(() => {
  let list = [...groupStore.groups];

  // 1. 按归档状态筛选
  if (showArchivedOnly.value) {
    list = list.filter((g) => g.lifecycleStatus === 'archived');
  }

  // 2. 按时间范围筛选（基于 updatedAt）
  if (filterStartDate.value) {
    const start = new Date(filterStartDate.value).getTime();
    list = list.filter((g) => new Date(g.updatedAt).getTime() >= start);
  }
  if (filterEndDate.value) {
    const end = new Date(filterEndDate.value).getTime() + 24 * 60 * 60 * 1000;
    list = list.filter((g) => new Date(g.updatedAt).getTime() <= end);
  }

  // 3. 按成员名筛选（模糊匹配）
  if (filterMemberName.value.trim()) {
    const query = filterMemberName.value.trim().toLowerCase();
    list = list.filter((g) =>
      g.members.some((m) => m.name.toLowerCase().includes(query))
    );
  }

  // 4. 按关键词搜索消息内容
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase();
    list = list.filter((g) =>
      g.messages.some((m) => m.content.toLowerCase().includes(kw))
    );
  }

  // 按更新时间倒序
  list.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return list;
});

// ── 工具函数 ──

function memberInitial(name: string): string {
  return name?.[0] ?? '?';
}

/** 获取群聊的最后一条消息预览 */
function lastMessagePreview(g: GroupChat): string {
  if (g.messages.length === 0) return t('archives.noMessages');
  const last = g.messages[g.messages.length - 1]!;
  const prefix = last.role === 'user' ? t('archives.me') : last.characterName ? `${last.characterName}：` : '';
  const content = last.content.length > 50 ? last.content.slice(0, 50) + '...' : last.content;
  return prefix + content;
}

/** 搜索消息在群聊中的匹配数量 */
function countKeywordMatches(g: GroupChat): number {
  if (!searchKeyword.value.trim()) return 0;
  const kw = searchKeyword.value.trim().toLowerCase();
  return g.messages.filter((m) => m.content.toLowerCase().includes(kw)).length;
}

// ── 操作 ──

function clearFilters() {
  searchKeyword.value = '';
  filterMemberName.value = '';
  filterStartDate.value = '';
  filterEndDate.value = '';
  showArchivedOnly.value = false;
}

function viewGroup(g: GroupChat) {
  viewingGroup.value = g;
  viewModalOpen.value = true;
}

function goToGroupChat(id: string) {
  viewModalOpen.value = false;
  // 原来这里是"push 到 /group，然后命令式 selectGroup"——目标只活在内存里：
  // 刷新、分享、或群列表读得比导航慢时都会落回别的群。M15-d 改由 URL 携带目标，
  // 群聊页用 useDeepLinkId 等读完再认（见 GroupChatView 的同名键接线）。
  // M16-a 再补上回路：走 pushWithReturn 的 `from` 契约，落地页自动出现"返回来源页"，
  // 不必靠浏览器后退。
  pushWithReturn({ name: 'group', query: { group: id } });
}
</script>

<template>
  <div class="archives-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('archives.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('archives.back') }}</span>
        </button>
        <h1>{{ t('archives.title') }}</h1>
        <span class="header-count">{{ t('archives.count', { filtered: filteredGroups.length, total: groupStore.groups.length }) }}</span>
      </div>
    </header>

    <!-- 筛选区 -->
    <section class="filter-section" :aria-label="t('archives.filterAria')">
      <div class="filter-row">
        <div class="filter-field search-field">
          <label for="search-keyword" class="filter-label">{{ t('archives.keywordLabel') }}</label>
          <input
            id="search-keyword"
            v-model="searchKeyword"
            type="search"
            class="filter-input"
            :placeholder="t('archives.keywordPlaceholder')"
            :aria-label="t('archives.keywordAria')"
          />
        </div>
        <div class="filter-field">
          <label for="filter-member" class="filter-label">{{ t('archives.memberLabel') }}</label>
          <input
            id="filter-member"
            v-model="filterMemberName"
            type="text"
            class="filter-input"
            :placeholder="t('archives.memberPlaceholder')"
            :aria-label="t('archives.memberAria')"
          />
        </div>
      </div>
      <div class="filter-row">
        <div class="filter-field">
          <label for="filter-start" class="filter-label">{{ t('archives.startDate') }}</label>
          <input
            id="filter-start"
            v-model="filterStartDate"
            type="date"
            class="filter-input"
            :aria-label="t('archives.startDate')"
          />
        </div>
        <div class="filter-field">
          <label for="filter-end" class="filter-label">{{ t('archives.endDate') }}</label>
          <input
            id="filter-end"
            v-model="filterEndDate"
            type="date"
            class="filter-input"
            :aria-label="t('archives.endDate')"
          />
        </div>
        <div class="filter-field checkbox-field">
          <label class="filter-checkbox">
            <input
              v-model="showArchivedOnly"
              type="checkbox"
            />
            <span>{{ t('archives.archivedOnly') }}</span>
          </label>
        </div>
        <button
          type="button"
          class="clear-btn"
          :aria-label="t('archives.clearFilters')"
          @click="clearFilters"
        >
          <Icon name="x-circle" :size="14" />
          <span>{{ t('archives.clear') }}</span>
        </button>
      </div>
    </section>

    <!-- 记录列表 -->
    <main class="archives-main tk-scroll" id="main-content" tabindex="-1">
      <ul v-if="filteredGroups.length > 0" class="archive-list" role="list">
        <li v-for="g in filteredGroups" :key="g.id" role="listitem">
          <button
            type="button"
            class="archive-item"
            :class="{ archived: g.lifecycleStatus === 'archived' }"
            @click="viewGroup(g)"
          >
            <div class="archive-icon">
              <Icon name="chat-circle" :size="20" />
            </div>
            <div class="archive-content">
              <div class="archive-header">
                <span class="archive-name">
                  {{ g.name }}
                  <span
                    v-if="g.lifecycleStatus === 'archived'"
                    class="archived-tag"
                  >
                    {{ t('archives.archivedTag') }}
                  </span>
                </span>
                <span class="archive-time">{{ formatDateTime(g.updatedAt) }}</span>
              </div>
              <div class="archive-members">
                <Avatar
                  v-for="m in g.members.slice(0, 5)"
                  :key="m.characterId"
                  :character="{
                    id: m.characterId,
                    name: m.name,
                    avatar: m.avatar,
                    avatarType: m.avatar ? 'image' : 'gradient',
                    initial: memberInitial(m.name),
                  } as UICharacter"
                  :size="20"
                  class="member-avatar"
                />
                <span v-if="g.members.length > 5" class="more-members">
                  +{{ g.members.length - 5 }}
                </span>
                <span class="member-count">{{ t('archives.memberCount', { count: g.members.length }) }}</span>
              </div>
              <div class="archive-preview">{{ lastMessagePreview(g) }}</div>
              <div class="archive-meta">
                <span>{{ t('archives.msgCount', { count: g.messages.length }) }}</span>
                <span
                  v-if="searchKeyword.trim() && countKeywordMatches(g) > 0"
                  class="match-count"
                >
                  {{ t('archives.matchCount', { count: countKeywordMatches(g) }) }}
                </span>
              </div>
            </div>
          </button>
        </li>
      </ul>

      <!-- 空状态 -->
      <!-- 两种空态共用一个组件：有数据但被筛空时才给"清除筛选"这个去路 -->
      <EmptyState
        v-else
        :title-key="groupStore.groups.length === 0 ? 'archives.emptyNoData' : 'archives.emptyNoMatch'"
        icon="bookmark-simple"
        :action-key="groupStore.groups.length > 0 ? 'archives.clearLink' : undefined"
        @action="clearFilters"
      />
    </main>

    <!-- 查看对话 Modal（R4-17 抽出为独立组件，导航回调留在本页） -->
    <ArchiveDetailModal
      v-model="viewModalOpen"
      :group="viewingGroup"
      @go-group="goToGroupChat"
    />
  </div>
</template>

<style scoped>
.archives-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
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
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--card-elevated);
  }
}

.header-count {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 筛选区 */
.filter-section {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-field {
  flex: 1;
  min-width: 200px;
}

.filter-label {
  font-size: 11px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.filter-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
  min-width: 120px;
}

.filter-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--foreground);
  cursor: pointer;
}

.filter-checkbox input {
  cursor: pointer;
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .clear-btn:hover {
    color: var(--foreground);
  }
}

/* 记录列表 */
.archives-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.archive-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.archive-item {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, transform 0.1s;
}

@media (hover: hover) and (pointer: fine) {
  .archive-item:hover {
    border-color: var(--accent-blue);
  }
}

.archive-item:active {
  transform: scale(0.99);
}

.archive-item.archived {
  opacity: 0.75;
  border-style: dashed;
}

.archive-icon {
  flex-shrink: 0;
  color: var(--muted-foreground);
  padding-top: 2px;
}

.archive-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.archive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.archive-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 6px;
}

.archived-tag {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-orange-text);
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
  border-radius: var(--radius-pill, 999px);
}

.archive-time {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.archive-members {
  display: flex;
  align-items: center;
  gap: 4px;
}

.member-avatar {
  margin-left: -4px;
  border: 1px solid var(--card-elevated);
}

.member-avatar:first-child {
  margin-left: 0;
}

.more-members {
  font-size: 11px;
  color: var(--muted-foreground);
  padding: 0 4px;
}

.member-count {
  margin-left: 8px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.archive-preview {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.match-count {
  color: var(--accent-orange);
  font-weight: 500;
}

/* 响应式 */
@media (max-width: 640px) {
  .page-header {
    padding: 10px 12px;
  }

  .filter-section {
    padding: 10px 12px;
  }

  .archives-main {
    padding: 12px;
  }

  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-input {
    min-width: 0;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .filter-input {
    font-size: 16px;
  }
}
</style>
