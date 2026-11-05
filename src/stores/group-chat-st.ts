/**
 * 群聊 store · SillyTavern 群聊格式互导（T-07，R4-6 自 stores/group-chat.ts 切出）
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import { saveBlob, describeSaveResult } from '@/utils/save-blob';
import { exportGroupChatToStJson, importGroupChatFromSt } from '@/core/st-compat';
import type { GroupChat } from '@/core/group-chat';

export interface GroupStDeps {
  groups: Ref<GroupChat[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistGroup: (id: string) => Promise<void>;
}

export function createGroupStOps(deps: GroupStDeps) {
  const {
    groups,
    lastError,
    lastInfo,
    persistGroup,
  } = deps;

  /** 导出群聊为 ST 格式 JSON 文本 */
  function exportGroupToStJson(groupId: string): string | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) {
      lastError.value = t('group.notFound');
      return null;
    }
    return exportGroupChatToStJson(g);
  }

  /**
   * 导出 ST 格式群聊 JSON 给用户存盘
   *
   * @returns true 表示真的存下了；false = 找不到 / 用户在系统保存面板取消（都不得报"已导出"）
   */
  async function downloadGroupSt(groupId: string): Promise<boolean> {
    const json = exportGroupToStJson(groupId);
    if (json === null) return false;
    const g = groups.value.find((x) => x.id === groupId);
    const safeName = (g?.name ?? 'group').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const outcome = await saveBlob(t('group.stExportName', { name: safeName }), () =>
      new Blob([json], { type: 'application/json' })
    );
    const saved = describeSaveResult(outcome);
    if (!saved) return false;
    lastInfo.value = saved.message;
    return true;
  }

  /**
   * 从 ST 格式 JSON 文件导入群聊
   * 成员角色须存在于本地（knownCharacterIds 由调用方传入，缺失的成员跳过）
   */
  async function importGroupFromStFile(
    file: File,
    knownCharacterIds: string[],
    options?: { force?: boolean }
  ): Promise<string | null> {
    lastError.value = null;
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const chat = importGroupChatFromSt(json);
      // 校验成员角色存在
      const known = new Set(knownCharacterIds);
      const missing: string[] = [];
      const validMembers = chat.members.filter((m) => {
        const exists = known.has(m.characterId);
        if (!exists) missing.push(m.characterId);
        return exists;
      });
      if (validMembers.length < 2) {
        lastError.value = t('group.importNeedMembers2', { missing: missing.join('、') || t('lb.unnamed') });
        return null;
      }
      chat.members = validMembers;
      // O-23：同 id 已存在时默认拒绝静默覆盖——调用方确认（force）后才覆盖
      const existingIdx = groups.value.findIndex((g) => g.id === chat.id);
      if (existingIdx >= 0 && !options?.force) {
        lastError.value = t('group.importDuplicate', { name: chat.name });
        return null;
      }
      // 群聊消息中引用缺失角色的消息保留（仍可读）
      if (existingIdx >= 0) groups.value.splice(existingIdx, 1, chat);
      else groups.value.push(chat);
      await persistGroup(chat.id);
      lastInfo.value =
        t('group.imported3', { name: chat.name, members: validMembers.length, msgs: chat.messages.length, skipped: '' }) +
        (missing.length > 0 ? t('group.importSkipped', { count: missing.length }) : '');
      return chat.id;
    } catch (err) {
      lastError.value = t('group.importFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  return {
    exportGroupToStJson,
    downloadGroupSt,
    importGroupFromStFile,
  };
}
