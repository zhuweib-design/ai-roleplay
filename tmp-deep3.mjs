// 手机端深挖 第三轮：横屏 56px 预留是否为死代码 / 设置分类可达性 / 长按面板 / toast 落点
import { phone, go, BASE } from './tmp-seed.mjs';
const out = (...a) => console.log(...a);

// ── A. 横屏那条 56px 预留：底部导航在不在？ ──
{
  const { browser, page } = await phone({ width: 844, height: 390, touch: true });
  out('\n════ A. 横屏 844×390：那条 padding-bottom:56px 是给谁的 ════');
  out('  CSS 规则：@media (max-height:480px) and (orientation:landscape) and (max-width:900px) { .chat-main{padding-bottom:56px} }');
  out('  该规则的注释原文：「底部导航为 sticky,主内容预留高度避免被遮挡」');
  await go(page, '/chat');
  out('  ' + await page.evaluate(() => {
    const main = document.querySelector('.chat-main');
    const bn = document.querySelector('.bottom-nav');
    const rail = document.querySelector('.nav-rail');
    const media = '(max-height:480px) and (orientation:landscape) and (max-width:900px)';
    const msg = document.querySelector('.chat-messages');
    return JSON.stringify({
      媒体查询命中: matchMedia(media).matches,
      底部导航在DOM: !!bn, 导航栏在DOM: !!rail,
      chat_main_paddingBottom: main ? getComputedStyle(main).paddingBottom : null,
      消息区高: msg ? Math.round(msg.getBoundingClientRect().height) : null,
      视口高: innerHeight,
      浪费占比: msg ? Math.round(56 / innerHeight * 100) + '%' : null,
    });
  }));
  await browser.close();
}

// ── B. 横屏下导航栏（rail）能不能装进 390px 高 ──
{
  const { browser, page } = await phone({ width: 844, height: 390, touch: true });
  out('\n════ B. 横屏下 64px 图标栏在 390px 高度里装得下吗 ════');
  await go(page, '/chat');
  out('  ' + await page.evaluate(() => {
    const rail = document.querySelector('.nav-rail');
    if (!rail) return '没有 rail';
    const items = [...rail.querySelectorAll('.nav-item')];
    const r = rail.getBoundingClientRect();
    const last = items[items.length - 1];
    const lr = last ? last.getBoundingClientRect() : null;
    return JSON.stringify({ rail高: Math.round(r.height), 滚动: rail.scrollHeight > rail.clientHeight,
      滚高: `${rail.clientHeight}→${rail.scrollHeight}`, 项数: items.length,
      末项可见: lr ? lr.bottom <= r.bottom + 1 : null, 末项bottom: lr ? Math.round(lr.bottom) : null, rail底: Math.round(r.bottom) });
  }));
  await browser.close();
}

// ── C. 设置 7 个分类在 390 上可达吗 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ C. 设置分类条：7 个分类可达性 ════');
  await go(page, '/settings');
  out('  ' + await page.evaluate(() => {
    const list = document.querySelector('.settings-nav-list');
    const wrap = list ? list.parentElement : null;
    const f = (e) => { if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right), overflowX: cs.overflowX, ox: Math.round(e.scrollWidth) + '/' + Math.round(e.clientWidth) }; };
    return JSON.stringify({ 视口: innerWidth, 列表: f(list), 父: f(wrap),
      父的父: f(wrap ? wrap.parentElement : null),
      第7个分类右边界: (() => { const it = list ? [...list.querySelectorAll('button,a,[role="tab"]')].pop() : null;
        return it ? Math.round(it.getBoundingClientRect().right) : null; })(),
    });
  }));
  // 试：能不能点到第 7 个（关于）
  const last = page.locator('.settings-nav-list button, .settings-nav-list a, .settings-nav-list [role="tab"]').last();
  const cnt = await last.count();
  out(`  末个分类按钮存在=${cnt}`);
  if (cnt) {
    const label = (await last.textContent() || '').trim().slice(0, 10);
    await last.click({ timeout: 3000, force: true }).catch(e => out('  点击失败: ' + String(e.message).slice(0, 50)));
    await page.waitForTimeout(900);
    out(`  点「${label}」后 URL = ${page.url().replace(BASE, '/')}`);
    out('  页面标题: ' + await page.evaluate(() => (document.querySelector('h1,h2,.settings-title') || {}).textContent || 'n/a'));
  }
  await page.screenshot({ path: '/tmp/settings-390.png' });
  await browser.close();
}

// ── D. 长按消息 → 面板几何 + 面板是否读键盘 inset ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ D. 长按消息面板（先选一个有种子里有历史的角色） ════');
  await go(page, '/chat');
  // 打开左抽屉 → 选一个角色
  const menu = page.locator('.mobile-menu-btn, .chat-header button').first();
  if (await menu.count()) { await menu.click().catch(() => {}); await page.waitForTimeout(800); }
  const ch = page.locator('.character-item, .char-item, .character-list button').filter({ hasText: '卡尔文' }).first();
  if (await ch.count()) { await ch.click().catch(() => {}); await page.waitForTimeout(1500); }
  out('  气泡数 = ' + await page.locator('.msg-bubble').count());
  const b = page.locator('.msg-bubble').nth(1);
  if (await b.count()) {
    const box = await b.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
    await page.waitForTimeout(800);
    out('  ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel, .message-action-sheet, [role="dialog"]');
      if (!s) return '长按后面板没出现';
      const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
      const btns = [...s.querySelectorAll('button')];
      return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        贴底: Math.abs(innerHeight - r.bottom) < 3, 定位: cs.position, z: cs.zIndex,
        按钮数: btns.length,
        按钮尺寸: btns.slice(0, 5).map(x => { const q = x.getBoundingClientRect(); return Math.round(q.width) + 'x' + Math.round(q.height); }),
      });
    }));
    await page.screenshot({ path: '/tmp/sheet.png' });
  } else out('  仍无气泡');
  await browser.close();
}

// ── E. toast 在 390 上的落点 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ E. Toast 落点 ════');
  await go(page, '/character');
  // 触发一个 toast：点导入之类的失败路径不可控，改为直接问 CSS
  out('  Toast 的 ≤640 规则：' + await (async () => {
    for (const f of ['src/components/common/Toast.vue']) {}
    return '见源码';
  })());
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('x')); });
  await browser.close();
}
