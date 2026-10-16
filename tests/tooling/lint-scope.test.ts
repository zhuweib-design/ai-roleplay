/**
 * lint 范围守卫（M15-b）
 *
 * 起因是一条现场事实：并行会话往 `docs/design/ai-chat-ui-redesign/` 放了静态原型，
 * 自带 9 个演示用 js/mjs。`npm run lint` 是 `eslint .`，于是仓库里凭空多 23 条
 * `no-undef`/未用变量——不是谁的代码坏了，是**原型被当成产品源码在扫**。
 * 实测对照：`eslint .` 扫到 414 个文件，其中 11 个来自 docs，且报错的 5 个全在 docs。
 *
 * 但"把 docs 排掉"本身有个坏味道：万一哪天有人把真的产品脚本写进 docs/，它就永远
 * 不会被 lint 了。所以这里两边都钉住：
 * 1. docs 下的路径确实被忽略（用 ESLint 自己的判定，不是读字符串）；
 * 2. docs 下不允许出现**被 git 跟踪的** js/mjs/ts/vue —— 一旦出现这条就红，
 *    逼一次"这段代码是不是产品代码"的判断（是就挪进 src/scripts，别靠 lint 看不见）。
 *
 * 2026-10-16 走到了第三个分支：`ai-chat-ui-redesign/` 那套静态原型作为设计交付物入库
 * （12 个主题 × HTML/CSS/JS + 页面生成工具），它确实不是产品代码，也不该被产品门禁扫，
 * 但红着不放也不是答案。所以判断改成**显式登记**：登记一次、写清为什么，登记之外的
 * docs 源码照样让这条用例红。登记项本身还有牙齿——目录里已经没有源码时它会报错，
 * 免得名单只增不减地烂在那儿。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';

const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|vue)$/;

/** 显式登记的"设计交付物，不是产品代码"目录；键是路径前缀，值是判断依据。 */
const DECLARED_PROTOTYPE_DIRS: Record<string, string> = {
  'docs/design/ai-chat-ui-redesign/':
    '12 套主题的静态原型：演示用 js 与生成原型页面的工具脚本。改产品界面不经过这里（2026-10-16 随 v1.1.1 收口登记）',
};

/**
 * 探针在**模块加载阶段**求值，而不是写在用例体内。
 *
 * 第一次 `isPathIgnored` 会把 eslint.config.js 连同三个插件一起装起来：这份成本隔离跑
 * 只有 1.2s，全量并发下却撞破 5s 默认超时——和 M15-c 里 snapshot-restore 那条同一形状
 * （成本被记进用例计时，不等于用例自己的逻辑变慢）。断言的仍是真实判定结果，没放宽超时。
 */
const PROBE_PATHS = [
  'docs/design/whatever-probe/probe.js',
  'docs/design/ai-chat-ui-redesign/js/panel-toggle.js',
  'src/main.ts',
  'tests/tooling/lint-scope.test.ts',
  'scripts/eval-run.mjs',
];
const eslint = new ESLint({ cwd: process.cwd() });
// 探针路径不需要真实存在，isPathIgnored 只做配置匹配
const ignored = Object.fromEntries(
  await Promise.all(PROBE_PATHS.map(async (p) => [p, await eslint.isPathIgnored(p)]))
);

describe('lint 作用域', () => {
  it('docs 下的文件被 ESLint 判为忽略，产品目录没有', () => {
    expect(ignored['docs/design/whatever-probe/probe.js'], 'docs 原型没被忽略').toBe(true);
    expect(ignored['docs/design/ai-chat-ui-redesign/js/panel-toggle.js']).toBe(true);
    expect(ignored['src/main.ts'], 'src 被误忽略').toBe(false);
    expect(ignored['tests/tooling/lint-scope.test.ts'], 'tests 被误忽略').toBe(false);
    expect(ignored['scripts/eval-run.mjs'], 'scripts 被误忽略').toBe(false);
  });

  it('docs 下没有被 git 跟踪的源码文件（除显式登记的设计原型目录）', () => {
    const tracked = execFileSync('git', ['ls-files', 'docs'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((p) => SOURCE_EXT.test(p));
    const isDeclared = (p: string) =>
      Object.keys(DECLARED_PROTOTYPE_DIRS).some((prefix) => p.startsWith(prefix));
    const offenders = tracked.filter((p) => !isDeclared(p));

    expect(
      offenders,
      `docs/ 下出现了未登记的被跟踪源码：${offenders.join(', ')}。它现在不会被 lint——` +
        '要么挪进 src/scripts，要么在这里登记"这是设计交付物、判断依据是什么"'
    ).toEqual([]);
  });

  it('每条登记都还要有用：登记的目录里确实有被跟踪的源码', () => {
    const tracked = execFileSync('git', ['ls-files', 'docs'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter((p) => SOURCE_EXT.test(p));

    for (const [prefix, why] of Object.entries(DECLARED_PROTOTYPE_DIRS)) {
      expect(
        tracked.some((p) => p.startsWith(prefix)),
        `登记项 ${prefix} 已经指不到任何源码（依据当初写的是"${why}"），名单该删掉这条，别留着烂掉`
      ).toBe(true);
    }
  });
});
