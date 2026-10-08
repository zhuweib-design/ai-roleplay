<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import {
  NAV_GROUPS,
  activeEntryForRoute,
  entriesOfGroup,
  systemEntries,
  type NavEntry,
} from '@/core/nav-model';

const router = useRouter();
const route = useRoute();

// N 层（设计文档 §3.2）：清单来自 nav-model 单一事实源，高亮由路由派生。
// 原实现把激活态写进 characterStore.currentNav（只有点击才更新），
// 经 /character/new、/character/:id/edit 等页进入时高亮会停在上一入口。
// 原 handleNav 里的 isMobile 分支是死代码（rail 仅 !isMobile 挂载，App.vue:347），已删。
const activeId = computed(() => activeEntryForRoute(route.name as string | undefined)?.id);

const groups = NAV_GROUPS.map((group) => ({ ...group, entries: entriesOfGroup(group.id) }));
const system = systemEntries();

function handleNav(item: NavEntry) {
  // I-9: 捕获重复导航（点击当前项）产生的 NavigationDuplicated rejection，避免未处理 Promise rejection
  router.push({ name: item.routeName }).catch(() => {});
}
</script>

<template>
  <nav class="nav-rail" :aria-label="t('nav.main')">
    <div
      v-for="group in groups"
      :key="group.id"
      class="nav-group"
      role="group"
      :aria-labelledby="`nav-group-${group.id}`"
    >
      <h2 :id="`nav-group-${group.id}`" class="nav-group-label">{{ t(group.labelKey) }}</h2>
      <ul class="nav-list" role="list">
        <li v-for="item in group.entries" :key="item.id" class="nav-list-item">
          <button
            type="button"
            class="nav-item"
            :class="{ active: activeId === item.id }"
            :aria-current="activeId === item.id ? 'page' : undefined"
            :aria-label="t(item.labelKey)"
            :title="t(item.descKey)"
            :data-rel-jump="`nav-${item.id}`"
            @click="handleNav(item)"
          >
            <span class="nav-icon" aria-hidden="true"><Icon :name="item.icon" :size="18" /></span>
            <span class="nav-label">{{ t(item.labelKey) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 系统项（引导 / 更多 / 设置）整体钉到底部：它们不是内容资源，与上方四组用分隔线断开 -->
    <ul class="nav-list nav-system-list" role="list">
      <li v-for="item in system" :key="item.id" class="nav-list-item">
        <button
          type="button"
          class="nav-item"
          :class="{ active: activeId === item.id }"
          :aria-current="activeId === item.id ? 'page' : undefined"
          :aria-label="t(item.labelKey)"
          :title="t(item.descKey)"
          :data-rel-jump="`nav-${item.id}`"
          @click="handleNav(item)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="item.icon" :size="18" /></span>
          <span class="nav-label">{{ t(item.labelKey) }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* 布局几何在 src/styles/layout.css（与 app-shell 同源），这里只留结构无关的局部规则 */
.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.nav-list-item {
  width: 100%;
}

/* 系统项整体下沉：内容组再多也不会把它挤出可视区 */
.nav-system-list {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

/* 组标题：左对齐 + 小字 + 上方分隔线，明确"这是分组，不是又一个入口" */
.nav-group + .nav-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.nav-group-label {
  margin: 0 0 2px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.06em;
  text-align: left;
  color: var(--muted-foreground);
}
</style>
