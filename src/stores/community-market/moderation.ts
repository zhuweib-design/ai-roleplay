/**
 * B6：community-market store 的管理/审核域。
 *
 * 对应市场页"管理"Tab 的五个动作：审核状态流转、举报列表与裁决、精选开关、
 * 删卡。前四个是引擎方法的 try/catch 包装；`deleteCard` 多一件事 —— 删掉之后
 * 要把这张卡从收藏里摘出去并落盘，所以收藏 ref 与 `persistMeta` 由宿主传进来。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type {
  CommunityMarketEngine,
  MarketReport,
  ModerationStatus,
} from '@/core/community-market';

export interface MarketModerationCtx {
  engine: CommunityMarketEngine;
  favorites: Ref<string[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  commitTick: () => void;
  persistMeta: () => Promise<void>;
}

export function createMarketModeration(ctx: MarketModerationCtx) {
  const { engine, favorites, lastError, lastInfo, commitTick, persistMeta } = ctx;

  function setModerationStatus(
    marketId: string,
    status: ModerationStatus
  ): boolean {
    try {
      engine.setModerationStatus(marketId, status);
      lastInfo.value = t('mkt.statusUpdated', { status });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** D6 补完：获取举报列表（管理 Tab） */
  function getReports(): MarketReport[] {
    return engine.getReports();
  }

  /** D6 补完：解决/驳回举报（管理 Tab） */
  function resolveReport(
    reportId: string,
    status: 'resolved' | 'dismissed',
    resolution?: string
  ): boolean {
    try {
      engine.resolveReport(reportId, status, resolution);
      lastInfo.value = t('mkt.reportHandled', { status: status === 'resolved' ? t('mkt.resolved') : t('mkt.dismissed') });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function setFeatured(marketId: string, featured: boolean): boolean {
    try {
      engine.setFeatured(marketId, featured);
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function deleteCard(marketId: string): boolean {
    const ok = engine.deleteCard(marketId);
    if (ok) {
      // 从收藏中移除
      const idx = favorites.value.indexOf(marketId);
      if (idx >= 0) {
        favorites.value.splice(idx, 1);
        void persistMeta();
      }
      lastInfo.value = t('mkt.cardDeleted');
      commitTick();
    }
    return ok;
  }

  return {
    setModerationStatus,
    getReports,
    resolveReport,
    setFeatured,
    deleteCard,
  };
}
