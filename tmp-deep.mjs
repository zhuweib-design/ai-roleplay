// 手机端深挖：横屏 / 弹层几何 / 底部导航稳定性 / 抽屉与层级 / 长按面板
import { phone, go } from './tmp-seed.mjs';

const PROBE = `(function(){
  var vw=innerWidth, vh=innerHeight;
  var out={vw:vw,vh:vh,overflow:document.documentElement.scrollWidth-vw,squeezed:[],small:0,smallShort:[]};
  function vis(e){var r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;var cs=getComputedStyle(e);
    return !(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0);}
  var all=document.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){var e=all[i];if(!vis(e))continue;
    var r=e.getBoundingClientRect(), cs=getComputedStyle(e), txt=(e.textContent||'').trim();
    if(e.children.length===0&&txt&&txt.length<=12){
      var lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4||16;
      var lines=Math.round(r.height/lh);
      if(lines>=3&&r.width<80) out.squeezed.push(txt.slice(0,10)+' ['+Math.round(r.width)+'x'+Math.round(r.height)+']');
    }
    var t=e.tagName;
    if(t==='BUTTON'||t==='A'||t==='SELECT'||t==='INPUT'||e.getAttribute('role')==='button'){
      if(r.height<44||r.width<44){ out.small++;
        if(out.smallShort.length<6) out.smallShort.push(((e.getAttribute('aria-label')||txt||t)+'').slice(0,14)+' '+Math.round(r.width)+'x'+Math.round(r.height)); }
    }
  }
  out.squeezed=out.squeezed.slice(0,6);
  return out;
})()`;

const out = (...a) => console.log(...a);
const J = (o) => JSON.stringify(o);

// ── 1. 横屏 844x390 ──────────────────────────────────────────
{
  const { browser, page } = await phone({ width: 844, height: 390, touch: false });
  out('\n════ 1. 横屏 844×390（landscape） ════');
  out('断点令牌里有 --bp-landscape-h:480 / --bp-landscape-w:900，这档专测它');
  for (const [name, route] of [['chat','/chat'],['group','/group'],['worldbook','/worldbook'],['settings','/settings'],['characters','/character']]) {
    await go(page, route);
    const p = await page.evaluate(PROBE);
    const layout = await page.evaluate(() => {
      const vh = innerHeight;
      const pick = (s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return Math.round(r.height); };
      return JSON.stringify({
        消息区: pick('.chat-messages,.messages-area'), 群头部: pick('.group-header'),
        导航: pick('.bottom-nav,.nav-rail'), 页头: pick('.chat-header,.page-header'),
        就绪条: pick('.readiness-bar'), 内容容器: pick('.main-content,.view-content,.app-main'),
        尺: vh,
      });
    });
    out(`  ${name.padEnd(11)} 溢出+${p.overflow} 挤压${p.squeezed.length} 小目标${p.small}  ${layout}`);
    if (p.squeezed.length) out('     挤压: ' + p.squeezed.join(' | '));
  }
  await browser.close();
}

// ── 2. 弹层几何（390×844） ──────────────────────────────────
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ 2. 弹层 = 居中对话框 还是 底部抽屉？ ════');
  await go(page, '/worldbook');
  const triggers = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => t && t.length <= 12).slice(0, 40));
  out('  世界书页按钮（前 24 个）:', J(triggers.slice(0, 24)));
  // 试几个可能的弹层入口
  for (const label of ['新建', '新建世界书', 'AI 生成', '删除', '删除世界书', '导出 JSON']) {
    const btn = page.getByRole('button', { name: label, exact: false }).first();
    if (!(await btn.count())) { out(`  「${label}」不存在`); continue; }
    try {
      await btn.click({ timeout: 2500 });
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"], .modal, .modal-panel, .sheet-panel, .confirm-dialog');
        if (!dlg) return '无弹层';
        const r = dlg.getBoundingClientRect(), cs = getComputedStyle(dlg);
        const scroll = [...dlg.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 40).length;
        return JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
          居中: Math.abs(r.top - (innerHeight - r.height) / 2) < 8, 贴底: Math.abs(innerHeight - r.bottom) < 3,
          圆角: cs.borderTopLeftRadius, 定位: cs.position, 内部可滚容器: scroll, 视口: innerHeight });
      });
      out(`  「${label}」→ ${m}`);
      await page.screenshot({ path: `/tmp/modal-${encodeURIComponent(label)}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (e) { out(`  「${label}」点击失败: ${String(e.message).slice(0, 60)}`); }
  }
  await browser.close();
}

// ── 3. 底部导航稳定性 ───────────────────────────────────────
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ 3. 底部导航在长页面上会不会被滚走 ════');
  await go(page, '/settings?cat=model');
  const before = await page.evaluate(() => { const n = document.querySelector('.bottom-nav'); return n ? Math.round(n.getBoundingClientRect().bottom) : null; });
  out(`  滚动前 bottom-nav.bottom = ${before}（视口 ${await page.evaluate(() => innerHeight)}）`);
  const scrolled = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('body *')].filter(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 200);
    const t = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!t) return '无可滚容器';
    t.scrollTop = t.scrollHeight;
    return `${t.tagName}.${String(t.className || '').split(' ')[0]} ${t.clientHeight}→${t.scrollHeight} 已滚到底`;
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => { const n = document.querySelector('.bottom-nav'); return n ? JSON.stringify({ bottom: Math.round(n.getBoundingClientRect().bottom), pos: getComputedStyle(n).position }) : null; });
  out(`  ${scrolled}`);
  out(`  滚动后 bottom-nav = ${after}`);
  await browser.close();
}

// ── 4. 抽屉：关闭态是否吃触摸 / 层级 ────────────────────────
{
  const { browser, page } = await phone({ width: 390, height: 844 });
  out('\n════ 4. 抽屉关闭态 + 层级 ════');
  await go(page, '/chat');
  const info = await page.evaluate(() => {
    const out = {};
    const z = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).zIndex : null; };
    out.层级 = { 抽屉: z('.character-list'), 遮罩: z('.drawer-mask,.scrim,.overlay'), toast: z('.tk-tip'), 底部导航: z('.bottom-nav') };
    const cl = document.querySelector('.character-list');
    out.关闭态 = cl ? { inert: cl.hasAttribute('inert') || cl.inert, ariaHidden: cl.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(cl).pointerEvents, x: Math.round(cl.getBoundingClientRect().x) } : 'ABSENT';
    const main = document.querySelector('.chat-main');
    out.主区 = main ? { inert: main.hasAttribute('inert') || main.inert } : 'ABSENT';
    return out;
  });
  out('  ' + J(info, null, 1).replace(/\n/g, '\n  '));
  // 关闭态抽屉是否吞掉左侧的点击
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(6, 400);
    return el ? el.tagName + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : null;
  });
  out(`  关闭态 x=6,y=400 命中的元素 = ${hit}（若是抽屉，就是"关着还在吃触摸"）`);
  await browser.close();
}
