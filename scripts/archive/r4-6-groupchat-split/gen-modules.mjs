/**
 * R4-6 生成器：group-chat.ts → 7 个功能域模块
 *
 * 铁律（DEV_PLAN §7.12 O-4 / O-11）：
 * 1. 基准只读归档副本，不读仓库源文件
 * 2. 切片越界 / 切空立即抛错
 * 3. 改写带出现次数断言
 * 4. 工厂体内保留原始 2 空格缩进
 * 5. 仓库 CRLF：内存归一 LF，写回 CRLF
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVE = 'scripts/archive/r4-6-groupchat-split/group-chat.orig.ts.txt';

function readLines(p) {
  const raw = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`断言失败: ${msg}`);
}

const A = readLines(ARCHIVE);
const TOTAL = A.length;
assert(TOTAL === 1077, `归档行数应为 1077，实际 ${TOTAL}`);

function seg(a, b) {
  assert(a >= 1 && b <= TOTAL && a <= b, `切片越界 ${a}-${b} / 共 ${TOTAL}`);
  const out = A.slice(a - 1, b);
  assert(out.length === b - a + 1, `切片长度不符 ${a}-${b}`);
  assert(out.some((l) => l.trim() !== ''), `切片为空 ${a}-${b}`);
  return out;
}

function assertFirst(a, expect) {
  assert(A[a - 1] === expect, `行 ${a} 应等于 ${JSON.stringify(expect)}，实际 ${JSON.stringify(A[a - 1])}`);
}

function assertLastIsClose(b) {
  assert(A[b - 1] === '  }', `行 ${b} 应是 '  }'，实际 ${JSON.stringify(A[b - 1])}`);
}

function writeCRLF(p, lines) {
  writeFileSync(p, lines.join('\r\n') + '\r\n', 'utf8');
}

function countTopFns(lines) {
  return lines.filter((l) => /^ {2}(async )?function /.test(l)).length;
}

// ── 边界逐字符核对 ──
assertFirst(118, '  function setStorageAdapter(adapter: StorageAdapter | null): void {');
assertLastIsClose(176);
assertFirst(180, '  /** 导出群聊为 ST 格式 JSON 文本 */');
assertLastIsClose(254);
assertFirst(258, '  function selectGroup(id: string): void {');
assertLastIsClose(395);
assertFirst(399, '  /**');
assertLastIsClose(642);
assertFirst(646, '  /**');
assertLastIsClose(782);
assertFirst(786, '  /**');
assertLastIsClose(882);
assertFirst(894, '  /**');
assertLastIsClose(1013);
assertFirst(1015, '  function clearLastError(): void {');
assertLastIsClose(1018);
assertFirst(1020, '  return {');
assertFirst(1076, '  };');

function buildModule({ header, imports, depsName, depsBody, factory, body, destructure, expose }) {
  const out = [];
  out.push('/**');
  for (const h of header) out.push(h === '' ? ' *' : ` * ${h}`);
  out.push(' */');
  for (const i of imports) out.push(i);
  out.push('');
  out.push(`export interface ${depsName} {`);
  for (const d of depsBody) out.push(`  ${d}`);
  out.push('}');
  out.push('');
  out.push(`export function ${factory}(deps: ${depsName}) {`);
  out.push('  const {');
  for (const r of destructure) out.push(`    ${r},`);
  out.push('  } = deps;');
  out.push('');
  out.push(...body);
  out.push('');
  out.push('  return {');
  for (const e of expose) out.push(`    ${e},`);
  out.push('  };');
  out.push('}');
  return out;
}

