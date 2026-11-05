/**
 * 角色库的测试夹具（2026-10-26 起角色库从空开始，不再有 mock 种子）
 *
 * 以前 store 的初值就是 4 个示例角色，很多用例直接 `selectCharacter('seraphina')`。
 * 现在打包与正式环境要求首次启动为空，那些用例必须自己造数据。本文件提供两种造法：
 * - `seedCharacter(store, overrides)`：直接往内存列表塞一条（不落盘，够单测用）
 * - `makeUiCharacter(overrides)`：只想要一个形状合法的 UICharacter
 *
 * 字段按 `UICharacter` 的必填项给全：编辑器会直接读 `temperature` 之类做 `toFixed`，
 * 少字段会在渲染期抛错，测试就变成在测"夹具缺字段"。
 */
import type { UICharacter } from '@/types';

export function makeUiCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'test-character',
    name: '测试角色',
    avatar: '',
    avatarType: 'image',
    gradientFrom: '',
    gradientTo: '',
    initial: '测',
    lastActive: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    favorite: false,
    tags: [],
    description: '夹具角色',
    personality: '',
    scenario: '',
    model: '',
    profileId: null,
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 0,
    temperature: 0.8,
    tokenBudget: { character: 2048, worldInfo: 2048, chatHistory: 3072, remaining: 1024 },
    ...overrides,
  } as UICharacter;
}

/** 往角色 store 的内存列表里塞一条并（可选）选中它 */
export function seedCharacter(
  store: { characters: UICharacter[]; currentCharacterId: string; selectCharacter?: (id: string) => void },
  overrides: Partial<UICharacter> = {},
  select = true
): UICharacter {
  const character = makeUiCharacter(overrides);
  if (!store.characters.some((c) => c.id === character.id)) store.characters.push(character);
  if (select) {
    store.currentCharacterId = character.id;
    store.selectCharacter?.(character.id);
  }
  return character;
}
