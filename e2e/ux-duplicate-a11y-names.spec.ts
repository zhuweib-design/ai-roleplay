import { test, expect } from '@playwright/test';
import { audit, expandAllCollapsed } from './a11y-dup-audit';

/**
 * E2E · 实时 DOM 里的 id / 可访问名 / 命名来源审计（M10-b 立，M11-a 扩，M12-b 再扩）
 *
 * 来源是 M8-c 登记的一条"未做"：当时用静态扫描数出 9 处 `id="main-content"`、
 * 3 处 `panel-settings`，以及角色编辑器页面上三处「取消」，我把它写成"既有的可访问名
 * 重复"。**那条判断没经过运行时验证，实测是说过头了**：那些元素分属互斥的路由分支或
 * `display:none` 的移动变体，21 条路由的真实 DOM 里重复 id 为 0。
 *
 * 于是这里不修代码，而是把结论钉成门禁。判定实现抽到了 `a11y-dup-audit.ts`，因为
 * M12-b 要把同一套判定用到两个新场景：
 * - **点开折叠段之后**（本文件的第二个用例）：默认视图里收着的面板根本没进 DOM 可见范围，
 *   M10/M11 两轮登记过这条边界却一直没变成断言；
 * - **对话框内部**（由 `ux-modal-describedby*` 四条 spec 调用）：那些 spec 本来就把每条
 *   对话框逐个点开并读过无障碍树，判定顺手跑一遍，成本接近零。
 *
 * 用例按"一次启动内循环若干条路由"组织，理由见下面 CHUNKS 的注释。
 */

const ROUTES = [
  '/',
  '/chat',
  '/group',
  '/character',
  '/character/new',
  '/worldbook',
  '/databank',
  '/story',
  '/random-events',
  '/market',
  '/local-model',
  '/image-gen',
  '/archives',
  '/versions',
  '/guide',
  '/more',
  '/settings',
  '/settings?cat=model',
  '/settings?cat=data',
  '/settings?cat=appearance',
  '/settings?cat=security',
];

/**
 * 判定按"一次启动内循环路由"组织，而不是一条路由一个用例。
 *
 * M10-b 刚加进来时是 21 条独立用例，实测它成了全套最贵的一项：46 次执行（双内核）
 * 合计 234s，占全部用例耗时的 12%，而每条只做了"加载页面 + 一次 evaluate"。
 * 成本全在**每个用例重付一次浏览器上下文 + 应用冷启动**。合成一次启动后同样的覆盖面
 * 只要个位数秒，于是也不必再为省时间砍 webkit 的路由数。
 *
 * 归因不丢：违规按 `路由 → 判定` 收集，断言消息里逐条列出是哪条路由出的问题。
 */
const CHUNKS: string[][] = [
  ROUTES.filter((_, i) => i % 2 === 0),
  ROUTES.filter((_, i) => i % 2 === 1),
];

