<script setup lang="ts">
/**
 * MarketRemotePanel — 远程市场面板 + §14.4 更新检查横幅（R2-4 从 CommunityMarketView 拆出）
 *
 * 职责边界：
 * - §14.4：已装远程条目的版本更新检查与一键更新
 * - T-11：远程索引加载、下载进度、安装
 * - E20：安装完成后就地可见的结果条（两条去路：看这个角色 / 看整个角色列表）
 *
 * 状态全在 store（remoteItems / downloadProgress / lastError / lastInfo）；
 * `lastInstalled` 是纯 UI 落点提示，只有本面板用，留组件内。
 */
import { ref, computed } from 'vue';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import { formatBytes } from './market-format';
import { t } from '@/i18n';

const store = useCommunityMarketStore();
const characterStore = useCharacterStore();
const { pushWithReturn } = useReadinessJump();

// §14.4 更新检查：有可用更新的已装远程条目
const updates = computed(() => store.getUpdatableInstalls());

function handleUpdateInstall(itemId: string) {
  void handleRemoteInstall(itemId);
}

/**
 * E20：安装完成后必须看得见落点。此前只有一句 toast（`lastInfo`），
 * 用户不知道角色去了哪、也没有入口；现在把新角色 id 接住，就地给一条可点结果。
 */
const lastInstalled = ref<{ id: string; name: string } | null>(null);

async function handleRemoteInstall(itemId: string): Promise<void> {
  const installedId = await store.installRemoteItem(itemId);
  if (!installedId) return;
  const name = characterStore.characters.find((c) => c.id === installedId)?.name ?? installedId;
  lastInstalled.value = { id: installedId, name };
}

function jumpInstalled(to: 'edit' | 'list'): void {
  const id = lastInstalled.value?.id;
  if (!id) return;
  pushWithReturn(to === 'edit' ? { name: 'character-edit', params: { id } } : { name: 'character-list' });
}

function remotePercent(itemId: string): number {
  const p = store.downloadProgress[itemId];
  if (!p || p.total <= 0) return 0;
  return Math.min(100, Math.round((p.received / p.total) * 100));
}

function handleLoadRemote(): void {
  void store.loadRemoteIndex();
}
</script>

