<script setup lang="ts">
/**
 * MarketHeader — 市场页头（R2-4 从 CommunityMarketView 拆出）
 *
 * 职责：返回按钮 + 标题 + Beta 披露 + 索引地址披露 + 登录/登出入口。
 * 登录 Modal 留在宿主（多处 EmptyState 的 action 也要开它），
 * 这里只 emit `login` / `logout` 事件。
 */
import { useRouter } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { useCommunityMarketStore } from '@/stores/community-market';
import { MARKET_INDEX_URL } from '@/core/market-index';
import { t } from '@/i18n';

const emit = defineEmits<{
  login: [];
  logout: [];
}>();

const router = useRouter();
const store = useCommunityMarketStore();

function goBack(): void {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push('/chat');
  }
}
</script>

<template>
  <header class="page-header">
    <button type="button" class="header-btn" :aria-label="t('market.backAria')" @click="goBack">
      <Icon name="arrow-left" :size="18" aria-hidden="true" />
    </button>
    <h1 class="page-title">
      {{ t('market.title') }}
      <!--
        这条披露原来只在 title 里：触屏点不到、键盘聚焦也不显示，而它是本页最重要的免责。
        改成页头下面一行可见文字，不再依赖悬停。
      -->
      <span class="beta-badge">{{ t('market.beta') }}</span>
    </h1>
    <p class="beta-disclosure">{{ t('market.betaTitle') }}</p>
    <!--
      E21：索引地址只有构建期一个来源，界面上必须说清楚——否则提交信息里的
      "市场 URL 可配"会被理解成"这里能改"。连同当前值一起显示，claim 可核对。
    -->
    <p class="beta-disclosure">
      {{ t('market.sourceNote') }}<code class="market-source-url">{{ MARKET_INDEX_URL }}</code>
    </p>
    <div class="header-right">
      <template v-if="store.isLoggedIn">
        <span class="user-info">
          <Icon name="user" :size="16" />
          {{ store.currentUser?.name }}
        </span>
        <button type="button" class="btn btn-ghost" @click="emit('logout')">{{ t('market.logout') }}</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" @click="emit('login')">{{ t('market.login') }}</button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  /* 下面那两句说明写的是 flex:1 1 100%（本意独占一行），但这个容器一直没开 wrap，
     于是"标题 + 两句说明 + 右侧昵称入口"全挤在同一行里按比例缩——真机量到该按钮
     被压成 42×48（两个字竖排两行）。开 wrap 才是这段样式原本想表达的样子。 */
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.page-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

/* T-14: 市场 Beta 徽标 */
.beta-disclosure {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

/* E21：地址本身是数据，用等宽并允许断行，避免撑破页头 */
.market-source-url {
  margin-inline-start: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  word-break: break-all;
}

.beta-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
  /* warning 作文字叠在同色 15% 染层上，light 下仅 4.08:1；
     改用派生 token --warning-text（warning 与 foreground 混合，主题自适应）。 */
  color: var(--warning-text);
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
  letter-spacing: 0.5px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--background);
  }
}

.header-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
