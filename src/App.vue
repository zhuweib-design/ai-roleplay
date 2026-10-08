<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { useGroupChatStore } from '@/stores/group-chat';
import { useDataBankStore } from '@/stores/data-bank';
import { useStoryStore } from '@/stores/story';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useRandomEventsStore } from '@/stores/random-events';
import { getStorageAdapter, getStorageEnv } from '@storage/storage-factory';
import { initStoragePersistence } from '@/core/storage-persistence';
import { TauriFSAdapter } from '@storage/tauri-fs-adapter';
import { importCharacterPng } from '@/services/backup-service';
import { cardToUiChar } from '@/services/type-adapters';
import Toast from '@/components/common/Toast.vue';
import { useActiveToast, dismissToast } from '@/utils/toast-service';
import NavRail from '@/components/layout/NavRail.vue';
import BottomNav from '@/components/mobile/BottomNav.vue';
import Icon from '@/components/common/Icon.vue';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { isDetailRoute } from '@/core/mobile-nav';
import MasterPasswordModal from '@/components/common/MasterPasswordModal.vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';
import OnboardingModal from '@/components/common/OnboardingModal.vue';
import { shouldShowOnboarding } from '@/utils/onboarding';
import { t } from '@/i18n';
import { useViewport } from '@/core/viewport';
import { logger } from '@/utils/logger';

const settings = useSettingsStore();
const chatStore = useChatStore();
const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();
const groupChatStore = useGroupChatStore();
const dataBankStore = useDataBankStore();
const storyStore = useStoryStore();
const versionStore = useCharacterVersionStore();
const communityMarketStore = useCommunityMarketStore();
const characterVersionStore = useCharacterVersionStore();
const randomEventsStore = useRandomEventsStore();

// 移动端底部导航:仅主 Tab 页显示(二级详情页全屏)
const route = useRoute();
// 底栏显隐改由"是否二级沉浸页"决定（isDetailRoute 此前零消费者，实际门禁一直是 isMainTab，
// 导致 /group 既不是主 Tab 又被当成沉浸页处理——进入后底部导航消失，成为单向门）。
// 现在的口径：移动端 + 非沉浸页 => 显示底栏；沉浸页仍是角色编辑/新建两页。
const showBottomNav = computed(
  () => isMobile.value && !isDetailRoute(route.name as string | undefined)
);

// L 层深链的回程。`?from=` 契约此前只有设置页兑现（它自己有一枚位置更贴合的面板头按钮），
// 世界书 / 数据银行 / 版本 / 群聊这些目标把用户带过去后给不出回头路。
const { fromPath, backFromQuery } = useReadinessJump();
const showSourceReturn = computed(() => !!fromPath.value && route.name !== 'settings');

// 全局 Toast 队列（S1）：所有面板经 toast-service 触发，容器只在 App.vue 挂载一次
const activeToast = useActiveToast();

// S-1（2026-09-16）：移动端(≤640)真卸载 NavRail，改由 BottomNav 承载；
// 避免与 BottomNav 双高亮（I-4）。S-10：端判定统一由 useViewport() 提供（L4 唯一来源），
// 消除组件内 window.matchMedia 脏判断（G-4）。桌面/平板(>640)保留 NavRail。
const { isMobile } = useViewport();

// AC20 主密码弹窗状态
const mpModalVisible = ref(false);
const mpModalMode = ref<MasterPasswordMode>('unlock');

// P2-7 新手引导: 首次启动展示核心功能指引(完成后不再自动弹出)
const onboardingOpen = ref(false);

// 候选5：Tauri 桌面版未实现功能的一次性提示（可关闭）
const platformNotice = ref('');
function dismissPlatformNotice() {
  platformNotice.value = '';
}

// ── T-15: 断网提示 ──
const isOnline = ref(navigator.onLine);
function handleOnline() {
  isOnline.value = true;
}
function handleOffline() {
  isOnline.value = false;
}

// ── T-15: 拖拽导入角色卡/世界书 ──
const isDragging = ref(false);
let dragDepth = 0;
const importBusy = ref(false);

function onDragEnter(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  isDragging.value = true;
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDragging.value = false;
}

function onDragOver(e: DragEvent) {
  // 必须阻止默认行为才能接收 drop
  e.preventDefault();
}

