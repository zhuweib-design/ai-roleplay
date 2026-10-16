// 深挖 第六轮：修好选择器测长按面板 + 模拟软键盘（布局视口收缩）+ 抽屉打开后的 inert
import { phone, go } from './tmp-seed.mjs';
const out = (...a) => console.log(...a);

// ── A. 长按面板几何（选择器修对） ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ A. 长按消息面板 ════');
  await go(page, '/chat');
  await page.locator('.chat-header .mobile-menu-btn').first().click({ timeout: 4000 }).catch(e => out('  开抽屉失败: ' + String(e.message).slice(0, 60)));
  await page.waitForTimeout(1200);
  out('  开抽屉后: ' + await page.evaluate(() => {
    const d = document.querySelector('.character-list');
    const main = document.querySelector('.chat-main');
    return JSON.stringify({ 抽屉x: Math.round(d.getBoundingClientRect().x),
      主区inert: main.hasAttribute('inert') || main.inert,
      抽屉inert: d.hasAttribute('inert') || d.inert });
  }));
  await page.locator('.char-row').first().click({ timeout: 4000 }).catch(e => out('  选角色失败: ' + String(e.message).slice(0, 60)));
  await page.waitForTimeout(1800);
  out(`  气泡数=${await page.locator('.msg-bubble').count()}`);
  const bub = page.locator('.msg-bubble').nth(1);
  if (await bub.count()) {
    const box = await bub.boundingBox();
    out(`  待长按气泡 ${Math.round(box.width)}x${Math.round(box.height)} @ (${Math.round(box.x)},${Math.round(box.y)})`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(900);
    out('  长按结果: ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel, .message-action-sheet, [role="dialog"]');
      if (!s) return '面板没出现（手机端长按是否可用？）';
      const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
      const btns = [...s.querySelectorAll('button')].map(x => { const q = x.getBoundingClientRect(); return `${(x.textContent || '').trim().slice(0, 4)}:${Math.round(q.width)}x${Math.round(q.height)}`; });
      return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width),
        贴底: Math.abs(innerHeight - r.bottom) < 3, 定位: cs.position, z: cs.zIndex, 按钮: btns,
        transform: cs.transform, inset: cs.getPropertyValue('--keyboard-inset') || '未设置' });
    }));
    await page.screenshot({ path: '/tmp/sheet390.png' });
  }
  await browser.close();
}

// ── B. 模拟软键盘：Android 走 adjustResize ⇒ 布局视口收缩 ──
{
  const { browser, ctx, page } = await phone({ width: 390, height: 844 });
  out('\n════ B. 模拟软键盘（布局视口 844→500，等同安卓 adjustResize）════');
  await go(page, '/chat', 1500);
  const before = await page.evaluate(() => {
    const f = document.querySelector('.chat-footer, .input-area');
    const m = document.querySelector('.chat-messages, .messages-area');
    const n = document.querySelector('.bottom-nav');
    return JSON.stringify({ 输入条: f ? Math.round(f.getBoundingClientRect().bottom) : null,
      消息区高: m ? Math.round(m.getBoundingClientRect().height) : null,
      导航顶: n ? Math.round(n.getBoundingClientRect().top) : null, 视口: innerHeight });
  });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => {
    const f = document.querySelector('.chat-footer, .input-area');
    const m = document.querySelector('.chat-messages, .messages-area');
    const n = document.querySelector('.bottom-nav');
    return JSON.stringify({ 输入条底: f ? Math.round(f.getBoundingClientRect().bottom) : null,
      消息区高: m ? Math.round(m.getBoundingClientRect().height) : null,
      导航顶: n ? Math.round(n.getBoundingClientRect().top) : null, 视口: innerHeight,
      keyboardInset: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim() || '未设置',
      页脚transform: f ? getComputedStyle(f).transform : null });
  });
  out('  收缩前: ' + before);
  out('  收缩后: ' + after);
  await page.setViewportSize({ width: 390, height: 844 });
  await browser.close();
}

// ── C. 群聊页在同一个模拟下 ──
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ C. 群聊页：模拟键盘 + 长按 ════');
  await go(page, '/group');
  await page.locator('.group-item, .list-item, .char-row').first().click({ timeout: 4000 }).catch(e => out('  进群失败: ' + String(e.message).slice(0, 50)));
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => { const e = document.querySelector('.messages-area'); return e ? Math.round(e.getBoundingClientRect().height) : null; });
  out(`  进群后消息区高 = ${m}`);
  const gb = page.locator('.group-msg, .msg-bubble').nth(1);
  if (await gb.count()) {
    const box = await gb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(800);
    out('  群聊长按: ' + await page.evaluate(() => {
      const s = document.querySelector('.sheet-panel, .message-action-sheet, [role="dialog"]');
      if (!s) return '面板没出现';
      const r = s.getBoundingClientRect();
      return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), 贴底: Math.abs(innerHeight - r.bottom) < 3,
        按钮高: [...s.querySelectorAll('button')].map(x => Math.round(x.getBoundingClientRect().height)).join(',') });
    }));
  } else out('  群聊没有气泡可长按');
  await page.setViewportSize({ width: 390, height: 500 }); await page.waitForTimeout(700);
  out('  视口缩到 500 后群聊: ' + await page.evaluate(() => {
    const mA = document.querySelector('.messages-area'), ia = document.querySelector('.input-area');
    return JSON.stringify({ 消息区高: mA ? Math.round(mA.getBoundingClientRect().height) : null,
      输入条底: ia ? Math.round(ia.getBoundingClientRect().bottom) : null, 视口: innerHeight });
  }));
  await browser.close();
}