// ── 1. 持久化 ──
const persistBody = [
  '  // 注入的存储适配器',
  '  let storageAdapter: StorageAdapter | null = null;',
  '',
  '  // loadInFlight 保证并发调用只起一次读（loaded 由宿主持有，见 deps）',
  '  let loadInFlight: Promise<void> | null = null;',
  '',
  ...seg(118, 176),
  '',
  '  /** 供 NPC 工厂保存新建角色卡（适配器归本工厂所有，不再另存一份） */',
  '  function getStorageAdapter(): StorageAdapter | null {',
  '    return storageAdapter;',
  '  }',
];
const persistence = buildModule({
  header: [
    '群聊 store · 持久化（R4-6 自 stores/group-chat.ts 切出）',
    '',
    '工厂形态：storageAdapter / loadInFlight 是实例状态，封在闭包里，',
    '避免模块级单例被多个 store 实例共享（DEV_PLAN §7.12 O-11）。',
    '`loaded` 由宿主持有并传入（深链闸门与视图都要读它）。',
  ],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import type { StorageAdapter } from '@/storage/storage-adapter';",
    "import { mergeKeptLocal } from '@/core/store-merge';",
    "import type { GroupChat } from '@/core/group-chat';",
  ],
  depsName: 'GroupPersistenceDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'currentGroupId: Ref<string | null>;',
    'loaded: Ref<boolean>;',
    'lastError: Ref<string | null>;',
  ],
  factory: 'createGroupPersistenceOps',
  expose: ['setStorageAdapter', 'getStorageAdapter', 'loadFromStorage', 'ensureLoaded', 'persistGroup', 'deleteFromStorage'],
  body: persistBody,
  destructure: ['groups', 'currentGroupId', 'loaded', 'lastError'],
});
assert(countTopFns(seg(118, 176)) === 5, `持久化段应有 5 个 function，实际 ${countTopFns(seg(118, 176))}`);

// ── 2. ST 互导 ──
const st = buildModule({
  header: ['群聊 store · SillyTavern 群聊格式互导（T-07，R4-6 自 stores/group-chat.ts 切出）'],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import { saveBlob, describeSaveResult } from '@/utils/save-blob';",
    "import { exportGroupChatToStJson, importGroupChatFromSt } from '@/core/st-compat';",
    "import type { GroupChat } from '@/core/group-chat';",
  ],
  depsName: 'GroupStDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'lastError: Ref<string | null>;',
    'lastInfo: Ref<string | null>;',
    'persistGroup: (id: string) => Promise<void>;',
  ],
  factory: 'createGroupStOps',
  expose: ['exportGroupToStJson', 'downloadGroupSt', 'importGroupFromStFile'],
  body: seg(180, 254),
  destructure: ['groups', 'lastError', 'lastInfo', 'persistGroup'],
});
assert(countTopFns(seg(180, 254)) === 3, `ST 段应有 3 个 function`);

// ── 3. 群聊 CRUD ──
const crud = buildModule({
  header: [
    '群聊 store · 群聊 CRUD（R4-6 自 stores/group-chat.ts 切出）',
    '',
    '游标重置（resetTurnCursor）留在宿主：只碰分页 cursor 一个 ref，下放反多一层转发。',
  ],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import type { CharacterCard } from '@/core/character-card';",
    'import {',
    '  type GroupChat,',
    '  type GroupMember,',
    '  type GroupChatCreateInput,',
    '  validateGroupChatInput,',
    "} from '@/core/group-chat';",
  ],
  depsName: 'GroupCrudDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'currentGroupId: Ref<string | null>;',
    'lastError: Ref<string | null>;',
    'lastInfo: Ref<string | null>;',
    'persistGroup: (id: string) => Promise<void>;',
    'deleteFromStorage: (id: string) => Promise<void>;',
    'resetTurnCursor: () => void;',
  ],
  factory: 'createGroupCrudOps',
  expose: ['selectGroup', 'createGroup', 'updateGroup', 'deleteGroup'],
  body: seg(258, 395),
  destructure: [
    'groups',
    'currentGroupId',
    'lastError',
    'lastInfo',
    'persistGroup',
    'deleteFromStorage',
    'resetTurnCursor',
  ],
});
assert(countTopFns(seg(258, 395)) === 4, `CRUD 段应有 4 个 function`);