async function onDrop(e: DragEvent) {
  e.preventDefault();
  dragDepth = 0;
  isDragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length === 0 || importBusy.value) return;
  importBusy.value = true;
  try {
    await importDroppedFiles(files);
  } finally {
    importBusy.value = false;
  }
}

/** 按文件类型路由:-json 先试角色卡 V2,失败再试世界书;-png 走角色卡 PNG 导入 */
async function importDroppedFiles(files: File[]) {
  let imported = 0;
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'png') {
        const card = await importCharacterPng(file);
        if (card) {
          const ui = cardToUiChar(card);
          if (characterStore.characters.some((c) => c.name === ui.name)) {
            ui.name = `${ui.name}${t('app.importSuffix')}`;
          }
          characterStore.characters.push(ui);
          await characterStore.persistCharacter(ui.id);
          imported++;
        }
      } else if (ext === 'json') {
        // 先按角色卡 V2 解析
        const charId = await characterStore.importV2File(file);
        if (charId) {
          imported++;
          continue;
        }
        // 失败则按世界书解析
        const lbId = await lorebookStore.importLorebookFile(file);
        if (lbId) {
          imported++;
        }
      }
    } catch {
      // 单个文件失败不影响其余文件
    }
  }
  platformNotice.value =
    imported > 0
      ? t('app.dragImportSuccess', { count: imported })
      : t('app.dragImportFail');
}

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('drop', (e) => void onDrop(e));
});

/**
 * 当前角色实际应生效的 API Profile（computed 缓存）
 * - 角色绑定了 profileId → 取绑定的 ApiProfile（per-role 模型绑定）
 * - 未绑定 → 跟随全局激活 Profile
 * - 未解锁（且设置过主密码）→ null（避免注入加密的 apiKey）
 *
 * 说明：替代原 `resolveCharacterProfile()` 普通函数（原实现被 3 处调用，
 * 每次切换角色都重新 find 查找、且不参与响应式依赖追踪）。
 */
const activeProfile = computed(() => {
  if (!(settings.isUnlocked || !settings.hasMasterPassword)) return null;
  const c = characterStore.currentCharacter;
  const pid = c?.profileId;
  if (pid) {
    return settings.apiProfiles.find((p) => p.id === pid) ?? null;
  }
  return settings.activeProfile;
});

