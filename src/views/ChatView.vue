<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useViewport } from '@/core/viewport';
import { useScrollLock } from '@/composables/useScrollLock';
import { t } from '@/i18n';
import CharacterList from '@/components/layout/CharacterList.vue';
import ChatMain from '@/components/chat/ChatMain.vue';
import ContextPanel from '@/components/layout/ContextPanel.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import GuidedTasksCard from '@/components/common/GuidedTasksCard.vue';

const router = useRouter();
const characterStore = useCharacterStore();

const hasCharacters = computed(() => characterStore.characters.length > 0);

function createCharacter(): void {
  void router.push({ name: 'character-new' });
}

// 任意抽屉打开时显示遮罩（移动端）
const overlayActive = computed(
  () => characterStore.characterDrawerOpen || characterStore.contextDrawerOpen
);

// I-8：抽屉打开时锁定 body 滚动，避免背景穿透（与 Modal 同源 useScrollLock）
useScrollLock(overlayActive);

// 非桌面判定（≤1024px）：inert 与焦点管理仅在抽屉布局下生效。
// S-10：统一为 useViewport().isCompact，消除「1024(TS) 与 640(CSS)」双真源冲突（G-5）。
const { isCompact } = useViewport();

// 抽屉打开时把焦点移入抽屉；关闭时焦点回到主内容区（WCAG 2.4.3，不丢失焦点）
watch(overlayActive, (active) => {
  if (!isCompact.value) return;
  if (active) {
    const targetId = characterStore.characterDrawerOpen
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

// ESC 关闭抽屉（无障碍）—— I-3：仅移动端（<1025px）生效，避免桌面宽度下误收起上下文面板
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && overlayActive.value && isCompact.value) {
    characterStore.closeAllDrawers();
  }
}

onMounted(() => {
  // 非桌面初始收起上下文面板，避免 `overlay-mask` 常驻拦截点击
  if (isCompact.value) {
    characterStore.closeAllDrawers();
  }
  window.addEventListener('keydown', handleKeydown);
});

// 视口切换时同步：缩到移动收起全部抽屉；回到桌面展开上下文面板，避免遮罩残留或面板卡在收起态
watch(isCompact, (mobile) => {
  if (mobile) {
    characterStore.closeAllDrawers();
  } else {
    characterStore.panelExpanded = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <!--
    零角色分支：此前 /chat 无条件渲染三栏（ChatMain.vue:93 直接断言 currentCharacter 非空），
    新用户第一次进来面对的是空壳。这里改为空态 + 任务中心。
  -->
  <div v-if="hasCharacters" class="chat-shell">
    <!--
      批次 0-6：`inert` 的方向此前是反的。
      旧逻辑守的是"抽屉开着、另一个抽屉别被点到"，漏的是"抽屉关着、离屏的抽屉别被 Tab 到"
      ——而后者才是真问题：390×844 连按 12 次 Tab，有 11 次停在 x≈-270 的不可见抽屉里。
      正确方向：抽屉**关着**（离屏）⇒ 它自己 inert；抽屉**开着** ⇒ 遮罩后面的主区 inert。
    -->
    <!-- 角色列表侧栏（移动端为左抽屉）：左抽屉关着 ⇒ 自身 inert -->
    <CharacterList :inert="!characterStore.characterDrawerOpen && isCompact ? true : undefined" />

    <!-- 聊天主区（任一抽屉打开 ⇒ 遮罩后面的主区 inert；条件原就正确，
         但此前只落到 <footer>，第 13 次 Tab 会逃到遮罩后面——根元素已接 inert，见 ChatMain.vue） -->
    <ChatMain :inert="overlayActive && isCompact ? true : undefined" />

    <!-- 右侧上下文面板（移动端为右抽屉）：右抽屉关着 ⇒ 自身 inert -->
    <ContextPanel :inert="!characterStore.contextDrawerOpen && isCompact ? true : undefined" />

    <!-- 移动端遮罩：I-12 键盘可达关闭（role=button + Enter/Space 关闭，ESC 由 handleKeydown 统一处理） -->
    <div
      class="overlay-mask"
      :class="{ active: overlayActive }"
      role="button"
      :aria-label="t('chat.closeSidebar')"
      tabindex="0"
      @click="handleOverlayClick"
      @keydown.enter.prevent="handleOverlayClick"
      @keydown.space.prevent="handleOverlayClick"
    />
  </div>

  <div v-else id="main-content" class="chat-coldstart" tabindex="-1">
    <EmptyState
      title-key="chat.emptyTitle"
      desc-key="chat.emptyDesc"
      icon="user"
      action-key="chat.emptyAction"
      @action="createCharacter"
    />
    <GuidedTasksCard />
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

.chat-coldstart {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
  flex: 1 1 0;
  min-width: 0;
  padding: var(--spacing-lg, 24px);
  overflow-y: auto;
}

/* 桌面端：ContextPanel 在文档流中显示，无需遮罩。
   不用 !important（F4）：base.css 的 `.overlay-mask` / `.overlay-mask.active` 都没声明
   display，这条 scoped 规则（0,2,0）本身就能生效。 */
@media (min-width: 1025px) {
  .overlay-mask {
    display: none;
  }
}
</style>