// ── 4. 成员 + 生命周期 ──
const members = buildModule({
  header: [
    '群聊 store · 成员动作与临时群聊生命周期（F10.4，R4-6 自 stores/group-chat.ts 切出）',
    '',
    '两块合在一个工厂：removeMember 直接调 archiveGroupInternal（最后一个临时 NPC 离开即自动归档），',
    '拆成两个工厂就要把内部函数暴露出去，反而更绕。',
  ],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import type { CharacterCard } from '@/core/character-card';",
    'import {',
    '  type GroupChat,',
    '  type GroupMember,',
    '  MAX_GROUP_MEMBERS,',
    '  MIN_GROUP_MEMBERS,',
    "} from '@/core/group-chat';",
  ],
  depsName: 'GroupMemberDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'lastError: Ref<string | null>;',
    'lastInfo: Ref<string | null>;',
    'persistGroup: (id: string) => Promise<void>;',
  ],
  factory: 'createGroupMemberOps',
  expose: ['addMember', 'removeMember', 'replaceMembers', 'archiveGroup', 'restoreGroup'],
  body: seg(399, 642),
  destructure: ['groups', 'lastError', 'lastInfo', 'persistGroup'],
});
assert(countTopFns(seg(399, 642)) === 6, `成员段应有 6 个 function`);

// ── 5. 发言顺序 + 远端回合合并 ──
const speaking = buildModule({
  header: [
    '群聊 store · 发言顺序控制（F10.2）与远端回合合并（R4-6 自 stores/group-chat.ts 切出）',
    '',
    '注意：pickNextSpeaker 内 `const t = m.talkativeness ?? 50` 是局部权重变量，与 i18n 的 t 同名。',
    '本模块**不 import i18n 的 t**，勿"顺手补上"造成遮蔽（TS2448 或静默取错值）。',
  ],
  imports: [
    "import type { Ref } from 'vue';",
    "import type { GroupChat, GroupMember } from '@/core/group-chat';",
  ],
  depsName: 'GroupSpeakingDeps',
  depsBody: ['groups: Ref<GroupChat[]>;', 'persistGroup: (id: string) => Promise<void>;'],
  factory: 'createGroupSpeakingOps',
  expose: ['pickNextSpeaker', 'designateSpeaker', 'clearDesignatedSpeaker', 'mergeRemoteTurns'],
  body: seg(646, 782),
  destructure: ['groups', 'persistGroup'],
});
assert(countTopFns(seg(646, 782)) === 4, `发言段应有 4 个 function`);

// ── 6. 消息动作 ──
const messages = buildModule({
  header: [
    '群聊 store · 消息动作（R4-6 自 stores/group-chat.ts 切出）',
    '',
    'setInput / setStreaming 只碰一个 ref，留在宿主（§7.12 O-11 "单 ref 薄方法不下放"）。',
  ],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import type { GroupChat, GroupChatMessage, GroupChatMode } from '@/core/group-chat';",
  ],
  depsName: 'GroupMessageDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'lastError: Ref<string | null>;',
    'persistGroup: (id: string) => Promise<void>;',
  ],
  factory: 'createGroupMessageOps',
  expose: ['addUserMessage', 'addAssistantMessage', 'updateAssistantMessage', 'updateLastAssistantMessage', 'setMode'],
  body: seg(786, 882),
  destructure: ['groups', 'lastError', 'persistGroup'],
});
assert(countTopFns(seg(786, 882)) === 5, `消息段应有 5 个 function`);

// ── 7. 随机 NPC 生成 ──
let npcText = seg(894, 1013).join('\n');
function replaceOnce(text, from, to, label) {
  const n = text.split(from).length - 1;
  assert(n === 1, `${label} 应出现 1 次，实际 ${n}`);
  return text.split(from).join(to);
}
npcText = replaceOnce(
  npcText,
  [
    '      // 通过 storageAdapter 保存（复用持久化逻辑）',
    '      if (storageAdapter) {',
    '        try {',
    '          await storageAdapter.saveCharacter(newCard);',
  ].join('\n'),
  [
    '      // 通过 store 的存储适配器保存（适配器由持久化工厂持有，此处取用）',
    '      const adapter = getStorageAdapter();',
    '      if (adapter) {',
    '        try {',
    '          await adapter.saveCharacter(newCard);',
  ].join('\n'),
  'NPC 保存段改写',
);
assert(!/storageAdapter/.test(npcText), 'NPC 段不应残留 storageAdapter 标识符');