onMounted(async () => {
  // T-15: 断网监听与全局拖拽监听
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', (e) => void onDrop(e));
  // 通过工厂方法获取存储适配器
  // - Tauri 环境 → TauriFSAdapter（本地文件系统）
  // - 浏览器环境 → IndexedDBAdapter（IndexedDB）
  try {
    const adapter = getStorageAdapter();
    await adapter.init();
    chatStore.setStorageAdapter(adapter);
    // 两个数据域互不依赖（本地长期记忆 / 群聊待提交回合），并行加载（原为串行 await）
    await Promise.all([
      chatStore.loadLocalMemoryStore().catch((err) => {
        logger.error('Storage', '从存储加载本地长期记忆失败', err);
      }),
      chatStore.loadRuntimePendingGroupTurns().catch((err) => {
        logger.error('Storage', '从存储加载群聊 Runtime 待提交回合失败', err);
      }),
    ]);
    characterStore.setStorageAdapter(adapter);
    settings.setStorageAdapter(adapter);
    // W3 新增：世界书与群聊 store 注入适配器
    lorebookStore.setStorageAdapter(adapter);
    groupChatStore.setStorageAdapter(adapter);
    // 迭代26 新增：DataBank store 注入适配器 (F09)
    dataBankStore.setStorageAdapter(adapter);
    // 迭代31 新增：Story store 注入适配器 (F16)
    storyStore.setStorageAdapter(adapter);
    // 迭代33 新增：社区市场 / 角色版本 store 注入适配器（快照持久化）
    communityMarketStore.setStorageAdapter(adapter);
    characterVersionStore.setStorageAdapter(adapter);
    // D-9：随机事件状态挂快照通道（模板/场景配置/结果此前仅内存）
    randomEventsStore.setStorageAdapter(adapter);
    void randomEventsStore.loadFromStorage();

    // 控制台输出当前环境（便于诊断）
     
    logger.info('Storage', `当前环境: ${getStorageEnv()}`);

    // P1-10：Web / PWA 端申请 IndexedDB 持久化授权，降低浏览器在存储压力下驱逐数据的风险。
    // 仅 Web 需要（Tauri 走本地文件系统，无此概念）；非阻塞，失败不阻断启动。
    if (getStorageEnv() === 'web') {
      void initStoragePersistence().then((state) => {
        logger.info('Storage', `持久化授权: ${state}`);
      });
    }

    // 候选5：Tauri 环境提示未实现能力，避免功能静默不可用
    if (TauriFSAdapter.isTauriEnv()) {
      const missing = TauriFSAdapter.getUnimplementedFeatureNames();
      if (missing.length > 0) {
         
        logger.warn('Storage', `桌面版暂不支持：${missing.join('、')}`);
        platformNotice.value = t('app.desktopUnsupported', { features: missing.join('、') });
      }
    }

    // 先加载设置（设置中包含主题与字号），再加载角色
    await settings.loadFromStorage().catch((err) => {
      logger.error('Storage', '从存储加载设置失败', err);
    });
    // 应用初始主题与字号（loadFromStorage 内部已应用，这里冗余以确保生效）
    settings.setTheme(settings.theme);
    settings.setFontSize(settings.fontSize);
    // T-13 语言：i18n localeRef 与 store 已双向同步（loadFromStorage 内完成）

    // AC20 安全：主密码仅存运行时内存，刷新后需重新解锁
    // hasMasterPassword=true → 显示解锁 Modal
    const autoUnlocked = await settings.restoreSession().catch((err) => {
      logger.error('Storage', '恢复主密码会话失败', err);
      return false;
    });
    if (!autoUnlocked && settings.hasMasterPassword) {
      // 需要手动解锁
      mpModalMode.value = 'unlock';
      mpModalVisible.value = true;
    }

    // 从存储加载角色卡/世界书/群聊/数据银行/故事：
    // 各 store 的 loadFromStorage 之间无跨 store 依赖（函数体内无 useXxxStore 引用，已核实），
    // 由串行 await 改为并行，把 5 段等待压缩为 1 段（取最慢项）。
    await Promise.all([
      characterStore.loadFromStorage().catch((err) => {
        logger.error('Storage', '从存储加载角色失败', err);
      }),
      // W3 新增：加载世界书与群聊
      lorebookStore.loadFromStorage().catch((err) => {
        logger.error('Storage', '从存储加载世界书失败', err);
      }),
      groupChatStore.loadFromStorage().catch((err) => {
        logger.error('Storage', '从存储加载群聊失败', err);
      }),
      // 迭代26 新增：加载数据银行文档 (F09)
      dataBankStore.loadFromStorage().catch((err) => {
        logger.error('Storage', '从存储加载数据银行文档失败', err);
      }),
      // 迭代31 新增：加载故事引擎数据 (F16)
      storyStore.loadFromStorage().catch((err) => {
        logger.error('Storage', '从存储加载故事失败', err);
      }),
      // E19：版本快照此前只在「版本管理」页挂载时加载 ⇒ 离开那一页就没有任何地方
      // 知道"哪些角色已被跟踪"，角色卡上的标记也就无从判断。启动即加载一次。
      versionStore.loadFromDisk().catch((err) => {
        logger.error('Storage', '加载角色版本快照失败', err);
      }),
    ]);

    // D-Q（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.7.2）：启动时把最近一段会话接回聊天区。
    // 会话索引原本只在 CharacterList 挂载时加载，而那次挂载早于这里注入适配器，
    // 只有"角色数量恰好变化"才会被 watch 二次触发——不能把用户的历史建立在这个巧合上。
    await chatStore.loadAllSessions(characterStore.characters.map((c) => c.id));
    await chatStore.restoreLatestSession(characterStore.currentCharacter ?? null);
  } catch (err) {
    logger.error('Storage', '存储适配器初始化失败', err);
  }

  // 注入默认 API Profile（来自 settings store，空时跳过）
  // per-role 模型绑定：优先应用当前角色绑定的 profile，否则跟随全局激活 Profile
  // AC20 安全：activeProfile 内部已含解锁判断，未解锁时返回 null
  const initialProfile = activeProfile.value;
  if (initialProfile) {
    chatStore.setApiProfile(initialProfile);
  }

  // P2-7 新手引导: 首次启动(未标记完成)且未在解锁流程时, 展示核心功能指引
  if (shouldShowOnboarding() && !mpModalVisible.value) {
    onboardingOpen.value = true;
  }

  // 性能可观测性：存储初始化完成标记，供 scripts/measure-startup.mjs 量化启动时延（无 UI 副作用）
  document.documentElement.dataset.appReady = '1';
});

