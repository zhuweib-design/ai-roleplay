// 手机端体检：种一份有数据的库，逐路由按几何判据扫问题 + 截图
// 用法：node tmp-mobile-audit.mjs <baseURL> [width] [height]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5199/';
const W = Number(process.argv[3] ?? 390);
const H = Number(process.argv[4] ?? 844);
const OUT = `artifacts/mobile-audit-${W}`;
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['chat', '/chat'], ['characters', '/character'], ['charEdit', '/character/new'],
  ['worldbook', '/worldbook'], ['group', '/group'], ['databank', '/databank'],
  ['story', '/story'], ['randomEvents', '/random-events'], ['market', '/community-market'],
  ['localModel', '/local-model'], ['imageGen', '/image-gen'], ['archives', '/archives'],
  ['guide', '/guide'], ['more', '/more'], ['settings', '/settings'],
  ['settingsModel', '/settings?cat=model'], ['settingsData', '/settings?cat=data'],
  ['settingsAppearance', '/settings?cat=appearance'],
];

const SEED = `(function(){
  var now = new Date().toISOString();
  var mk = function(id, name, i){
    return { id:id, name:name, description:'一位来自'+name+'的旅人，话不多但记事。', personality:'冷静、克制、偶尔毒舌',
      scenario:'酒馆打烊后的深夜', firstMessage:'「还醒着？」', alternateGreetings:[], exampleMessages:'',
      characterNote:null, talkativeness:50, tags:['奇幻','日常'], favorite:i===0, version:'1.0',
      createdAt:now, updatedAt:now, messages:[] };
  };
  var chars = [mk('c1','卡尔文·夜莺',0), mk('c2','白栖',1), mk('c3','机械师·诺',2)];
  var msgs = [];
  for (var i=0;i<24;i++){
    msgs.push({ id:'m'+i, role: i%2?'assistant':'user',
      content: i%2 ? '「这条消息用来量手机上的行长与气泡宽度，故意写长一点，看看三行以后会不会把输入条顶下去。」'
                   : '接着上一句继续。',
      timestamp: new Date(Date.now()-((24-i)*60000)).toISOString(), swipes:[], swipeIndex:0 });
  }
  var chat = { id:'chat1', characterId:'c1', title:'深夜酒馆的第一夜', messages:msgs,
    createdAt:now, updatedAt:now };
  var lb = { id:'lb1', name:'夜莺城设定集', description:'主城与势力', scope:'global',
    entries: [1,2,3,4,5,6].map(function(n){ return {
      id:'e'+n, title:'关键词条目 '+n, keys:['夜莺城'+n], content:'这里是第'+n+'条设定的正文内容，用来撑开条目列表。',
      strategy:'constant', probability:100, insertionOrder:100, insertionPosition:'atDepth', depth:4,
      enabled:true, caseSensitive:false, group:'', priority:100, createdAt:now, updatedAt:now }; }),
    createdAt:now, updatedAt:now };
  var members = chars.map(function(c){ return { characterId:c.id, name:c.name, joinedAt:now, allowAutoSelect:true }; });
  var g = { id:'g1', name:'打烊之后的三个人', description:'', members:members, firstMessage:'「都到齐了。」',
    messages: msgs.slice(0,8).map(function(m,i){ var o=Object.assign({},m); o.characterId=chars[i%3].id; o.characterName=chars[i%3].name; return o; }),
    mode:'natural', lastSpeakerId:null, createdAt:now, updatedAt:now, lifecycleStatus:'active', archivedAt:null };
  return new Promise(function(resolve){
    var req = indexedDB.open('ai-roleplay');
    req.onsuccess = function(){
      var db = req.result;
      var tx = db.transaction(['characters','chats','lorebooks','groups'],'readwrite');
      chars.forEach(function(c){ tx.objectStore('characters').put(c); });
      tx.objectStore('chats').put(chat);
      tx.objectStore('lorebooks').put(lb);
      tx.objectStore('groups').put(g);
      tx.oncomplete = function(){ db.close(); resolve('ok'); };
    };
  });
})()`;

