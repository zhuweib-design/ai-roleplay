// 深挖 第四轮：横屏 rail 溢出 / 设置分类是否真的可达 / 长按面板 / 真实 toast
import { phone, go, BASE } from './tmp-seed.mjs';
const out = (...a) => console.log(...a);

// ── A. 横屏 390px 高，rail 溢出是「可滚」还是「被切」 ──
{
  const { browser, page } = await phone({ width: 844, height: 390, touch: true });
  await go(page, '/chat');
  out('\n════ A. 横屏 844×390：64px 导航栏 15 项装不下 ════');
  out('  ' + await page.evaluate(() => {
    const rail = document.querySelector('.nav-rail');
    if (!rail) return '无 rail';
    const cs = getComputedStyle(rail);
    const items = [...rail.querySelectorAll('.nav-item')];
    const last = items[items.length - 1];
    return JSON.stringify({
      overflowY: cs.overflowY, 高: `${rail.clientHeight}→${rail.scrollHeight}`,
      可滚: cs.overflowY === 'auto' || cs.overflowY === 'scroll',
      注册滚动: rail.scrollTop,
      末项: last ? { 名: (last.textContent || '').trim().slice(0, 8), bottom: Math.round(last.getBoundingClientRect().bottom) } : null,
      项高: items.length ? Math.round(items[0].getBoundingClientRect().height) : null,
      需要高: rail.scrollHeight, 可用高: rail.clientHeight,
    });
  }));
  // 试着滚 rail 到底，看末项能不能露出来
  await page.evaluate(() => { const r = document.querySelector('.nav-rail'); if (r) r.scrollTop = r.scrollHeight; });
  await page.waitForTimeout(400);
  out('  手动滚到底后：' + await page.evaluate(() => {
    const items = [...document.querySelectorAll('.nav-rail .nav-item')];
    const last = items[items.length - 1];
    return last ? `${(last.textContent || '').trim().slice(0, 8)} bottom=${Math.round(last.getBoundingClientRect().bottom)}（视口高 ${innerHeight}）` : 'n/a';
  }));
  await browser.close();
}

// ── B. 设置 7 个分类：把条滚到底，末个能不能点中 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ B. 设置分类：初始可见几个 / 能不能滑到第 7 个 ════');
  await go(page, '/settings');
  const before = await page.evaluate(() => {
    const l = document.querySelector('.settings-nav-list');
    if (!l) return 'n/a';
    const items = [...l.querySelectorAll('button,a,[role="tab"]')];
    const lr = l.getBoundingClientRect();
    return JSON.stringify({
      初始可见: items.filter(e => { const b = e.getBoundingClientRect(); return b.left >= lr.left - 1 && b.right <= Math.min(lr.right, innerWidth) + 1; }).map(e => (e.textContent || '').trim().slice(0, 6)),
      被视口切掉: items.filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => (e.textContent || '').trim().slice(0, 6)),
      被容器切掉: items.filter(e => { const b = e.getBoundingClientRect(); return b.left >= innerWidth || (b.right > lr.right && b.right <= innerWidth); }).map(e => (e.textContent || '').trim().slice(0, 6)),
      列表右边界: Math.round(lr.right), 视口: innerWidth,
    });
  });
  out('  ' + before);
  await page.evaluate(() => { const l = document.querySelector('.settings-nav-list'); if (l) l.scrollLeft = l.scrollWidth; });
  await page.waitForTimeout(500);
  out('  滑到底后 7 个分类的可点性：' + await page.evaluate(() => {
    const l = document.querySelector('.settings-nav-list');
    const items = [...l.querySelectorAll('button,a,[role="tab"]')];
    return JSON.stringify(items.map(e => { const b = e.getBoundingClientRect();
      return { 名: (e.textContent || '').trim().slice(0, 6), 左: Math.round(b.left), 右: Math.round(b.right),
        屏内: b.left >= 0 && b.right <= innerWidth }; }));
  }));
  // 点「关于」并验证副标题变了没
  const lastTab = page.locator('.settings-nav-list button, .settings-nav-list a, .settings-nav-list [role="tab"]').last();
  await lastTab.click({ timeout: 3000 }).catch(e => out('  点击抛错: ' + String(e.message).slice(0, 60)));
  await page.waitForTimeout(1000);
  out(`  URL=${page.url().replace(BASE, '/')}  副标题=${await page.evaluate(() => (document.querySelector('.page-subtitle,.settings-subtitle,h1+p,p') || {}).textContent || 'n/a')}`);
  await browser.close();
}

