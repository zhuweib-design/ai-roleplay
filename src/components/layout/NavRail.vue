<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';
import type { NavKey } from '@/types';

const router = useRouter();
const characterStore = useCharacterStore();

interface NavItem {
  key: NavKey;
  label: string;
  icon: IconName;
  route?: string;
}

const navItems: NavItem[] = [
  { key: 'chat', label: '对话', icon: 'house', route: '/chat' },
  { key: 'character', label: '角色', icon: 'user', route: '/character' },
  { key: 'worldbook', label: '世界书', icon: 'compass', route: '/worldbook' },
  { key: 'group', label: '群聊', icon: 'chat-circle', route: '/group' },
  { key: 'databank', label: '数据银行', icon: 'file', route: '/databank' },
  { key: 'story', label: '故事引擎', icon: 'book-open', route: '/story' },
  { key: 'random-events', label: '随机事件', icon: 'star', route: '/random-events' },
  { key: 'local-model', label: '本地模型', icon: 'cpu', route: '/local-model' },
  { key: 'image-gen', label: '图像生成', icon: 'image-stack', route: '/image-gen' },
  { key: 'character-version', label: '版本管理', icon: 'git-commit', route: '/character-version' },
  { key: 'community-market', label: '社区市场', icon: 'store', route: '/community-market' },
  { key: 'archives', label: '记录', icon: 'bookmark-simple', route: '/archives' },
];

const settingsItem: NavItem = { key: 'settings', label: '设置', icon: 'gear', route: '/settings' };
const profileItem: NavItem = { key: 'profile', label: '个人中心', icon: 'user', route: '/profile' };

function handleNav(item: NavItem) {
  characterStore.setNav(item.key);

  // 移动端：点击对话按钮切换角色列表
  if (item.key === 'chat' && window.matchMedia('(max-width: 767px)').matches) {
    characterStore.toggleCharacterList();
  }

  if (item.route) {
    router.push(item.route);
  }
}

function isActive(key: NavKey): boolean {
  return characterStore.currentNav === key;
}
</script>

<template>
  <nav class="nav-rail" aria-label="主导航">
    <ul class="nav-list" role="list">
      <li v-for="item in navItems" :key="item.key" class="nav-list-item">
        <button
          type="button"
          class="nav-item"
          :class="{ active: isActive(item.key) }"
          :aria-current="isActive(item.key) ? 'page' : undefined"
          :aria-label="item.label"
          @click="handleNav(item)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="item.icon" :size="24" /></span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </li>

      <li class="nav-list-item nav-list-item-settings">
        <button
          type="button"
          class="nav-item settings"
          :class="{ active: isActive(settingsItem.key) }"
          :aria-current="isActive(settingsItem.key) ? 'page' : undefined"
          :aria-label="settingsItem.label"
          @click="handleNav(settingsItem)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="settingsItem.icon" :size="24" /></span>
          <span class="nav-label">{{ settingsItem.label }}</span>
        </button>
      </li>

      <li class="nav-list-item nav-list-item-profile">
        <button
          type="button"
          class="nav-item profile"
          :class="{ active: isActive(profileItem.key) }"
          :aria-current="isActive(profileItem.key) ? 'page' : undefined"
          :aria-label="profileItem.label"
          @click="handleNav(profileItem)"
        >
          <span class="nav-icon" aria-hidden="true"><Icon :name="profileItem.icon" :size="24" /></span>
          <span class="nav-label">{{ profileItem.label }}</span>
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
