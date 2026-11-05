/**
 * 资料库文档的 scope 归属判定（B5：原先在两个存储适配器里各写一份）
 *
 * 这里单独测的原因：这条规则决定"角色级/聊天级资料会不会被拼进上下文"，
 * 双后端各写一份时，一份改了另一份不会红——契约测试只在两端都跑了
 * scope 过滤那一条时才有效，改的那端绿、没改的那端也绿，drift 就藏住了。
 */
import { describe, expect, it } from 'vitest';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import { documentMatchesScope } from '@core/data-bank';

function doc(overrides: Partial<DataBankDocument>): DataBankDocument {
  return { id: 'd', name: 'n', scope: 'global', chunks: [], ...overrides } as DataBankDocument;
}

describe('documentMatchesScope', () => {
  it('全局文档在任何 scope 查询里都命中', () => {
    const g = doc({ scope: 'global' });
    expect(documentMatchesScope(g, 'character', 'char-1', 'chat-1')).toBe(true);
    expect(documentMatchesScope(g, 'chat', 'char-1', 'chat-1')).toBe(true);
    // 连 id 都不给也照样命中：全局的包含规则不看 id
    expect(documentMatchesScope(g, 'character')).toBe(true);
  });

  it('角色级文档只在 characterId 相等时命中', () => {
    const c = doc({ scope: 'character', characterId: 'char-1' });
    expect(documentMatchesScope(c, 'character', 'char-1')).toBe(true);
    expect(documentMatchesScope(c, 'character', 'char-2')).toBe(false);
  });

  it('角色级文档不参与聊天级查询，聊天级文档不参与角色级查询', () => {
    const c = doc({ scope: 'character', characterId: 'char-1' });
    const t = doc({ scope: 'chat', chatId: 'chat-1' });
    expect(documentMatchesScope(c, 'chat', 'char-1', 'chat-1')).toBe(false);
    expect(documentMatchesScope(t, 'character', 'char-1', 'chat-1')).toBe(false);
  });

  it('聊天级文档只在 chatId 相等时命中', () => {
    const t = doc({ scope: 'chat', chatId: 'chat-1' });
    expect(documentMatchesScope(t, 'chat', undefined, 'chat-1')).toBe(true);
    expect(documentMatchesScope(t, 'chat', undefined, 'chat-2')).toBe(false);
  });

  it('保留原实现的一个既有行为：两边 id 都缺省时算命中', () => {
    // 这是搬迁前两份实现都有的语义（undefined === undefined）。
    // 本条只做"别在精简批次里顺手改行为"的看守；若要改成不命中，属于行为修复，
    // 要另开批次并同步两端与上下文装配。
    expect(documentMatchesScope(doc({ scope: 'character' }), 'character')).toBe(true);
    expect(documentMatchesScope(doc({ scope: 'chat' }), 'chat')).toBe(true);
  });

  it('不认识的 scope 取值一律不命中（除了全局）', () => {
    const weird = doc({ scope: 'character', characterId: 'char-1' });
    expect(documentMatchesScope(weird, 'workspace' as DataBankScope, 'char-1')).toBe(false);
  });
});
