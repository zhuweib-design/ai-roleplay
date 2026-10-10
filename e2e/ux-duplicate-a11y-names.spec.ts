import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { audit, expandAllCollapsed, visitTabs, settle, mainContent } from './a11y-dup-audit';

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
  '/community-market',
  '/local-model',
  '/image-gen',
  '/archives',
  '/character-version',
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

/** 从 src/router/index.ts 里读出真实注册的路由路径 */
function registeredRoutes(): string[] {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/router/index.ts'), 'utf8');
  return [...src.matchAll(/path:\s*'([^']+)'/g)].map((m: RegExpMatchArray) => m[1] ?? '');
}

test.describe('实时 DOM 的 id 与可访问名唯一性', () => {
  test('审计清单里每条路由都真的注册在 router 上', () => {
    // M13-b 实测：清单里的 `/versions` 从来没注册过，router 也没有兜底路由，
    // 于是那条"路由审计"一直在扫一个空白页——而整页按钮计数看不出问题（NavRail 撑着）。
    const registered = new Set(registeredRoutes());
    const missing = ROUTES.map((r) => r.split('?')[0]).filter((p) => !registered.has(p));
    expect(missing, `这些路径没注册在 router 上：${missing.join(', ')}`).toEqual([]);
    expect(registered.has('/'), '读到的路由表太短说明正则失配').toBe(true);
  });

  for (const [idx, routes] of CHUNKS.entries()) {
    test(`第 ${idx + 1} 组共 ${routes.length} 条路由：无重复 id、无同区域同名、无仅靠占位符命名的控件`, async ({ page }) => {
      const violations: string[] = [];
      const checked: string[] = [];
      for (const route of routes) {
        await page.goto(route);
        await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
        await settle(page);
        const res = await audit(page);
        // 只数路由自己渲染出来的东西：整页有 NavRail 的 15 个按钮兜底，
        // 拿整页计数当"渲染出来了"的证据，空白页也能过（M13-b 实测就是这样漏掉死路由的）
        const main = await mainContent(page);
        // 只要求"有可见控件"：社区市场整块内容一个 id 都不带，那是合法写法
        // （没有 aria 关联需求就不必发 id），拿 id 数当渲染证据会把正常页面判成空白。
        if (main.buttons <= 0) violations.push(`${route} 主内容区一个可见控件都没有（多半是条不存在的路由）`);
        if (res.visibleButtons <= 2) violations.push(`${route} 整页可见按钮数 ${res.visibleButtons}，用例在此失去意义`);
        for (const id of res.dupIds) violations.push(`${route} 重复 id：#${id}`);
        for (const row of res.sameRegionDupNames) violations.push(`${route} 同一区域里同名按钮：${row}`);
        for (const row of res.placeholderOnly) violations.push(`${route} 只有占位符没有标签：${row}`);
        for (const row of res.deadAnchors) violations.push(`${route} 跳转链接指向不存在的锚点：${row}`);
        checked.push(`${route}(主内容 ${main.buttons} 个控件 / 整页 ${res.idTotal} 个 id)`);
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
      await settle(page);
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
    // 折叠段要等设置页读完 store 才出现，扫"半个页面"只会少扫不会报错，所以先等它出现
    await page.waitForSelector('button.collapse-toggle:visible', { timeout: 15_000 });
    await settle(page);
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

  /**
   * M13-b：再往下一层——点开页面内的 Tab 之后。
   *
   * Tab 换的是面板内容且不改 URL，所以逐路由那层扫描永远只看见默认 Tab；
   * 面板多是 `v-show`（切走的只是 display:none），判定只看可见元素 ⇒ 这一层是真换出了
   * 新覆盖面。点了会换路由的分段控件（/chat ⇄ /group）单列出来，不假装覆盖。
   */
  test(`点开每个 Tab 后再扫一遍（共 ${ROUTES.length} 条路由）`, async ({ page }) => {
    const violations: string[] = [];
    const seen: string[] = [];
    const navigatedAway: string[] = [];
    let visitedTotal = 0;
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForSelector('#app button, #app [role="button"]', { timeout: 15_000 });
      await settle(page);
      const { visited, navigatedAway: away } = await visitTabs(page, route, async (label) => {
        const res = await audit(page);
        const at = `${route} · Tab「${label}」`;
        for (const id of res.dupIds) violations.push(`${at} 重复 id：#${id}`);
        for (const row of res.sameRegionDupNames) violations.push(`${at} 同一区域里同名按钮：${row}`);
        for (const row of res.placeholderOnly) violations.push(`${at} 只有占位符没有标签：${row}`);
        for (const row of res.deadAnchors) violations.push(`${at} 跳转链接指向不存在的锚点：${row}`);
      });
      visitedTotal += visited.length;
      navigatedAway.push(...away.map((l) => `${route} · ${l}`));
      if (visited.length) seen.push(`${route}(${visited.join('/')})`);
    }
    expect(violations, `Tab 层扫了 ${visitedTotal} 个可见 Tab：\n${seen.join('\n')}`).toEqual([]);
    // 空转守卫：一条 Tab 都没扫到，说明选择器或路由列表出了问题
    expect(visitedTotal, '没有任何路由带可见 Tab，本用例失去意义').toBeGreaterThan(3);
    test.info().annotations.push({
      type: 'info',
      description: `换路由因而未覆盖的分段控件：${navigatedAway.join('、') || '无'}`,
    });
  });

  /**
  /**
   * Tab 层的负向对照：可见性到底管不管用。
   *
   * 面板是 `v-show`，切走的 Tab 里节点还在 DOM 上。两类判定在这里的表现**故意不同**，
   * 这条用例把差异钉住而不是假装一致：
   * - 重复 id 是文档级违规（`getElementById` 不看可见性，指错就是指错）⇒ 切走仍要报；
   * - 只靠 placeholder 命名的控件按可见性判定 ⇒ 切走不该再报。
   * 少了这条，Tab 层的"零违规"完全可能只是"什么都没看见"。
   */
  test('负向对照：Tab 切走后，可见性判定收手、文档级判定仍然报', async ({ page }) => {
    await page.goto('/random-events');
    await page.waitForSelector('[role="tab"]:visible');
    expect(
      await page.locator('[role="tab"]:visible').count(),
      '这条路由上至少要有两个 Tab 才验得出切换'
    ).toBeGreaterThanOrEqual(2);

    const injected = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(
        (p) => p.getBoundingClientRect().height > 0
      );
      if (!panel) return null;
      for (let i = 0; i < 2; i++) {
        const dup = document.createElement('span');
        dup.id = 'e2e-tab-dup';
        panel.appendChild(dup);
      }
      const box = document.createElement('input');
      box.type = 'text';
      box.placeholder = 'Tab 面板里只有占位符';
      panel.appendChild(box);
      return panel.id;
    });
    expect(injected, '页面上找不到可见的 tabpanel').toBeTruthy();

    const onActiveTab = await audit(page);
    expect(onActiveTab.dupIds, `注入在可见面板 #${injected} 里却没报重复 id`).toContain('e2e-tab-dup');
    expect(onActiveTab.placeholderOnly, '可见面板里只靠 placeholder 的控件没被抓到').toEqual([
      'input[text] Tab 面板里只有占位符',
    ]);

    // 切到另一个 Tab：同一批节点还在 DOM 里，只是不可见
    await page.locator('[role="tab"]:visible').nth(1).click();
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => document.querySelectorAll('#e2e-tab-dup').length),
      '节点被顺带清掉了，这条对照不成立'
    ).toBe(2);

    const offTab = await audit(page);
    expect(offTab.placeholderOnly, '切走的 Tab 里的控件不该算违规（判定只看可见元素）').toEqual([]);
    expect(offTab.dupIds, '重复 id 是文档级违规，切走 Tab 也躲不掉').toContain('e2e-tab-dup');
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