const npcBody = npcText.split('\n');
assert(countTopFns(npcBody) === 1, `NPC 段应有 1 个 function，实际 ${countTopFns(npcBody)}`);

const npc = buildModule({
  header: [
    '群聊 store · 随机 NPC 生成（F10.3，R4-6 自 stores/group-chat.ts 切出）',
    '',
    '存储适配器由持久化工厂持有，这里通过 getStorageAdapter 取用，不在本模块再存一份。',
  ],
  imports: [
    "import { t } from '@/i18n';",
    "import type { Ref } from 'vue';",
    "import type { StorageAdapter } from '@/storage/storage-adapter';",
    "import type { CharacterCard } from '@/core/character-card';",
    "import { createApiClient } from '@/api';",
    "import { useSettingsStore } from './settings';",
    "import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';",
    "import type { CharacterTemplateId } from '@core/character-generator';",
    'import {',
    '  type NpcSceneContext,',
    '  buildNpcGenerationMessages,',
    '  parseGeneratedNpc,',
    '  generatedNpcToCard,',
    '  validateNpcParams,',
    "} from '@core/npc-generator';",
    "import { MAX_GROUP_MEMBERS, type GroupChat } from '@/core/group-chat';",
  ],
  depsName: 'GroupNpcDeps',
  depsBody: [
    'groups: Ref<GroupChat[]>;',
    'lastError: Ref<string | null>;',
    'lastInfo: Ref<string | null>;',
    'isGeneratingNpc: Ref<boolean>;',
    'getStorageAdapter: () => StorageAdapter | null;',
    'addMember: (groupId: string, character: CharacterCard) => boolean;',
  ],
  factory: 'createGroupNpcOps',
  expose: ['generateRandomNpc'],
  body: npcBody,
  destructure: [
    'groups',
    'lastError',
    'lastInfo',
    'isGeneratingNpc',
    'getStorageAdapter',
    'addMember',
  ],
});
assert(countTopFns(npcBody) === 1, 'NPC 段函数计数');

const modules = [
  ['src/stores/group-chat-persistence.ts', persistence],
  ['src/stores/group-chat-st.ts', st],
  ['src/stores/group-chat-crud.ts', crud],
  ['src/stores/group-chat-members.ts', members],
  ['src/stores/group-chat-speaking.ts', speaking],
  ['src/stores/group-chat-messages.ts', messages],
  ['src/stores/group-chat-npc.ts', npc],
];
for (const [p, lines] of modules) {
  // 只允许工厂本身一个 export function，动作函数必须封在工厂体内（§7.12 O-11）
  const exported = lines.filter((l) => /^export (async )?function /.test(l));
  assert(exported.length === 1, `${p} 应只有工厂一个 export function，实际 ${exported.length}`);
  assert(lines.length < 500, `${p} 超 500 行（${lines.length}）`);
  writeCRLF(p, lines);
  console.log(`写出 ${p} (${lines.length} 行)`);
}

// ── 宿主 ──
// 宿主保留状态：46-53 为各 ref；54-60 的 storageAdapter / loadInFlight 归持久化工厂，
// 但 `loaded` 视图与深链闸门都要读，留在宿主再传进去。
assert(A[51] === '  const isGeneratingNpc = ref(false);', `行 52 应为 isGeneratingNpc，实际 ${JSON.stringify(A[51])}`);
assert(A[52] === '', '行 53 应为空行');
assert(A[53] === '  // 注入的存储适配器', `行 54 应为存储适配器注释，实际 ${JSON.stringify(A[53])}`);
const stateAndComputed = [
  ...seg(46, 52),
  '  // 群列表的加载闸门（深链 `?group=` 要用，见 src/composables/useDeepLinkId.ts）：',
  '  // loaded = "读库已经跑完一次"；去重用的 loadInFlight 归持久化工厂。',
  '  const loaded = ref(false);',
  ...seg(62, 114),
];
assert(countTopFns(stateAndComputed) === 2, '宿主 state+computed 段应含 2 个 function（loadOlderTurns / resetTurnCursor）');
assert(!/let storageAdapter|let loadInFlight/.test(stateAndComputed.join('\n')), '宿主不应残留 storageAdapter / loadInFlight');

