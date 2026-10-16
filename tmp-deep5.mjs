// 深挖 第五轮：设置条到底被谁切了 / 长按面板 / toast 与页头重叠 / 抽屉打开后的焦点
import { phone, go, BASE } from './tmp-seed.mjs';
const out = (...a) => console.log(...a);

// ── A. 设置分类条：谁在切它？不同宽度下可见几个？ ──
{
  out('\n════ A. 设置分类条被谁裁剪 ════');
  for (const w of [360, 390, 412]) {
    const { browser, page } = await phone({ width: w, height: 844 });
    await go(page, '/settings');
    out(`  ── ${w}px ──`);
    out('    ' + await page.evaluate(() => {
      const l = document.querySelector('.settings-nav-list');
      if (!l) return 'n/a';
      const chain = [];
      let e = l;
      while (e && e !== document.documentElement) {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (cs.overflowX !== 'visible' || r.right > innerWidth + 1 || r.width > innerWidth + 1) {
          chain.push(`${String(e.className || e.tagName).split(' ')[0]} w=${Math.round(r.width)} right=${Math.round(r.right)} overflowX=${cs.overflowX}`);
        }
        e = e.parentElement;
      }
      const items = [...l.querySelectorAll('button,a,[role="tab"]')];
      const lr = l.getBoundingClientRect();
      l.scrollLeft = 0;
      return JSON.stringify({
        视口: innerWidth,
        列表: `x=${Math.round(lr.x)} w=${Math.round(lr.width)} right=${Math.round(lr.right)} 内容宽=${l.scrollWidth}`,
        初始完整可见: items.filter(e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }).length,
        初始被视口切: items.filter(e => e.getBoundingClientRect().right > innerWidth).map(e => (e.textContent || '').trim().slice(0, 5)),
        溢出链: chain,
        右侧边缘元素: (() => { const it = items[items.length - 1]; const b = it.getBoundingClientRect();
          return `${(it.textContent || '').trim().slice(0, 5)} 左=${Math.round(b.left)}（视口宽 ${innerWidth}）`; })(),
      });
    }));
    await browser.close();
  }
}

// ── B. 长按面板：用真实点击打开抽屉、选角色 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ B. 长按消息（真实点击）════');
  await go(page, '/chat');
  await page.locator('.mobile-menu-btn').click({ timeout: 4000 }).catch(e => out('  抽屉按钮点不动: ' + String(e.message).slice(0, 50)));
  await page.waitForTimeout(1200);
  out('  抽屉几何: ' + await page.evaluate(() => {
    const d = document.querySelector('.character-list');
    const r = d.getBoundingClientRect();
    const main = document.querySelector('.chat-main');
    return JSON.stringify({ x: Math.round(r.x), w: Math.round(r.width),
      主区inert: main.hasAttribute('inert') || main.inert,
      charRow数: d.querySelectorAll('.char-row').length,
      charRow标签: (d.querySelector('.char-row') || {}).tagName });
  }));
  const rows = page.locator('.char-row');
  const n = await rows.count();
  out(`  char-row 数 = ${n}`);
  if (n) {
    await rows.first().click({ timeout: 4000 }).catch(e => out('  选角色失败: ' + String(e.message).slice(0, 50)));
    await page.waitForTimeout(1800);
    out(`  气泡数 = ${await page.locator('.msg-bubble').count()}  抽屉x=${await page.evaluate(() => Math.round((document.querySelector('.character-list') || { getBoundingClientRect: () => ({ x: 999 }) }).getBoundingClientRect().x))}`);
  }
  const bub = page.locator('.msg-bubble').nth(1);
  if (await bub.count()) {
    const box = await bub.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(900);
    out('  长按结果: ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel, .message-action-sheet, [role="dialog"]');
      if (!s) return '面板没出现';
      const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
      const btns = [...s.querySelectorAll('button')];
      return JSON.stringify({
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width),
        贴底: Math.abs(innerHeight - r.bottom) < 3, 定位: cs.position, z: cs.zIndex,
        按钮: btns.map(x => { const q = x.getBoundingClientRect(); return `${Math.round(q.height)}`; }).join(','),
        按钮数: btns.length,
        读键盘inset: /keyboard-inset/.test(s.getAttribute('style') || '') || /keyboard-inset/.test(String(cs.transform)),
      });
    }));
    await page.screenshot({ path: '/tmp/sheet390.png' });
  }
  await browser.close();
}

// ── C. toast 与聊天页头是否重叠 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ C. Toast 与 /chat 页头是否重叠 ════');
  await go(page, '/chat');
  const hdr = await page.evaluate(() => { const h = document.querySelector('.chat-header'); const r = h.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
  out('  .chat-header = ' + JSON.stringify(hdr));
  // 触发一个 toast：点导出对话（无会话时可能报错弹 toast）
  const labels = ['导出对话', '切换上下文面板', '搜索对话消息', '打开角色列表'];
  for (const l of labels) {
    const b = page.getByRole('button', { name: l }).first();
    if (!(await b.count())) continue;
    await b.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const el = document.querySelector('.toast, [class*="toast"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const h = document.querySelector('.chat-header');
      const hr = h ? h.getBoundingClientRect() : null;
      return JSON.stringify({ 触发: '', top: Math.round(r.top), bottom: Math.round(r.bottom), 宽: Math.round(r.width),
        与页头重叠px: hr ? Math.max(0, Math.min(r.bottom, hr.bottom) - Math.max(r.top, hr.top)) : null,
        页头底部: hr ? Math.round(hr.bottom) : null });
    });
    if (t) { out(`  点「${l}」→ ${t}`); break; }
  }
  await browser.close();
}
