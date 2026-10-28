import { t } from '@/i18n';
import {
  MARKET_INDEX_URL,
  fetchMarketIndex,
  downloadMarketItem,
  parseCharacterItem,
  type MarketIndexItem,
  type DownloadedMarketItem,
} from '@/core/market-index';
import { importV2Card } from '@/core/character-card';
import { cardToUiChar } from '@/services/type-adapters';
import { useCharacterStore } from '@/stores/character';
import type { Ref } from 'vue';

/**
 * R4-14：community-market store 的远程市场域。
 *
 * 这一域是 store 内唯一完全自闭环的业务域 —— 全程不碰 market engine 实例、
 * 不碰 `commitTick`（引擎快照持久化）、不碰 `currentUser`（登录态）。
 * 它只读写自己那五个 ref，并通过 `persistMeta` 落盘安装来源。
 *
 * 引用是宿主传进来的同一份 ref，拆文件不改变 Pinia 的响应式边界。
 */
export interface RemoteMarketCtx {
  remoteItems: Ref<MarketIndexItem[]>;
  remoteLoading: Ref<boolean>;
  remoteError: Ref<string | null>;
  downloadProgress: Ref<Record<string, { received: number; total: number; status: string }>>;
  installedOrigins: Ref<Record<string, { itemId: string; version: string }>>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  /** 由宿主提供：落盘当前用户 / 收藏 / 安装来源 */
  persistMeta: () => Promise<void>;
}

export function createRemoteMarketActions(ctx: RemoteMarketCtx) {
  const {
    remoteItems,
    remoteLoading,
    remoteError,
    downloadProgress,
    installedOrigins,
    lastError,
    lastInfo,
    persistMeta,
  } = ctx;

  /** 拉取远程市场索引清单（GitHub） */
  async function loadRemoteIndex(): Promise<boolean> {
    remoteLoading.value = true;
    remoteError.value = null;
    try {
      const manifest = await fetchMarketIndex(MARKET_INDEX_URL);
      if (!manifest) {
        remoteError.value = t('market.remoteIndexBroken');
        return false;
      }
      remoteItems.value = manifest.items;
      return true;
    } catch (err) {
      remoteError.value =
        err instanceof Error ? err.message : t('market.remoteLoadFailed');
      return false;
    } finally {
      remoteLoading.value = false;
    }
  }

  /**
   * 从远程市场下载并导入为本地角色卡（带流式进度）
   *
   * 返回**新角色的 id**（E20：装完必须能一跳看到结果），失败返回 null。
   * 此前返回 boolean，界面拿不到落点，只能弹一句"已安装"，用户不知道去了哪。
   */
  async function installRemoteItem(itemId: string): Promise<string | null> {
    const item = remoteItems.value.find((i) => i.id === itemId);
    if (!item) {
      lastError.value = t('market.remoteItemMissing');
      return null;
    }
    const prog = downloadProgress.value[itemId] ?? { received: 0, total: -1, status: 'downloading' };
    downloadProgress.value[itemId] = { ...prog, status: 'downloading' };
    try {
      const downloaded = await downloadMarketItem(item, (received, total) => {
        downloadProgress.value[itemId] = { received, total, status: 'downloading' };
      });
      if (!downloaded) {
        downloadProgress.value[itemId] = { ...prog, received: 0, total: -1, status: 'failed' };
        lastError.value = t('market.remoteVerifyFailed');
        return null;
      }
      downloadProgress.value[itemId] = { received: downloaded.item.size, total: downloaded.item.size, status: 'installing' };
      const installedId = await importRemoteAsCharacter(downloaded);
      downloadProgress.value[itemId] = { received: 0, total: 0, status: 'done' };
      lastInfo.value = t('market.remoteInstalled', { name: item.name });
      return installedId;
    } catch (err) {
      downloadProgress.value[itemId] = { ...prog, received: 0, total: -1, status: 'failed' };
      lastError.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /** 将远程下载内容（角色卡）导入本地角色库，并记录安装来源（§14.4 更新检查） */
  async function importRemoteAsCharacter(downloaded: DownloadedMarketItem): Promise<string> {
    const charStore = useCharacterStore();
    const raw = parseCharacterItem(downloaded.content);
    if (!raw) {
      throw new Error(t('market.remoteBadCharacter'));
    }
    let card;
    try {
      card = importV2Card(raw);
      if (!card) throw new Error(t('market.remoteBadCharacter'));
    } catch {
      throw new Error(t('market.remoteBadCharacter'));
    }
    const ui = cardToUiChar(card);
    // 避免重名
    if (charStore.characters.some((c) => c.name === ui.name)) {
      ui.name = `${ui.name}${t('market.remoteSuffix')}`;
    }
    charStore.characters.push(ui);
    await charStore.persistCharacter(ui.id);
    // 记录远程安装来源（版本对比基准）
    installedOrigins.value[ui.id] = {
      itemId: downloaded.item.id,
      version: downloaded.item.version,
    };
    void persistMeta();
    return ui.id;
  }

  /**
   * §14.4 更新检查：比对已装远程来源与最新清单版本
   * 返回有可用更新的条目（installVersion 低于 latestVersion）
   */
  function getUpdatableInstalls(): {
    characterId: string;
    itemId: string;
    installedVersion: string;
    latestVersion: string;
    name: string;
  }[] {
    const list: {
      characterId: string;
      itemId: string;
      installedVersion: string;
      latestVersion: string;
      name: string;
    }[] = [];
    for (const charId of Object.keys(installedOrigins.value)) {
      const o = installedOrigins.value[charId];
      if (!o) continue;
      const latest = remoteItems.value.find((i) => i.id === o.itemId);
      if (latest && latest.version !== o.version) {
        list.push({
          characterId: charId,
          itemId: latest.id,
          installedVersion: o.version,
          latestVersion: latest.version,
          name: latest.name,
        });
      }
    }
    return list;
  }

  return {
    loadRemoteIndex,
    installRemoteItem,
    getUpdatableInstalls,
  };
}