const PROBE = `(function(){
  var vw = window.innerWidth, vh = window.innerHeight;
  var out = { vw:vw, vh:vh, overflow: document.documentElement.scrollWidth - vw,
    squeezed: [], smallTargets: [], zoomInputs: [], fixedBottom: [] };
  function vis(e){
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = getComputedStyle(e);
    return !(cs.visibility==='hidden' || cs.display==='none' || Number(cs.opacity)===0);
  }
  var all = document.querySelectorAll('body *');
  for (var i=0;i<all.length;i++){
    var e = all[i];
    if (!vis(e)) continue;
    var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    var txt = (e.textContent||'').trim();
    var kids = e.children.length;
    // 竖排/挤压：自己持有短文字却被压得很窄
    if (kids === 0 && txt && txt.length <= 12){
      var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)*1.4 || 16;
      var lines = Math.round(r.height / lh);
      if (lines >= 3 && r.width < 80) out.squeezed.push(txt.slice(0,10)+' ['+Math.round(r.width)+'x'+Math.round(r.height)+' '+lines+'行]');
    }
    // 触摸目标过小
    var tag = e.tagName;
    if (tag==='BUTTON'||tag==='A'||tag==='SELECT'||tag==='INPUT'||e.getAttribute('role')==='button'){
      if (r.width < 44 || r.height < 44){
        var label = (e.getAttribute('aria-label')||txt||e.getAttribute('placeholder')||tag).slice(0,18);
        out.smallTargets.push(label+' ('+Math.round(r.width)+'x'+Math.round(r.height)+')');
      }
    }
    // 输入框字号 <16px → iOS 聚焦缩放
    if ((tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') && parseFloat(cs.fontSize) < 16){
      out.zoomInputs.push((e.id||e.name||tag)+' '+cs.fontSize);
    }
    // 固定/吸底元素
    if (cs.position === 'fixed' && r.bottom > vh - 120 && r.height > 20 && r.width > vw*0.5){
      out.fixedBottom.push(tag+'.'+(e.className||'').toString().split(' ')[0]+' h='+Math.round(r.height)+' bottom='+Math.round(r.bottom));
    }
  }
  out.squeezed = out.squeezed.slice(0,8);
  out.smallTargets = out.smallTargets.slice(0,12);
  return out;
})()`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: 'zh-CN',
  isMobile: W <= 640, hasTouch: W <= 640,
});
await ctx.addInitScript(() => localStorage.setItem('ai-roleplay:onboarding-done', '1'));
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1500);
console.log('seed =', await page.evaluate(SEED));

for (const [name, route] of ROUTES) {
  await page.goto(BASE.replace(/\/$/, '') + route, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const p = await page.evaluate(PROBE);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const flags = [];
  if (p.overflow > 0) flags.push(`溢出+${p.overflow}px`);
  if (p.squeezed.length) flags.push(`挤压${p.squeezed.length}`);
  if (p.smallTargets.length) flags.push(`小目标${p.smallTargets.length}`);
  if (p.zoomInputs.length) flags.push(`缩放输入${p.zoomInputs.length}`);
  console.log(`\n## ${name} ${route}  ${flags.length ? '⚠ ' + flags.join(' / ') : '✓'}`);
  if (p.squeezed.length) console.log('  挤压:', p.squeezed.join(' | '));
  if (p.zoomInputs.length) console.log('  字号<16:', p.zoomInputs.slice(0,6).join(' | '));
  if (p.smallTargets.length) console.log('  小目标:', p.smallTargets.slice(0,8).join(' | '));
  if (p.fixedBottom.length) console.log('  吸底:', [...new Set(p.fixedBottom)].join(' | '));
}
await browser.close();
console.log('\n截图目录:', OUT);
