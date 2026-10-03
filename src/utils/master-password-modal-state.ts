/**
 * 主密码弹窗共享状态（第三轮优化项 8 · S5 拆分副产品）
 *
 * SettingsView 拆分后，安全分区（触发按钮）与数据分区（弹窗渲染 + 成功回调）
 * 分属两个组件，但共享同一个主密码弹窗实例。原单文件内的两个 ref 提升到此
 * 模块级共享，保证跨组件状态一致（OPEN 状态 / 模式由任一组件设置均生效）。
 */
import { ref } from 'vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';

/** 弹窗是否打开 */
export const mpModalOpen = ref(false);
/** 弹窗模式（setup = 首次设置 / unlock = 解锁 / change = 修改） */
export const mpModalMode = ref<MasterPasswordMode>('setup');
