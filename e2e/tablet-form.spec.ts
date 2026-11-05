/**
 * E2E · 平板档（641–1024）的形态定义（DEV_PLAN B4 / OPT_PLAN §2.3 待办 1）
 *
 * 判据（合并自两份文档）：
 *   **同一档内 NavRail 与底部导航只出现其一，且该档有明确的形态定义。**
 *
 * 定义：图标 rail（64px，无文字）+ 两侧栏抽屉化（默认收起）+ 无底部导航。
 *
 * 为什么要有这条：改之前 641–900 是图标 rail、901–1024 是**112px 全宽 rail**
 * 而两侧栏已经抽屉化——同一档里出现"半个桌面"，聊天列被无谓挤掉 48px。
 * 900 是横屏阈值，本来与形态切换无关。
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCharacter } from './helpers/seed-character';

/** 平板档两端的代表宽度：下边界附近与上边界附近，用来证明"整档一个形态" */
const TABLET_WIDTHS = [820, 1000];

interface Form {
  rail: { w: number; labelsVisible: number } | null;
  bottomNav: number;
  listOffCanvas: boolean;
  ctxOffCanvas: boolean;
  chatW: number;
}

async function readForm(page: Page, width: number): Promise<Form> {
  await page.setViewportSize({ width, height: 1180 });
  // 角色库从空开始：没有角色时对话列是空态，量不到 .chat-shell 的布局
  await seedCharacter(page, { favorite: true });
  await page.goto('/chat');
  // 路由组件是懒加载 chunk：等它挂载，别等 app 外壳（A13 踩过）
  await page.waitForSelector('#app-main > *');
  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const railEl = document.querySelector('.nav-rail');
    const railBox = railEl?.getBoundingClientRect() ?? null;
    const listBox = box('.character-list');
    const ctxBox = box('.context-panel');
    const chatBox = box('.chat-shell');
    const labels = Array.from(document.querySelectorAll('.nav-label')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(el).display !== 'none';
    });
    return {
      rail: railBox ? { w: Math.round(railBox.width), labelsVisible: labels.length } : null,
      bottomNav: document.querySelectorAll('.bottom-nav').length,
      // 抽屉化 = 整块被平移到视口外（左出或右出）
      listOffCanvas: listBox ? listBox.right <= 0 : true,
      ctxOffCanvas: ctxBox ? ctxBox.left >= window.innerWidth : true,
      chatW: chatBox ? Math.round(chatBox.width) : 0,
    };
  });
}

for (const width of TABLET_WIDTHS) {
  test(`${width} 宽：图标 rail + 抽屉 + 无底部导航，聊天列 ≥700`, async ({ page }) => {
    const form = await readForm(page, width);

    expect(form.rail, '平板档必须有 NavRail（底部导航只在 ≤640 出现）').not.toBeNull();
    expect(form.rail!.w, 'rail 必须是 64px 图标栏；112px 是桌面形态').toBeLessThanOrEqual(64);
    expect(form.rail!.labelsVisible, '图标栏里不该有可见文字标签').toBe(0);
    expect(form.bottomNav, '平板档不许同时有底部导航（同一档只出现其一）').toBe(0);
    expect(form.listOffCanvas, '角色列表应抽屉化（默认收起）').toBe(true);
    expect(form.ctxOffCanvas, '上下文面板应抽屉化（默认收起）').toBe(true);
    expect(form.chatW, `聊天列只有 ${form.chatW}px，平板档不该被两侧栏挤窄`).toBeGreaterThanOrEqual(700);
  });
}

test('820 与 1000 是同一个形态（整档一个定义，不是两段拼接）', async ({ page }) => {
  const a = await readForm(page, 820);
  const b = await readForm(page, 1000);

  expect(b.rail!.w, '901–1024 这一段曾退回 112px 全宽 rail').toBe(a.rail!.w);
  expect(b.rail!.labelsVisible).toBe(a.rail!.labelsVisible);
  expect(b.bottomNav).toBe(a.bottomNav);
  expect(b.listOffCanvas).toBe(a.listOffCanvas);
  expect(b.ctxOffCanvas).toBe(a.ctxOffCanvas);
});

test('桌面 1025 以上仍是三栏并置（平板定形没有把桌面一起改了）', async ({ page }) => {
  const form = await readForm(page, 1280);

  expect(form.rail!.w, '桌面 rail 应回到 112px 全宽').toBeGreaterThan(64);
  expect(form.rail!.labelsVisible, '桌面 rail 必须有文字标签').toBeGreaterThan(0);
  expect(form.bottomNav).toBe(0);
  expect(form.listOffCanvas, '桌面角色列表应常驻（不是抽屉）').toBe(false);
  expect(form.ctxOffCanvas, '桌面上下文面板应常驻（不是抽屉）').toBe(false);
});