<!-- 多根：更新横幅与远程面板在原页里是兄弟，套进面板会多一层虚线框 -->
<template>
  <!-- §14.4 更新检查横幅 -->
  <div v-if="updates.length" class="updates-banner" role="region" :aria-label="t('market.updatesAria')">
    <div class="updates-title">
      <Icon name="refresh-cw" :size="16" aria-hidden="true" />
      <span>{{ t('market.updatesTitle', { count: updates.length }) }}</span>
    </div>
    <ul class="updates-list">
      <li v-for="u in updates" :key="u.itemId" class="updates-item">
        <span class="updates-name">{{ u.name }}</span>
        <span class="updates-version">{{ u.installedVersion }} → {{ u.latestVersion }}</span>
        <button
          type="button"
          class="updates-btn"
          :disabled="store.downloadProgress[u.itemId]?.status === 'downloading' || store.downloadProgress[u.itemId]?.status === 'installing'"
          @click="handleUpdateInstall(u.itemId)"
        >
          {{
            store.downloadProgress[u.itemId]?.status === 'downloading' || store.downloadProgress[u.itemId]?.status === 'installing'
              ? t('market.updating')
              : t('market.update')
          }}
        </button>
      </li>
    </ul>
  </div>
  <!-- 远程市场（T-11 真实下载流） -->
  <div class="remote-panel">
    <div class="remote-panel-head">
      <span class="remote-title">{{ t('market.remoteTitle') }}</span>
      <button
        type="button"
        class="remote-refresh"
        :disabled="store.remoteLoading"
        @click="handleLoadRemote"
      >
        {{ store.remoteLoading ? t('market.remoteLoading') : t('market.remoteLoad') }}
      </button>
    </div>
    <p v-if="store.remoteError" class="remote-error">{{ store.remoteError }}</p>
    <ul v-if="store.remoteItems.length > 0" class="remote-list">
      <li v-for="item in store.remoteItems" :key="item.id" class="remote-item">
        <div class="remote-item-info">
          <span class="remote-item-name">{{ item.name }}</span>
          <span class="remote-item-meta">
            {{ item.type }} · v{{ item.version }} · {{ item.author }} · {{ formatBytes(item.size) }}
          </span>
          <span v-if="item.description" class="remote-item-desc">{{ item.description }}</span>
        </div>
        <div class="remote-item-action">
          <span v-if="store.downloadProgress[item.id]?.status === 'done'" class="remote-done">
            {{ t('market.remoteInstalledOk') }}
          </span>
          <template v-else-if="store.downloadProgress[item.id]?.status === 'downloading'">
            <div class="remote-progress" role="progressbar" :aria-valuenow="remotePercent(item.id)" :aria-valuemin="0" :aria-valuemax="100" :aria-label="t('market.remoteProgressAria')">
              <div class="remote-progress-fill" :style="{ width: remotePercent(item.id) + '%' }"></div>
            </div>
            <span class="remote-progress-text">{{ remotePercent(item.id) }}%</span>
          </template>
          <button
            v-else
            type="button"
            class="remote-install"
            :disabled="store.downloadProgress[item.id]?.status === 'installing'"
            @click="handleRemoteInstall(item.id)"
          >
            {{ store.downloadProgress[item.id]?.status === 'installing' ? t('market.remoteInstalling') : t('market.download') }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="!store.remoteLoading" class="remote-hint">{{ t('market.remoteHint') }}</p>
    <!-- E20：安装结果就地可见，且给两条去路（看这个角色 / 看整个角色列表） -->
    <div v-if="lastInstalled" class="installed-result" role="status">
      <Icon name="check" :size="14" aria-hidden="true" />
      <span class="installed-result-text">{{ t('market.installedToLib', { name: lastInstalled.name }) }}</span>
      <button type="button" class="installed-go" data-rel-jump="rel-market-edit" @click="jumpInstalled('edit')">
        {{ t('market.installedGoEdit') }}
      </button>
      <button
        type="button"
        class="installed-go ghost"
        data-rel-jump="rel-market-chars"
        @click="jumpInstalled('list')"
      >
        {{ t('market.installedGoList') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.remote-panel {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  background: var(--card);
}

/* §14.4 更新检查横幅 */
.updates-banner {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
}
.updates-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--foreground);
}
.updates-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.updates-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.updates-name {
  font-weight: 500;
  color: var(--foreground);
  flex: 1;
  min-width: 120px;
}
.updates-version {
  color: var(--muted-foreground);
  font-size: 0.8rem;
  font-family: var(--font-mono);
}
.updates-btn {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--secondary);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--secondary-text);
  font-size: 0.8rem;
  cursor: pointer;
}
.updates-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.remote-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.remote-title {
  font-weight: 600;
  color: var(--foreground);
}
/* E20：安装结果条 */
.installed-result {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 0.8rem;
}
.installed-result-text {
  flex: 1 1 auto;
  min-width: 0;
}
.installed-go {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--secondary);
  border-radius: 0.4rem;
  background: transparent;
  color: var(--secondary-text);
  font-size: 0.8rem;
  cursor: pointer;
}
.installed-go.ghost {
  border-color: var(--border);
  color: var(--muted-foreground);
}
@media (hover: hover) {
  .installed-go:hover {
    background: var(--secondary);
    color: var(--on-secondary);
  }
  .installed-go.ghost:hover {
    background: var(--border);
    color: var(--on-border-fill);
  }
}
.installed-go:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
.remote-refresh,
.remote-install {
  padding: 0.35rem 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  cursor: pointer;
  font-size: 0.8rem;
}
.remote-refresh:disabled,
.remote-install:disabled {
  opacity: 0.6;
  cursor: default;
}
.remote-error {
  color: var(--error-fg);
  font-size: 0.8rem;
  margin: 0.25rem 0;
}
.remote-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.remote-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
}
.remote-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.remote-item-name {
  font-weight: 600;
  color: var(--foreground);
}
.remote-item-meta {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.remote-item-desc {
  font-size: 0.8rem;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remote-item-action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.remote-progress {
  width: 120px;
  height: 0.5rem;
  background: var(--border);
  border-radius: 0.25rem;
  overflow: hidden;
}
.remote-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.15s ease;
}
.remote-progress-text {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  min-width: 2.5rem;
  text-align: right;
}
.remote-done {
  color: var(--success-fg);
  font-size: 0.8rem;
  font-weight: 600;
}
.remote-hint {
  color: var(--muted-foreground);
  font-size: 0.8rem;
  margin: 0.25rem 0;
}
</style>
