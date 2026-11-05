/**
 * 原生 title 的守卫（§七 #14 的"结案断言"）
 *
 * 设计文档原来写的是"71 处 title= 待迁移"。实测口径先纠正：
 * src 下所有 .vue 文件里 `:title=` 共 75 处，其中 42 处是 `<Modal :title>` 的对话框标题
 * （不是 HTML tooltip，本来就该留），真正的原生 title 是 **33 处**。
 *
 * 这 33 处现在按三类处置：
 * - 29 处改 `v-tip`（宿主是按钮/链接/标签，或可聚焦的说明位）；
 * - 1 处改 `:aria-label`（世界书树的层级徽标：树可达数百行，每行挂一个气泡节点不划算）；
 * - 2 处保留原生 title 并在下方 allowlist 里写明原因（不可控行数的列表 + 已有可见文字兜底）。
 *
 * 断言方式：任何**交互元素**上的 `title=` 直接失败；非交互元素上的 title 必须在白名单里。
 * 这样"71 处待办"变成一个会咬人的检查，而不是文档里一句永远清不掉的话。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// jsdom 环境里 import.meta.url 不是 file: URL，用 cwd 解析（vitest 固定在仓库根运行，
// 下面还有 files.length > 100 的守卫兜住跑错目录的情况）
const SRC = resolve(process.cwd(), 'src');

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...vueFiles(full));
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

/** 向上找最近的开始标签，判断 title 挂在什么元素上 */
function hostTag(lines: string[], index: number): string | null {
  for (let j = index; j >= Math.max(0, index - 12); j -= 1) {
    const line = lines[j];
    if (line === undefined) continue;
    const m = /<([A-Za-z][\w.-]*)/.exec(line);
    if (m) return m[1] ?? null;
  }
  return null;
}

/** 迁移后仍保留原生 title 的确切处数（见下面的 allowlist 与逐条原因） */
const EXPECTED_NATIVE_LEFT = 1;

const INTERACTIVE = new Set(['button', 'a', 'router-link', 'label', 'input', 'select', 'textarea']);

/**
 * 允许保留原生 title 的站点（file:line 前缀 + 原因）。
 * 加一条就要在注释里写清为什么，否则一律改 v-tip。
 */
const ALLOWED_NON_INTERACTIVE: Record<string, string> = {
  // 世界书条目树与基准历史都是行数不可控的列表：每行一个气泡节点不划算，
  // 且两处的关键信息（层级首字母 / 耗时毫秒）本身就有可见文字。
  'src/views/LocalModelBenchmarkPanel.vue': '基准历史芯片，嵌套 v-for 行数不可控',
};

describe('原生 title 守卫', () => {
  const files = vueFiles(SRC);
  // 路径解析坏掉时 readdirSync 会抛，这里再钉一次：扫不到文件就让守卫失败，
  // 避免「0 命中」被当成「0 违规」通过（假绿比红更危险）。
  expect(files.length).toBeGreaterThan(50); // src 下现有 59 个 .vue

  const interactiveHits: string[] = [];
  const unexpectedHits: string[] = [];
  let modalProps = 0;
  let nativeTotal = 0;

  for (const file of files) {
    const rel = file.replace(SRC, 'src').replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      if (!/[:]?title=/.test(line) || /^\s*(\*|\/\/)/.test(line)) return;
      if (!/(:title=|\stitle=)/.test(line)) return;
      const tag = hostTag(lines, i);
      if (tag === 'Modal' || tag === 'modal') {
        modalProps += 1;
        return;
      }
      nativeTotal += 1;
      if (tag && INTERACTIVE.has(tag.toLowerCase())) {
        interactiveHits.push(`${rel}:${i + 1} <${tag}> ${line.trim().slice(0, 60)}`);
      } else if (!ALLOWED_NON_INTERACTIVE[rel]) {
        unexpectedHits.push(`${rel}:${i + 1} <${tag}> ${line.trim().slice(0, 60)}`);
      }
    });
  }

  it('交互元素上不再出现原生 title（键盘与触屏拿不到）', () => {
    expect(interactiveHits, `这些 title 应改为 v-tip：\n${interactiveHits.join('\n')}`).toEqual([]);
  });

  it('非交互元素上的原生 title 只在白名单内', () => {
    expect(unexpectedHits, `不在白名单里的原生 title：\n${unexpectedHits.join('\n')}`).toEqual([]);
  });

  it('口径可核对：Modal 对话框标题与原生 title 分开计数', () => {
    // 42 处 <Modal :title> 是对话框标题，不属于迁移范围
    expect(modalProps).toBeGreaterThan(30);
    // 原生 title 只剩白名单那几处（迁移前是 33）
    // 迁移前 33；现在只剩白名单里的这几处（写死具体数字，多一处少一处都会红）
    expect(nativeTotal).toBe(EXPECTED_NATIVE_LEFT);
  });
});
