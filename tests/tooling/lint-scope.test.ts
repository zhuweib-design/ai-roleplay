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
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';

const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|vue)$/;

describe('lint 作用域', () => {
  it('docs 下的文件被 ESLint 判为忽略，产品目录没有', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    // 探针路径不需要真实存在，isPathIgnored 只做配置匹配
    expect(await eslint.isPathIgnored('docs/design/whatever-probe/probe.js'), 'docs 原型没被忽略').toBe(true);
    expect(await eslint.isPathIgnored('docs/design/ai-chat-ui-redesign/js/panel-toggle.js')).toBe(true);
    expect(await eslint.isPathIgnored('src/main.ts'), 'src 被误忽略').toBe(false);
    expect(await eslint.isPathIgnored('tests/tooling/lint-scope.test.ts'), 'tests 被误忽略').toBe(false);
    expect(await eslint.isPathIgnored('scripts/eval-run.mjs'), 'scripts 被误忽略').toBe(false);
  });

  it('docs 下没有被 git 跟踪的源码文件（忽略 docs 不会藏住产品代码）', () => {
    const tracked = execFileSync('git', ['ls-files', 'docs'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((p) => SOURCE_EXT.test(p));
    expect(
      tracked,
      `docs/ 下出现了被跟踪的源码：${tracked.join(', ')}。它现在不会被 lint——要么挪进 src/scripts，要么显式把它加回 lint 范围`
    ).toEqual([]);
  });
});