assert(A[31] === '/**', `行 32 应为 '/**'，实际 ${JSON.stringify(A[31])}`);
assert(A[44] === "export const useGroupChatStore = defineStore('groupChat', () => {", '行 45 应为 defineStore 开头');

const hostHead = [
  "import { defineStore } from 'pinia';",
  "import { ref, computed } from 'vue';",
  "import { createGroupPersistenceOps } from './group-chat-persistence';",
  "import { createGroupStOps } from './group-chat-st';",
  "import { createGroupCrudOps } from './group-chat-crud';",
  "import { createGroupMemberOps } from './group-chat-members';",
  "import { createGroupSpeakingOps } from './group-chat-speaking';",
  "import { createGroupMessageOps } from './group-chat-messages';",
  "import { createGroupNpcOps } from './group-chat-npc';",
  "import type { GroupChat } from '@/core/group-chat';",
  '',
  ...seg(32, 45),
];

const assembly = [
  '',
  '  // ── 功能域工厂（R4-6：每块自持实例状态，宿主只装配 + 转发） ──',
  '  const persistence = createGroupPersistenceOps({',
  '    groups,',
  '    currentGroupId,',
  '    loaded,',
  '    lastError,',
  '  });',
  '  const {',
  '    setStorageAdapter,',
  '    getStorageAdapter,',
  '    loadFromStorage,',
  '    ensureLoaded,',
  '    persistGroup,',
  '    deleteFromStorage,',
  '  } = persistence;',
  '',
  '  const { exportGroupToStJson, downloadGroupSt, importGroupFromStFile } = createGroupStOps({',
  '    groups,',
  '    lastError,',
  '    lastInfo,',
  '    persistGroup,',
  '  });',
  '',
  '  const { selectGroup, createGroup, updateGroup, deleteGroup } = createGroupCrudOps({',
  '    groups,',
  '    currentGroupId,',
  '    lastError,',
  '    lastInfo,',
  '    persistGroup,',
  '    deleteFromStorage,',
  '    resetTurnCursor,',
  '  });',
  '',
  '  const { addMember, removeMember, replaceMembers, archiveGroup, restoreGroup } =',
  '    createGroupMemberOps({ groups, lastError, lastInfo, persistGroup });',
  '',
  '  const { pickNextSpeaker, designateSpeaker, clearDesignatedSpeaker, mergeRemoteTurns } =',
  '    createGroupSpeakingOps({ groups, persistGroup });',
  '',
  '  const {',
  '    addUserMessage,',
  '    addAssistantMessage,',
  '    updateAssistantMessage,',
  '    updateLastAssistantMessage,',
  '    setMode,',
  '  } = createGroupMessageOps({ groups, lastError, persistGroup });',
  '',
  '  const { generateRandomNpc } = createGroupNpcOps({',
  '    groups,',
  '    lastError,',
  '    lastInfo,',
  '    isGeneratingNpc,',
  '    getStorageAdapter,',
  '    addMember,',
  '  });',
  '',
  '  // ── 单 ref 薄方法留宿主（§7.12 O-11：下放反多一层转发） ──',
  '',
  '  function setInput(text: string): void {',
  '    inputText.value = text;',
  '  }',
  '',
  '  function setStreaming(v: boolean): void {',
  '    isStreaming.value = v;',
  '  }',
  '',
];

const hostTail = [...seg(1015, 1076)];
assert(A[1075] === '  };', '行 1076 应为 return 块收尾');
assert(A[1076] === '});', '行 1077 应为 });');

const host = [...hostHead, ...stateAndComputed, ...assembly, ...hostTail, '});'];
assert(host.filter((l) => l === "export const useGroupChatStore = defineStore('groupChat', () => {").length === 1, '宿主应有且仅有一个 defineStore');
assert(!/let storageAdapter/.test(host.join('\n')), '宿主不应残留 storageAdapter 声明');
writeCRLF('src/stores/group-chat.ts', host);
console.log(`写出 src/stores/group-chat.ts (${host.length} 行)`);
