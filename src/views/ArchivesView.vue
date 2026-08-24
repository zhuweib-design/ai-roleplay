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
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import type { GroupChat } from '@/core/group-chat';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

const groupStore = useGroupChatStore();
const router = useRouter();

/** 返回对话页 */
function goBack() {
  void router.push({ name: 'chat' });
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

// ── Toast（保留用于后续错误反馈扩展） ──
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

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

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

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

function goToGroupChat() {
  if (!viewingGroup.value) return;
  viewModalOpen.value = false;
  void router.push({ name: 'group' });
  // 选中该群聊
  groupStore.selectGroup(viewingGroup.value.id);
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
      <div v-else class="empty-state">
        <Icon name="bookmark-simple" :size="48" />
        <p v-if="groupStore.groups.length === 0">{{ t('archives.emptyNoData') }}</p>
        <p v-else>{{ t('archives.emptyNoMatch') }}</p>
        <button
type="button"
          v-if="groupStore.groups.length > 0"
          class="link-btn"
          @click="clearFilters"
        >
          {{ t('archives.clearLink') }}
        </button>
      </div>
    </main>

    <!-- 查看对话 Modal -->
    <Modal
      v-model="viewModalOpen"
      :title="viewingGroup ? viewingGroup.name : t('archives.viewTitle')"
    >
      <div v-if="viewingGroup" class="view-modal-body tk-scroll">
        <div class="view-modal-info">
          <span>{{ t('archives.viewMembers', { names: viewingGroup.members.map((m) => m.name).join('、') }) }}</span>
          <span>{{ t('archives.viewMessages', { count: viewingGroup.messages.length }) }}</span>
          <span>{{ t('archives.viewUpdated', { time: formatDateTime(viewingGroup.updatedAt) }) }}</span>
          <span v-if="viewingGroup.lifecycleStatus === 'archived'" class="archived-tag">
            {{ t('archives.archivedTag') }}
          </span>
        </div>
        <ul class="view-msg-list" role="list">
          <li
            v-for="msg in viewingGroup.messages"
            :key="msg.id"
            class="view-msg"
            :class="`view-msg-${msg.role}`"
            role="listitem"
          >
            <div v-if="msg.role === 'system'" class="view-msg-system">
              {{ msg.content }}
            </div>
            <template v-else>
              <div class="view-msg-sender">
                {{ msg.role === 'user' ? t('archives.senderMe') : msg.characterName ?? t('archives.senderAi') }}
              </div>
              <div class="view-msg-content">{{ msg.content }}</div>
            </template>
          </li>
        </ul>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="viewModalOpen = false"
        >
          {{ t('archives.close') }}
        </button>
        <button
          v-if="viewingGroup && viewingGroup.lifecycleStatus !== 'archived'"
          type="button"
          class="modal-btn modal-confirm"
          @click="goToGroupChat"
        >
          {{ t('archives.goGroup') }}
        </button>
      </template>
    </Modal>

    <!-- Toast -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
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

.header-btn:hover {
  background: var(--card-elevated);
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

.clear-btn:hover {
  color: var(--foreground);
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

.archive-item:hover {
  border-color: var(--accent-blue);
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
  color: var(--accent-orange);
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

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--muted-foreground);
  text-align: center;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent-blue);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}

/* 查看 Modal */
.view-modal-body {
  max-height: 60vh;
  overflow-y: auto;
}

.view-modal-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--background);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--muted-foreground);
}

.view-msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-msg {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.5;
}

.view-msg-user {
  background: color-mix(in srgb, var(--primary, #dc1434) 8%, transparent);
  align-self: flex-end;
}

.view-msg-assistant {
  background: color-mix(in srgb, var(--secondary, #25f4ee) 5%, transparent);
  border-left: 2px solid var(--secondary, #25f4ee);
}

.view-msg-system {
  text-align: center;
  font-style: italic;
  color: var(--muted-foreground);
  font-size: 12px;
  padding: 4px 8px;
}

.view-msg-sender {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  margin-bottom: 4px;
}

.view-msg-content {
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Modal 按钮 */
.modal-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.modal-cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

.modal-confirm {
  background: var(--accent-blue);
  color: var(--on-accent);
  border-color: var(--accent-blue);
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
</style>
