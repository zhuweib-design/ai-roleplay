// 手机端深挖 第二轮：横屏到底是什么形态 / 焦点进不进抽屉 / 设置分类可见性 / toast 落点 / 群聊输入条
import { phone, go } from './tmp-seed.mjs';
const out = (...a) => console.log(...a);

// ── A. 横屏 844×390：渲染的是哪套形态？谁吃掉了高度？ ──
{
  const { browser, page } = await phone({ width: 844, height: 390, touch: true });
  out('\n════ A. 横屏 844×390（安卓 manifest 没锁屏幕方向，真机会转） ════');
  for (const [name, route] of [['chat','/chat'],['group','/group']]) {
    await go(page, route);
    if (name === 'group') { const it = page.locator('.group-item,.list-item').first();
      if (await it.count()) { await it.click().catch(() => {}); await page.waitForTimeout(1200); } }
    const r = await page.evaluate(() => {
      const has = (s) => !!document.querySelector(s);
      const H = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const W = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; };
      const nodes = [...document.querySelectorAll('body *')].filter(e => {
        const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return b.height > 20 && b.width > 200 && cs.display !== 'none' && cs.position !== 'fixed';
      });
      const roots = nodes.filter(e => !nodes.some(o => o !== e && o.contains(e) && Math.abs(o.getBoundingClientRect().height - e.getBoundingClientRect().height) < 8));
      return {
        形态: { 有底部导航: has('.bottom-nav'), 有导航栏: has('.nav-rail'), 有右面板: has('.context-panel'), 有角色列表: has('.character-list') },
        宽: { 导航栏: W('.nav-rail'), 角色列表: W('.character-list'), 主区: W('.chat-main'), 右面板: W('.context-panel') },
        高: { 视口: innerHeight, 消息区: H('.chat-messages,.messages-area'), 群头部: H('.group-header'), 输入区: H('.input-area,.chat-footer'), 就绪条: H('.readiness-bar') },
        区块: roots.map(e => `${String(e.className || e.tagName).split(' ')[0].slice(0, 22).padEnd(22)} h=${Math.round(e.getBoundingClientRect().height).toString().padStart(4)}`),
      };
    });
    out(`  ${name}: 形态=${JSON.stringify(r.形态)}`);
    out(`     宽=${JSON.stringify(r.宽)}  高=${JSON.stringify(r.高)}`);
    out('     ' + r.区块.join('\n     '));
  }
  await browser.close();
}

// ── B. 焦点会不会走进关着的抽屉（离屏内容可聚焦？） ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ B. 两个抽屉都关着时，Tab 焦点走到哪 ════');
  await go(page, '/chat');
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return 'none';
      const r = a.getBoundingClientRect();
      const off = r.right < 2 || r.left > innerWidth - 2;
      const inDrawer = !!a.closest('.character-list,.context-panel');
      return `${a.tagName} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 14)}" x=${Math.round(r.x)} ${off ? '【离屏】' : ''}${inDrawer ? '【在抽屉里】' : ''}`;
    }));
  }
  out('  ' + seen.map((s, i) => `${i + 1}. ${s}`).join('\n  '));
  await browser.close();
}

// ── C. 设置：7 个分类在 390 上能看到几个 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ C. 设置分类横排可见性 ════');
  await go(page, '/settings');
  out('  ' + await page.evaluate(() => {
    const list = document.querySelector('.settings-nav-list,.settings-nav,.tabs');
    if (!list) return '找不到分类容器';
    const items = [...list.querySelectorAll('button,a,[role="tab"]')];
    const r = list.getBoundingClientRect();
    const vis = items.filter(e => { const b = e.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; });
    const cs = getComputedStyle(list);
    return JSON.stringify({ 总数: items.length, 完整可见: vis.length, 可横向滚: list.scrollWidth > list.clientWidth,
      滚宽: `${list.clientWidth}→${list.scrollWidth}`, overflowX: cs.overflowX,
      分类名: items.map(e => (e.textContent || '').trim().slice(0, 8)) });
  }));
  await browser.close();
}

// ── D. toast 在 390 上落在哪（会不会压住页头） ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ D. Toast 落点 ════');
  await go(page, '/chat');
  const hinted = await page.evaluate(() => {
    const cs = document.querySelector('style');
    return null;
  });
  // 用长按消息触发 action sheet，再量它的几何（同时也是"手机端长按能不能用"的验证）
  out('  长按首条消息：');
  const bubble = page.locator('.msg-bubble, .message-bubble').nth(2);
  if (await bubble.count()) {
    const box = await bubble.boundingBox();
    if (box) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(800);
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    out('  ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel,.action-sheet,.message-action-sheet,[role="dialog"]');
      if (!s) return '长按后面板未出现';
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        贴底: Math.abs(innerHeight - r.bottom) < 3, 定位: cs.position, z: cs.zIndex,
        项数: s.querySelectorAll('button').length,
        按钮尺寸: [...s.querySelectorAll('button')].slice(0, 4).map(b => { const q = b.getBoundingClientRect(); return Math.round(q.width) + 'x' + Math.round(q.height); }),
        读键盘inset: s.outerHTML.includes('keyboard-inset') });
    }));
    await page.screenshot({ path: '/tmp/sheet-390.png' });
  } else out('  页面上没有消息气泡');
  await browser.close();
}

// ── E. 群聊输入条：placeholder 是否被裁 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ E. 群聊输入条 ════');
  await go(page, '/group');
  const it = page.locator('.group-item,.list-item').first();
  if (await it.count()) { await it.click().catch(() => {}); await page.waitForTimeout(1400); }
  out('  ' + await page.evaluate(() => {
    const ta = document.querySelector('.input-area textarea, .input-area input, .chat-input, textarea');
    if (!ta) return '找不到输入框';
    const r = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    const box = ta.closest('.input-area,.chat-footer,.input-wrapper');
    const br = box ? box.getBoundingClientRect() : null;
    return JSON.stringify({ 输入框: `${Math.round(r.width)}x${Math.round(r.height)}`, 字号: cs.fontSize, 行高: cs.lineHeight,
      内边距: cs.padding, 外盒高: br ? Math.round(br.height) : null,
      外盒贴底: br ? Math.abs(innerHeight - br.bottom) < 60 : null,
      遮盖: br && br.bottom > innerHeight ? Math.round(br.bottom - innerHeight) : 0,
      placeholder: ta.getAttribute('placeholder'),
      底部导航高: (() => { const n = document.querySelector('.bottom-nav'); return n ? Math.round(n.getBoundingClientRect().height) : null; })() });
  }));
  await page.screenshot({ path: '/tmp/group-composer-390.png' });
  await browser.close();
}