test.describe('实时 DOM 的 id 与可访问名唯一性', () => {
  for (const [idx, routes] of CHUNKS.entries()) {
    test(`第 ${idx + 1} 组共 ${routes.length} 条路由：无重复 id、无同区域同名、无仅靠占位符命名的控件`, async ({ page }) => {
      const violations: string[] = [];
      const checked: string[] = [];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
        await page.waitForTimeout(400);
        const res = await audit(page);
        // 先确认这条路由真的渲染出了东西，否则"零违规"可能只是"零内容"
        if (res.visibleButtons <= 2) violations.push(`${route} 可见按钮数 ${res.visibleButtons}，用例在此失去意义`);
        if (res.idTotal <= 2) violations.push(`${route} 带 id 的元素只有 ${res.idTotal} 个，页面没渲染出来`);
        for (const id of res.dupIds) violations.push(`${route} 重复 id：#${id}`);
        for (const row of res.sameRegionDupNames) violations.push(`${route} 同一区域里同名按钮：${row}`);
        for (const row of res.placeholderOnly) violations.push(`${route} 只有占位符没有标签：${row}`);
        for (const row of res.deadAnchors) violations.push(`${route} 跳转链接指向不存在的锚点：${row}`);
        checked.push(`${route}(${res.idTotal} 个 id / ${res.visibleButtons} 个按钮)`);
      }
      expect(violations, `已扫 ${checked.length} 条路由：\n${checked.join('\n')}`).toEqual([]);
    });
  }

  /**
   * M12-b：默认视图之外那一层——点开折叠段之后。
   *
   * M10/M11 两轮都把"审计只看默认视图"登记成边界却没变成断言。折叠段里的控件
   * 收起时 `display:none`，判定看不见它们；一旦展开就可能冒出重复 id 或只有占位符的框。
   * `closedAfter` 必须归零，否则这个用例就退化成"又扫了一遍默认视图"。
   */
  test(`展开所有折叠段后再扫一遍（共 ${ROUTES.length} 条路由）`, async ({ page }) => {
    const violations: string[] = [];
    const expanded: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
      await page.waitForTimeout(300);
      const { closedBefore, closedAfter } = await expandAllCollapsed(page);
      if (closedBefore === 0) {
        expanded.push(`${route}(没有收着的段)`);
        continue;
      }
      if (closedAfter > 0) {
        violations.push(`${route} 展开了 ${closedBefore - closedAfter}/${closedBefore} 个段，还剩 ${closedAfter} 个没点开`);
      }
      await page.waitForTimeout(150);
      const res = await audit(page);
      for (const id of res.dupIds) violations.push(`${route} 展开后重复 id：#${id}`);
      for (const row of res.sameRegionDupNames) violations.push(`${route} 展开后同名按钮：${row}`);
      for (const row of res.placeholderOnly) violations.push(`${route} 展开后只有占位符：${row}`);
      for (const row of res.deadAnchors) violations.push(`${route} 展开后锚点落空：${row}`);
      expanded.push(`${route}(展开 ${closedBefore} 个段 / ${res.visibleButtons} 个按钮)`);
    }
    expect(violations, `展开后扫了 ${expanded.length} 条路由：\n${expanded.join('\n')}`).toEqual([]);
    // 至少有一条路由真的收着东西可展开：一条都没有的话这个用例就是空转
    expect(expanded.filter((r) => r.includes('展开')).length, '没有任何路由带折叠段，本用例失去意义').toBeGreaterThan(0);
  });

  /**
   * 负向对照：违规藏在**展开后的面板里**时才报，证明上面那条不是空转。
   *
   * 注入点选 `.collapse-panel`（收起时 `display:none`），同一段注入在"只扫默认视图"的
   * 那组用例里不会被发现——这正是本层新增的覆盖面。末尾再反证一次：收起后不该报，
   * 可见性这条规则是承重的。
   */
  test('负向对照：藏在展开面板里的违规必须被展开扫出来', async ({ page }) => {
    // 选「数据」分类：M4-b2 把"运维与兼容"那几段默认收着，这里才有东西可展开
    await page.goto('/settings?cat=data');
    await page.waitForSelector('#app button');
    const { closedBefore } = await expandAllCollapsed(page);
    expect(closedBefore, '这一页没有收着的段，换一条路由再验').toBeGreaterThan(0);

    const hostVisible = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.collapse-panel')].find(
        (p) => p.getBoundingClientRect().height > 0
      );
      if (!panel) return false;
      const dup = document.createElement('span');
      dup.id = 'e2e-panel-dup';
      panel.appendChild(dup);
      const dup2 = document.createElement('span');
      dup2.id = 'e2e-panel-dup';
      panel.appendChild(dup2);
      const box = document.createElement('input');
      box.type = 'text';
      box.placeholder = '面板里只有占位符';
      panel.appendChild(box);
      panel.setAttribute('data-probe-host', '1');
      return true;
    });
    expect(hostVisible, '展开后没有可见面板，注入等于没注入').toBe(true);

    const res = await audit(page);
    expect(res.dupIds, '展开面板里的重复 id 没被抓到').toContain('e2e-panel-dup');
    expect(res.placeholderOnly, '展开面板里只靠 placeholder 命名的控件没被抓到').toEqual([
      'input[text] 面板里只有占位符',
    ]);

    // 反证：把**注入所在的那一段**收回去，同一份内容就不该再报（可见性这条规则是承重的）
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#e2e-panel-dup, input[placeholder="面板里只有占位符"]')) el.remove();
      const panel = document.querySelector('[data-probe-host]');
      const toggle = panel?.id
        ? document.querySelector<HTMLButtonElement>(`button.collapse-toggle[aria-controls="${panel.id}"]`)
        : null;
      if (!toggle) throw new Error('找不到控制这个面板的折叠按钮，反证不成立');
      toggle.click();
    });
    await page.waitForTimeout(200);
    expect((await audit(page)).placeholderOnly, '收起的面板里的控件不该算违规').toEqual([]);
  });

  test('负向对照：造出违规必须报出来，隐藏的重复不该误报', async ({ page }) => {
    await page.goto('/character');
    await page.waitForSelector('#app button');
    const before = await audit(page);
    expect(before.dupIds, '基线就该是干净的').toEqual([]);
    expect(before.sameRegionDupNames, '基线就该是干净的').toEqual([]);
    expect(before.placeholderOnly, '基线就该是干净的').toEqual([]);
    expect(before.deadAnchors, '基线就该是干净的').toEqual([]);

    const injected: { label: string } = await page.evaluate(() => {
      // 重复 id 是全文档级违规，放哪都算；同名按钮才需要挑同一个父元素（见下）
      const dupHost = document.querySelector('main') ?? document.body;
      const dupId = document.createElement('span');
      dupId.id = 'e2e-probe-dup';
      dupHost.appendChild(dupId);
      const dupId2 = document.createElement('span');
      dupId2.id = 'e2e-probe-dup';
      dupHost.appendChild(dupId2);

      // 同名按钮要插在**真正那个按钮的旁边**（同一个父元素），才会落进同一个区域桶；
      // 插到别的容器里就成"两个区域各一个同名"，那是正当的，审计不该报
      const real = [...document.querySelectorAll('header button, nav button, main button')].find(
        (el) => !!el.parentElement
      );
      if (!real) throw new Error('这条路由上找不到可克隆的按钮，换一条再验');
      const label = (real.getAttribute('aria-label') || real.textContent || '').trim();
      const host = real.parentElement ?? document.body;

      const twin = document.createElement('button');
      twin.type = 'button';
      twin.setAttribute('aria-label', label);
      twin.textContent = label;
      host.insertBefore(twin, real.nextSibling);

      // 隐藏的重复不算违规（判定只看可见元素），放进来是为了证明"可见性"这条规则是承重的
      const hiddenTwin = document.createElement('button');
      hiddenTwin.type = 'button';
      hiddenTwin.setAttribute('aria-label', label);
      hiddenTwin.textContent = label;
      hiddenTwin.style.display = 'none';
      host.insertBefore(hiddenTwin, twin.nextSibling);
      return { label };
    });

    const after = await audit(page);
    expect(after.dupIds, '重复 id 没被抓到').toContain('e2e-probe-dup');
    expect(
      after.sameRegionDupNames.filter((row) => row.includes(injected.label)),
      `同区域同名按钮没被抓到，或把隐藏元素误判进来了（${injected.label}）`
    ).toHaveLength(1);

    // 只靠 placeholder 命名的控件：现场造一个，必须被抓到
    await page.evaluate(() => {
      const box = document.createElement('input');
      box.type = 'text';
      box.placeholder = '只有占位符没有标签';
      document.querySelector('main')?.appendChild(box);
    });
    expect((await audit(page)).placeholderOnly, '只靠 placeholder 命名的控件没被抓到').toEqual([
      'input[text] 只有占位符没有标签',
    ]);

    // ④ 页内跳转链接指向不存在的锚点（M11-c 实测就是这样发现 8 条路由的"跳到主内容"落空）
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#e2e-probe-no-such-anchor';
      a.textContent = '指向不存在的锚点';
      document.body.appendChild(a);
    });
    expect((await audit(page)).deadAnchors, '指向缺失锚点的跳转链接没被抓到').toEqual([
      'e2e-probe-no-such-anchor ← "指向不存在的锚点"',
    ]);
  });

  test('对话页两种分支各自只有一个主内容锚点', async ({ page }) => {
    // ChatView 的冷启动分支与 ChatMain 的 <main> 都带 id="main-content"，
    // 静态看是"重复"，运行时靠 v-if/v-else 互斥。这条用例把"必须互斥"钉住。
    await page.goto('/chat');
    await page.waitForSelector('#main-content');
    expect(await page.locator('#main-content').count()).toBe(1);
  });
});
