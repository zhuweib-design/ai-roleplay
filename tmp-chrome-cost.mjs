import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5199/';
const b = await chromium.launch({ channel:'msedge' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'zh-CN' });
await ctx.addInitScript(()=>localStorage.setItem('ai-roleplay:onboarding-done','1'));
const p = await ctx.newPage();
for (const [name,route] of [['chat','/chat'],['group','/group'],['worldbook','/worldbook']]) {
  await p.goto(BASE.replace(/\/$/,'')+route,{waitUntil:'load'}); await p.waitForTimeout(1200);
  console.log(name, await p.evaluate(()=>{
    const vh = innerHeight, vw = innerWidth, o = {vh, vw};
    const nav = document.querySelector('.bottom-nav');
    o.bottomNav = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
    // 首屏内、第一条内容出现前的所有"chrome"高度：取主要内容容器顶边
    const main = document.querySelector('.chat-messages,.group-messages,.wb-detail,.main-content,.view-content');
    o.contentTop = main ? Math.round(main.getBoundingClientRect().top) : null;
    o.contentH = main ? Math.round(main.getBoundingClientRect().height) : null;
    o.ratio = main ? Math.round(main.getBoundingClientRect().height / vh * 100)+'%' : null;
    // 详情区顶边（区分"列表在上、详情在下"）
    const d = document.querySelector('.wb-detail,.lorebook-detail,.group-detail');
    o.detailTop = d ? Math.round(d.getBoundingClientRect().top) : 'n/a';
    return JSON.stringify(o);
  }));
}
await b.close();
