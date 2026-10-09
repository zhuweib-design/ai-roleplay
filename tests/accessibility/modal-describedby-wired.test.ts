/**
 * `described-by` 必须指得到对话框内部真实存在的 id（M8-c）
 *
 * `Modal` 的 `describedBy` 是**跨组件的裸字符串引用**：写错一个字母、或者把那段
 * 说明改名/删掉，界面上完全没反应——读屏只是安静地少念一句，肉眼和构建都发现不了。
 * 所以这里做静态守卫，src 下每个 `described-by="a b"` 的每个 token 都要满足：
 * 全应用有定义、定义唯一、定义落在同一个 `<Modal>` 块内、引用挂在 `<Modal>` 标签上。
 *
 * 同时钉一条下限：接上这条关系的弹窗数量不得倒退（曾经只有群聊两个）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...vueFiles(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

interface Ref {
  file: string;
  /** 引用所在的标签名，用来确认挂的是 Modal */
  tag: string;
  id: string;
}

/**
 * 只认**静态**的 `described-by="..."`。
 *
 * `FormField` 的默认插槽往上抛的是 `:described-by="describedBy"`（动态绑定，作用域是
 * 单个控件的提示语），把它当成对话框级引文来校验会凭空造出一条悬空引用。所以前面
 * 带冒号的一律跳过。
 */
const STATIC_REF = /(?<!:)described-by="([^"]+)"/g;

const files = vueFiles('src');
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/** 全应用 `id="…"` 的出现位置（含同文件重复），用来判断引用是否会被别的节点抢走 */
const idDefs = new Map<string, string[]>();
for (const [file, s] of sources) {
  for (const m of s.matchAll(/(?<![:\w])id="([^"]+)"/g)) {
    const definedId = m[1] ?? '';
    const list = idDefs.get(definedId) ?? [];
    list.push(file);
    idDefs.set(definedId, list);
  }
}

const refs: Ref[] = [];
const dangling: Ref[] = [];
const nonModal: Ref[] = [];
const outsideModal: Ref[] = [];
const sharedId: Ref[] = [];

for (const [file, s] of sources) {
  for (const m of s.matchAll(STATIC_REF)) {
    // 引用所属标签：往前找最近的 '<'（属性列表中间不会出现 '>'，所以就是开标签本身）
    const open = s.lastIndexOf('<', m.index);
    const tag = open === -1 ? '' : (s.slice(open + 1).match(/^([\w.-]+)/)?.[1] ?? '');
    // 本 Modal 的范围：开标签 -> 紧随其后的 '</Modal>'（说明文字必须写在对话框里面）
    const close = s.indexOf('</Modal>', m.index);
    const ownBlock = s.slice(open, close === -1 ? s.length : close);
    for (const id of (m[1] ?? '').trim().split(/\s+/)) {
      const ref = { file, tag, id };
      refs.push(ref);
      const defined = idDefs.get(id) ?? [];
      if (defined.length === 0) dangling.push(ref);
      if (defined.length > 1) sharedId.push(ref);
      if (!ownBlock.includes(`id="${id}"`)) outsideModal.push(ref);
      if (tag !== 'Modal') nonModal.push(ref);
    }
  }
}

describe('Modal describedBy 的引用完整性', () => {
  it('接上对话框级说明的弹窗数量不倒退', () => {
    // M8-c 铺完之后是 20 处静态引用（23 条 id），分布在 13 个文件里，只许增不许减
    expect(refs.length, 'described-by 的引用数').toBeGreaterThanOrEqual(22);
    expect(new Set(refs.map((r) => r.file)).size, '接入的页面/组件数').toBeGreaterThanOrEqual(13);
  });

  it('每个 described-by 都指得到同一文件里真实存在的 id', () => {
    expect(
      dangling.map((d) => `${d.file} -> #${d.id}`),
      '存在悬空的 described-by 引用'
    ).toEqual([]);
  });

  it('引用点确实挂在 <Modal> 上（不是别的组件的同名属性）', () => {
    expect(
      [...new Set(nonModal.map((r) => `${r.file} <${r.tag} described-by=#${r.id}>`))],
      'described-by 只应出现在 <Modal> 上'
    ).toEqual([]);
  });

  it('说明文字写在对话框内部，不是同一文件里的别处', () => {
    // id 在同文件存在但落在 Modal 外面时，读屏根本看不到它（弹窗关闭状态下它可能压根没渲染）
    expect(
      outsideModal.map((r) => `${r.file} #${r.id}`),
      '有 described-by 指向本 Modal 之外的 id'
    ).toEqual([]);
  });

  it('被引用的 id 全应用只出现一次', () => {
    // id 重复时浏览器只认第一个，说明文字可能被另一个组件的节点抢走
    expect(
      sharedId.map((r) => `${r.file} #${r.id} -> ${(idDefs.get(r.id) ?? []).join(', ')}`),
      '有 described-by 指向重复定义的 id'
    ).toEqual([]);
  });
});