// AC20 主密码弹窗：解锁成功后注入 API Profile（同样遵循 per-role 绑定）
function handleMasterPasswordSuccess() {
  const profile = activeProfile.value;
  if (profile) {
    chatStore.setApiProfile(profile);
  }
}

// 统一响应式注入：角色切换 / 解锁 / Profile 编辑 任一变化都会重算 activeProfile 并重新应用，
// 保证「显示=发送」一致（替代原先只监听 currentCharacterId 的 watch）
watch(activeProfile, (profile) => {
  if (profile) {
    chatStore.setApiProfile(profile);
  }
});
</script>

<template>
  <!-- Skip link：键盘用户可跳过导航直达主内容（WCAG 2.4.1） -->
  <a href="#main-content" class="skip-link">{{ t('app.skipToContent') }}</a>
  <div class="app-shell">
    <!-- 候选5：桌面版未实现功能提示（role=alert 供读屏即时播报） -->
    <div v-if="platformNotice" role="alert" class="platform-notice">
      <span>{{ platformNotice }}</span>
      <button type="button" class="notice-dismiss" :aria-label="t('app.closeNotice')" @click="dismissPlatformNotice">
        ×
      </button>
    </div>
    <!-- T-15: 断网提示条 -->
    <div v-if="!isOnline" role="alert" class="platform-notice offline-notice">
      <span>{{ t('app.offlineNotice') }}</span>
    </div>
    <!-- T-15: 拖拽导入覆盖层 -->
    <div v-if="isDragging" class="drag-overlay" aria-hidden="true">
      <div class="drag-overlay-box">
        <p class="drag-overlay-title">{{ t('app.dragDropTitle') }}</p>
        <p class="drag-overlay-hint">{{ t('app.dragDropHint') }}</p>
      </div>
    </div>
    <!-- 全局左侧导航栏（所有页面共享） -->
    <NavRail v-if="!isMobile" class="nav-rail-desktop" />
    <!-- 主内容区：由各视图自行渲染（含三栏布局等） -->
    <!-- 移动端主 Tab 页加 has-mobile-nav,内容底部留白避开底部导航 -->
    <main class="app-main" :class="{ 'has-mobile-nav': showBottomNav }">
      <router-view />
    </main>
    <!-- 移动端底部导航（≤640px 显示,主 Tab 页；断点口径以 src/core/viewport.ts 为唯一来源） -->
    <BottomNav v-if="showBottomNav" class="app-bottom-nav" />

    <!-- L 层深链的统一回头路：带 ?from= 进来就能一键回去（设置页用自己的那枚） -->
    <button
      v-if="showSourceReturn"
      type="button"
      class="source-return"
      data-rel-jump="source-return"
      :aria-label="t('settings.backFrom')"
      @click="backFromQuery"
    >
      <Icon name="arrow-left" :size="14" aria-hidden="true" />
      <span>{{ t('settings.backFrom') }}</span>
    </button>

    <!-- 全局 Toast 显示容器（第三轮优化项 8 S1：队列逐条显示，见 src/utils/toast-service.ts） -->
    <Toast
      :model-value="activeToast !== null"
      :type="activeToast?.type ?? 'info'"
      :message="activeToast?.message ?? ''"
      @update:model-value="dismissToast"
    />
  </div>

  <!-- AC20 主密码弹窗（启动时若需解锁则显示） -->
  <MasterPasswordModal
    v-model="mpModalVisible"
    :mode="mpModalMode"
    :dismissible="false"
    @success="handleMasterPasswordSuccess"
  />

  <!-- P2-7 新手引导（首次启动展示，完成后 localStorage 标记） -->
  <OnboardingModal v-model="onboardingOpen" />
</template>

