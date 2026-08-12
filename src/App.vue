<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { useGroupChatStore } from '@/stores/group-chat';
import { usePersonaStore } from '@/stores/persona';
import { useDataBankStore } from '@/stores/data-bank';
import { useStoryStore } from '@/stores/story';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterVersionStore } from '@/stores/character-version';
import { getStorageAdapter, getStorageEnv } from '@storage/storage-factory';
import { TauriFSAdapter } from '@storage/tauri-fs-adapter';
import { importCharacterPng } from '@/services/backup-service';
import { cardToUiChar } from '@/services/type-adapters';
import NavRail from '@/components/layout/NavRail.vue';
import MasterPasswordModal from '@/components/common/MasterPasswordModal.vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';

const settings = useSettingsStore();
const chatStore = useChatStore();
const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();
const groupChatStore = useGroupChatStore();
const personaStore = usePersonaStore();
const dataBankStore = useDataBankStore();
const storyStore = useStoryStore();
const communityMarketStore = useCommunityMarketStore();
const characterVersionStore = useCharacterVersionStore();

// AC20 主密码弹窗状态
const mpModalVisible = ref(false);
const mpModalMode = ref<MasterPasswordMode>('unlock');

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
            ui.name = `${ui.name} (拖入)`;
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
      ? `已通过拖拽导入 ${imported} 个文件`
      : '拖拽导入失败:仅支持角色卡 JSON/PNG 与世界书 JSON';
}

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('drop', onDrop);
});