// ── C. 找到打开角色抽屉和进入有历史会话的正确入口 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ C. 从 /chat 进入一个有历史的会话 ════');
  await go(page, '/chat');
  out('  页头按钮: ' + await page.evaluate(() => [...document.querySelectorAll('.chat-header button, .chat-header [role="button"], .chat-actions button')]
    .map(b => `"${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 12)}" .${String(b.className).split(' ')[0]}`).join(' | ')));
  // 依次点类名里含 menu / list 的
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('.mobile-menu-btn') || [...document.querySelectorAll('.chat-header button')]
      .find(b => /menu|list|drawer|侧栏|角色/.test((b.getAttribute('aria-label') || '') + String(b.className)));
    if (!btn) return '没找到菜单按钮';
    btn.click();
    return '点了 .' + String(btn.className).split(' ')[0];
  });
  out('  ' + opened);
  await page.waitForTimeout(900);
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('.character-list');
    if (!d) return '无抽屉';
    const r = d.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x), w: Math.round(r.width), inert: d.hasAttribute('inert'), 项类名: [...d.querySelectorAll('button')].slice(0, 3).map(b => String(b.className).split(' ')[0]) });
  });
  out('  抽屉: ' + drawer);
  const conv = page.getByRole('button', { name: /卡尔文/ }).first();
  if (await conv.count()) { await conv.click().catch(() => {}); await page.waitForTimeout(1500); }
  out('  点后气泡数 = ' + await page.locator('.msg-bubble').count() + '  URL=' + page.url().replace(BASE, '/'));
  const bb = page.locator('.msg-bubble').nth(1);
  if (await bb.count()) {
    const box = await bb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(800);
    out('  长按后面板: ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel, .message-action-sheet, [role="dialog"]');
      if (!s) return '没出现';
      const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
      const btns = [...s.querySelectorAll('button')];
      return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        贴底: Math.abs(innerHeight - r.bottom) < 3, z: cs.zIndex, 按钮数: btns.length,
        按钮尺寸: btns.slice(0, 5).map(x => { const q = x.getBoundingClientRect(); return Math.round(q.width) + 'x' + Math.round(q.height); }) });
    }));
    await page.screenshot({ path: '/tmp/sheet390.png' });
  }
  await browser.close();
}

// ── D. 真实触发一个 toast，量它的位置 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ D. Toast 真实落点（390）════');
  await go(page, '/settings?cat=data');
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => t && t.length <= 10).slice(0, 30));
  out('  数据页按钮: ' + JSON.stringify(btns));
  for (const label of ['导出备份', '导出', '备份', '刷新', '清理缓存', '导出全部数据']) {
    const b = page.getByRole('button', { name: label, exact: false }).first();
    if (!(await b.count())) continue;
    try {
      await b.click({ timeout: 2500 });
      await page.waitForTimeout(1200);
      const t = await page.evaluate(() => {
        const el = document.querySelector('.toast, .toast-item, [class*="toast"]');
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const header = document.querySelector('.chat-header, .page-header');
        return JSON.stringify({ 点: '', top: Math.round(r.top), bottom: Math.round(r.bottom), 定位: cs.position, z: cs.zIndex,
          压页头: header ? r.top < header.getBoundingClientRect().bottom : null,
          压底部导航: (() => { const n = document.querySelector('.bottom-nav'); return n ? r.bottom > n.getBoundingClientRect().top : null; })() });
      });
      if (t) { out(`  点「${label}」→ ${t}`); break; } else out(`  点「${label}」→ 没出现 toast 元素`);
    } catch (e) { out(`  「${label}」失败 ${String(e.message).slice(0, 40)}`); }
  }
  await browser.close();
}
