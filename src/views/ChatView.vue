<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useCharacterStore } from '@/stores/character';
import CharacterList from '@/components/layout/CharacterList.vue';
import ChatMain from '@/components/chat/ChatMain.vue';
import ContextPanel from '@/components/layout/ContextPanel.vue';

const characterStore = useCharacterStore();

// 任意抽屉打开时显示遮罩（移动端）
const overlayActive = computed(
  () => characterStore.characterListOpen || characterStore.panelOpen
);

// 移动端判定：inert 与焦点管理仅在抽屉布局（<1025px）下生效
const isMobile = ref(false);
function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 1024px)').matches;
}

// 抽屉打开时把焦点移入抽屉；关闭时焦点回到主内容区（WCAG 2.4.3，不丢失焦点）
watch(overlayActive, (active) => {
  if (!isMobile.value) return;
  if (active) {
    const targetId = characterStore.characterListOpen
      ? 'character-drawer'
      : 'context-drawer';
    document.getElementById(targetId)?.focus();
  } else {
    document.getElementById('main-content')?.focus();
  }
});

// 点击遮罩关闭所有抽屉
function handleOverlayClick() {
  characterStore.closeAllDrawers();
}

// ESC 关闭抽屉（无障碍）
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && overlayActive.value) {
    characterStore.closeAllDrawers();
  }
}

onMounted(() => {
  updateIsMobile();
  // 移动端初始收起上下文面板，避免 `overlay-mask` 常驻拦截点击
  if (isMobile.value) {
    characterStore.closeAllDrawers();
  }
  window.addEventListener('resize', updateIsMobile);
  window.addEventListener('keydown', handleKeydown);
});

// 视口切换时同步：回到桌面展开面板，缩到移动收起，避免遮罩残留
watch(isMobile, (mobile) => {
  if (mobile) characterStore.closeAllDrawers();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="chat-shell">
    <!-- 角色列表侧栏（移动端为左抽屉；右侧面板打开时 inert 防焦点逃逸） -->
    <CharacterList :inert="characterStore.panelOpen && isMobile ? true : undefined" />

    <!-- 聊天主区（任一抽屉打开时 inert） -->
    <ChatMain :inert="overlayActive && isMobile ? true : undefined" />

    <!-- 右侧上下文面板（移动端为右抽屉；左侧抽屉打开时 inert） -->
    <ContextPanel :inert="characterStore.characterListOpen && isMobile ? true : undefined" />

    <!-- 移动端遮罩（纯视觉，焦点管理由上方 inert 负责） -->
    <div
      class="overlay-mask"
      :class="{ active: overlayActive }"
      aria-hidden="true"
      @click="handleOverlayClick"
    />
  </div>
</template>

<style scoped>
/* ChatView 主容器：在全局 .app-shell 内占据剩余空间并横向布局 */
.chat-shell {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

/* 桌面端：ContextPanel 在文档流中显示，无需遮罩 */
@media (min-width: 1025px) {
  .overlay-mask {
    display: none !important;
  }
}
</style>
