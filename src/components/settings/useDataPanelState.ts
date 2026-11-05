import { ref } from 'vue';
import type { ImportResult } from '@/services/backup-service';

/**
 * R3-2：数据面板三处「操作 → 弹窗」的共享状态。
 *
 * 备份导入的触发点在日常段（备份区块），审计日志查看 / 清空确认的触发点在高级段，
 * 而四扇弹窗统一由 SettingsDataModals 渲染。用模块级单例而不是 props/emit：
 * 与 `utils/master-password-modal-state.ts` 同一模式——为两个布尔量在宿主拉一层
 * 中转 ref + 四组 v-model 接线，只会把宿主重新撑起来。
 */
export const importResultModalOpen = ref(false);
export const lastImportResult = ref<ImportResult | null>(null);
export const auditModalOpen = ref(false);
export const auditClearConfirmOpen = ref(false);
