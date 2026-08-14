<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';
import type { NavKey } from '@/types';
import { t, type MessageKey } from '@/i18n';

const router = useRouter();
const characterStore = useCharacterStore();

interface NavItem {
  key: NavKey;
  /** i18n key（对应 nav.* 文案，类型安全） */
  labelKey: MessageKey;
  icon: IconName;
  route?: string;
}

const navItems: NavItem[] = [
  { key: 'chat', labelKey: 'nav.chat', icon: 'house', route: '/chat' },
  { key: 'character', labelKey: 'nav.character', icon: 'user', route: '/character' },
  { key: 'worldbook', labelKey: 'nav.worldbook', icon: 'compass', route: '/worldbook' },
  { key: 'group', labelKey: 'nav.group', icon: 'chat-circle', route: '/group' },
  { key: 'databank', labelKey: 'nav.databank', icon: 'file', route: '/databank' },
  { key: 'story', labelKey: 'nav.story', icon: 'book-open', route: '/story' },
  { key: 'random-events', labelKey: 'nav.randomEvents', icon: 'star', route: '/random-events' },
  { key: 'local-model', labelKey: 'nav.localModel', icon: 'cpu', route: '/local-model' },
  { key: 'image-gen', labelKey: 'nav.imageGen', icon: 'image-stack', route: '/image-gen' },
  { key: 'character-version', labelKey: 'nav.version', icon: 'git-commit', route: '/character-version' },
  { key: 'community-market', labelKey: 'nav.market', icon: 'store', route: '/community-market' },
  { key: 'archives', labelKey: 'nav.archives', icon: 'bookmark-simple', route: '/archives' },
];

const settingsItem: NavItem = { key: 'settings', labelKey: 'nav.settings', icon: 'gear', route: '/settings' };
const profileItem: NavItem = { key: 'profile', labelKey: 'nav.profile', icon: 'user', route: '/profile' };

function handleNav(item: NavItem) {
  characterStore.setNav(item.key);

  // 移动端：点击对话按钮切换角色列表
  if (item.key === 'chat' && window.matchMedia('(max-width: 767px)').matches) {
    characterStore.toggleCharacterList();
  }

  if (item.route) {
    void router.push(item.route);
  }
}

function isActive(key: NavKey): boolean {
  return characterStore.currentNav === key;
}
</script>

<template>
  <nav class="nav-rail" :aria-label="t('nav.main')">
    <ul class="nav-list" role="list">
      <li v-for="item in navItems" :key="item.key" class="nav-list-item">
        <button
          type="button"
          class="nav-item"
          :class="{ active: isActive(item.key) }"
          :aria-current="isActive(item.key) ? 'page' : undefined"
          :aria-label="t(item.labelKey)"
          @click="handleNav(item)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="item.icon" :size="24" /></span>
          <span class="nav-label">{{ t(item.labelKey) }}</span>
        </button>
      </li>

      <li class="nav-list-item nav-list-item-settings">
        <button
          type="button"
          class="nav-item settings"
          :class="{ active: isActive(settingsItem.key) }"
          :aria-current="isActive(settingsItem.key) ? 'page' : undefined"
          :aria-label="t(settingsItem.labelKey)"
          @click="handleNav(settingsItem)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="settingsItem.icon" :size="24" /></span>
          <span class="nav-label">{{ t(settingsItem.labelKey) }}</span>
        </button>
      </li>

      <li class="nav-list-item nav-list-item-profile">
        <button
          type="button"
          class="nav-item profile"
          :class="{ active: isActive(profileItem.key) }"
          :aria-current="isActive(profileItem.key) ? 'page' : undefined"
          :aria-label="t(profileItem.labelKey)"
          @click="handleNav(profileItem)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="profileItem.icon" :size="24" /></span>
          <span class="nav-label">{{ t(profileItem.labelKey) }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* 使用 ul/li 语义化列表结构，但保留原视觉布局 */
.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
}

.nav-list-item {
  width: 100%;
}

.nav-list-item-settings {
  margin-top: auto;
}
</style>