onMounted(async () => {
  // T-15: 断网监听与全局拖拽监听
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  // 通过工厂方法获取存储适配器
  // - Tauri 环境 → TauriFSAdapter（本地文件系统）
  // - 浏览器环境 → IndexedDBAdapter（IndexedDB）
  try {
    const adapter = getStorageAdapter();
    await adapter.init();
    chatStore.setStorageAdapter(adapter);
    characterStore.setStorageAdapter(adapter);
    settings.setStorageAdapter(adapter);
    // W3 新增：世界书与群聊 store 注入适配器
    lorebookStore.setStorageAdapter(adapter);
    groupChatStore.setStorageAdapter(adapter);
    // 迭代22 新增：Persona store 注入适配器
    personaStore.setStorageAdapter(adapter);
    // 迭代26 新增：DataBank store 注入适配器 (F09)
    dataBankStore.setStorageAdapter(adapter);
    // 迭代31 新增：Story store 注入适配器 (F16)
    storyStore.setStorageAdapter(adapter);
    // 迭代33 新增：社区市场 / 角色版本 store 注入适配器（快照持久化）
    communityMarketStore.setStorageAdapter(adapter);
    characterVersionStore.setStorageAdapter(adapter);

    // 控制台输出当前环境（便于诊断）
    // eslint-disable-next-line no-console
    console.info(`[Storage] 当前环境: ${getStorageEnv()}`);

    // 候选5：Tauri 环境提示未实现能力，避免功能静默不可用
    if (TauriFSAdapter.isTauriEnv()) {
      const missing = TauriFSAdapter.getUnimplementedFeatureNames();
      if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[Storage] 桌面版暂不支持：${missing.join('、')}`);
        platformNotice.value = `当前桌面版暂不支持：${missing.join('、')}，相关功能将在后续版本提供`;
      }
    }

    // 先加载设置（设置中包含主题与字号），再加载角色
    await settings.loadFromStorage().catch((err) => {
      console.error('从存储加载设置失败：', err);
    });
    // 应用初始主题与字号（loadFromStorage 内部已应用，这里冗余以确保生效）
    settings.setTheme(settings.theme);
    settings.setFontSize(settings.fontSize);

    // AC20 安全：主密码仅存运行时内存，刷新后需重新解锁
    // hasMasterPassword=true → 显示解锁 Modal
    const autoUnlocked = await settings.restoreSession().catch((err) => {
      console.error('恢复主密码会话失败：', err);
      return false;
    });
    if (!autoUnlocked && settings.hasMasterPassword) {
      // 需要手动解锁
      mpModalMode.value = 'unlock';
      mpModalVisible.value = true;
    }

    // 从存储加载角色卡（chat store 按角色懒加载历史）
    await characterStore.loadFromStorage().catch((err) => {
      console.error('从存储加载角色失败：', err);
    });

    // W3 新增：加载世界书与群聊
    await lorebookStore.loadFromStorage().catch((err) => {
      console.error('从存储加载世界书失败：', err);
    });
    await groupChatStore.loadFromStorage().catch((err) => {
      console.error('从存储加载群聊失败：', err);
    });

    // 迭代22 新增：加载 Persona（首次启动会自动创建默认 User）
    await personaStore.loadFromStorage().catch((err) => {
      console.error('从存储加载 Persona 失败：', err);
    });

    // 迭代26 新增：加载数据银行文档 (F09)
    await dataBankStore.loadFromStorage().catch((err) => {
      console.error('从存储加载数据银行文档失败：', err);
    });

    // 迭代31 新增：加载故事引擎数据 (F16)
    await storyStore.loadFromStorage().catch((err) => {
      console.error('从存储加载故事失败：', err);
    });
  } catch (err) {
    console.error('存储适配器初始化失败：', err);
  }

  // 注入默认 API Profile（来自 settings store，空时跳过）
  // AC20 安全：仅在已解锁（或未设置主密码）时注入，避免注入加密的 apiKey
  if (settings.isUnlocked || !settings.hasMasterPassword) {
    const activeProfile = settings.activeProfile;
    if (activeProfile) {
      chatStore.setApiProfile(activeProfile);
    }
  }
});

// AC20 主密码弹窗：解锁成功后注入 API Profile
function handleMasterPasswordSuccess() {
  const activeProfile = settings.activeProfile;
  if (activeProfile) {
    chatStore.setApiProfile(activeProfile);
  }
}
</script>

<template>
  <!-- Skip link：键盘用户可跳过导航直达主内容（WCAG 2.4.1） -->
  <a href="#main-content" class="skip-link">跳到主内容</a>
  <div class="app-shell">
    <!-- 候选5：桌面版未实现功能提示（role=alert 供读屏即时播报） -->
    <div v-if="platformNotice" role="alert" class="platform-notice">
      <span>{{ platformNotice }}</span>
      <button type="button" class="notice-dismiss" aria-label="关闭提示" @click="dismissPlatformNotice">
        ×
      </button>
    </div>
    <!-- T-15: 断网提示条 -->
    <div v-if="!isOnline" role="alert" class="platform-notice offline-notice">
      <span>网络已断开:远程模型调用将不可用,本地模型不受影响</span>
    </div>
    <!-- T-15: 拖拽导入覆盖层 -->
    <div v-if="isDragging" class="drag-overlay" aria-hidden="true">
      <div class="drag-overlay-box">
        <p class="drag-overlay-title">释放以导入</p>
        <p class="drag-overlay-hint">支持角色卡 JSON/PNG 与世界书 JSON</p>
      </div>
    </div>
    <!-- 全局左侧导航栏（所有页面共享） -->
    <NavRail />
    <!-- 主内容区：由各视图自行渲染（含三栏布局等） -->
    <main class="app-main">
      <router-view />
    </main>
  </div>

  <!-- AC20 主密码弹窗（启动时若需解锁则显示） -->
  <MasterPasswordModal
    v-model="mpModalVisible"
    :mode="mpModalMode"
    :dismissible="false"
    @success="handleMasterPasswordSuccess"
  />
</template>

<style>
/* Skip link：默认隐藏，获得焦点时显示 */
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 9999;
  padding: 8px 14px;
  background: var(--secondary);
  color: var(--on-accent);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transform: translateY(-150%);
  transition: transform .15s ease;
}

.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* 候选5：桌面版未实现功能提示横幅 */
.platform-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--warning-bg, #3a2f1e);
  color: var(--warning-fg, #f0c674);
  border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  font-size: 13px;
}

.platform-notice .notice-dismiss {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  flex-shrink: 0;
}

/* T-15: 断网提示条(复用提示条样式,换色) */
.offline-notice {
  background: color-mix(in srgb, var(--warning, #e0af68) 15%, var(--card));
  border-color: color-mix(in srgb, var(--warning, #e0af68) 40%, transparent);
}

.offline-notice .notice-dismiss {
  display: none;
}

/* T-15: 拖拽导入覆盖层 */
.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  border: 3px dashed var(--accent-blue);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-overlay-box {
  padding: 24px 48px;
  border-radius: 16px;
  background: var(--card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  text-align: center;
}

.drag-overlay-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-blue);
}

.drag-overlay-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.notice-dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.notice-dismiss:hover,
.notice-dismiss:focus-visible {
  background: color-mix(in srgb, currentColor 15%, transparent);
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
