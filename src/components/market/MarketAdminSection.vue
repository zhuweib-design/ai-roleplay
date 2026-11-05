<script setup lang="ts">
/**
 * MarketAdminSection — 管理 Tab（R2-4 从 CommunityMarketView 拆出）
 *
 * 统计卡 + 待审列表 + 举报列表（D6 补完的两组操作）。
 * 多根（stats-grid 与两组标题/列表在原页里是兄弟），不套 wrapper 保排布。
 * 操作结果经 `notify` 冒泡回宿主 Toast（R2-2 约定：全页单 Toast 实例）。
 */
import { useCommunityMarketStore } from '@/stores/community-market';
import { t } from '@/i18n';

const store = useCommunityMarketStore();

const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();

// ── D6 补完：管理操作 ──
function handleApprove(marketId: string): void {
  if (store.setModerationStatus(marketId, 'approved')) {
    emit('notify', 'success', t('market.approved'));
  }
}

function handleReject(marketId: string): void {
  if (store.setModerationStatus(marketId, 'rejected')) {
    emit('notify', 'error', t('market.rejected'));
  }
}

function handleResolveReport(reportId: string, status: 'resolved' | 'dismissed'): void {
  if (store.resolveReport(reportId, status)) {
    emit('notify', 'success', status === 'resolved' ? t('market.reportResolved') : t('market.reportDismissed'));
  }
}
</script>

<template>
  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.totalCards }}</span>
      <span class="stat-label">{{ t('market.statTotalCards') }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.totalUsers }}</span>
      <span class="stat-label">{{ t('market.statUsers') }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.totalReviews }}</span>
      <span class="stat-label">{{ t('market.statReviews') }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.totalDownloads }}</span>
      <span class="stat-label">{{ t('market.statDownloads') }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.pendingCards }}</span>
      <span class="stat-label">{{ t('market.statPending') }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{{ store.stats.totalReports }}</span>
      <span class="stat-label">{{ t('market.statReports') }}</span>
    </div>
  </div>

  <!-- D6 补完：待审核角色卡操作 -->
  <h3 class="admin-section-title">{{ t('market.adminPendingTitle') }}</h3>
  <ul class="admin-list" role="list">
    <li
      v-for="card in store.filteredCards.filter((c) => c.moderationStatus === 'pending')"
      :key="card.marketId"
      class="admin-row"
      role="listitem"
    >
      <span class="admin-name">{{ card.card.name }}</span>
      <span class="admin-meta">{{ t('market.author', { name: card.authorName }) }}</span>
      <div class="admin-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="handleApprove(card.marketId)"
        >
          {{ t('market.adminApprove') }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="handleReject(card.marketId)"
        >
          {{ t('market.adminReject') }}
        </button>
      </div>
    </li>
    <li v-if="store.filteredCards.filter((c) => c.moderationStatus === 'pending').length === 0" class="empty-mini">
      {{ t('market.adminNoPending') }}
    </li>
  </ul>

  <!-- D6 补完：举报处理 -->
  <h3 class="admin-section-title">{{ t('market.adminReportsTitle') }}</h3>
  <ul class="admin-list" role="list">
    <li
      v-for="report in store.getReports().filter((r) => r.status === 'pending')"
      :key="report.id"
      class="admin-row"
      role="listitem"
    >
      <span class="admin-name">{{ report.marketId }}</span>
      <span class="admin-meta">{{ t('market.adminReportMeta', { reason: report.reason, desc: report.description }) }}</span>
      <div class="admin-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="handleResolveReport(report.id, 'resolved')"
        >
          {{ t('market.adminResolve') }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="handleResolveReport(report.id, 'dismissed')"
        >
          {{ t('market.adminDismiss') }}
        </button>
      </div>
    </li>
    <li v-if="store.getReports().filter((r) => r.status === 'pending').length === 0" class="empty-mini">
      {{ t('market.adminNoReports') }}
    </li>
  </ul>
</template>

<style scoped>
/* D6 管理 Tab 操作区 */
.admin-section-title {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.admin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  font-size: 13px;
}
.admin-name {
  font-weight: 600;
  color: var(--text-primary);
  flex: 0 0 auto;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-meta {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
/* `.empty-mini` 两份定义是共享基类（详情弹窗也在用），留宿主 :deep()——见宿主注释 */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary-fg, var(--primary));
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin-top: 0.25rem;
}
</style>
