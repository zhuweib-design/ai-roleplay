import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:5199/';
const b = await chromium.launch({ channel: 'msedge' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'zh-CN' });
await ctx.addInitScript(() => localStorage.setItem('ai-roleplay:onboarding-done','1'));
const p = await ctx.newPage();
await p.goto(BASE+'chat', { waitUntil:'load' }); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const sel = ['.app-layout','.character-list','.chat-main','.context-panel','.chat-composer','.chat-input','.chat-messages','.nav-rail','.bottom-nav','.app-nav'];
  const o = {};
  for (const s of sel){
    const e = document.querySelector(s);
    if (!e) { o[s] = 'ABSENT'; continue; }
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    o[s] = `x=${Math.round(r.x)} w=${Math.round(r.width)} h=${Math.round(r.height)} pos=${cs.position} z=${cs.zIndex} tf=${cs.transform.slice(0,28)} vis=${cs.visibility} opacity=${cs.opacity}`;
  }
  o.__bodyChildren = [...document.body.children].map(e => e.tagName+'.'+String(e.className||'').split(' ')[0]);
  o.__layoutChildren = [...(document.querySelector('.app-layout')?.children||[])].map(e => e.tagName+'.'+String(e.className||'').split(' ').join('.'));
  const ta = document.querySelector('textarea,.chat-input');
  if (ta) { const cs=getComputedStyle(ta); o.__textarea = `fs=${cs.fontSize} h=${Math.round(ta.getBoundingClientRect().height)}`; }
  o.__scrollables = [...document.querySelectorAll('body *')].filter(e=>e.scrollHeight>e.clientHeight+4 && e.clientHeight>60).map(e=>e.tagName+'.'+String(e.className||'').split(' ')[0]+' '+e.clientHeight+'/'+e.scrollHeight).slice(0,8);
  return JSON.stringify(o,null,1);
}));
await b.close();
