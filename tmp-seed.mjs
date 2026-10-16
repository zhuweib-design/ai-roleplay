// 手机端深挖用的共用件：种数据 + 建一个手机上下文
import { chromium } from '@playwright/test';

export const BASE = process.env.BASE ?? 'http://localhost:5199/';

/** 往 IndexedDB 里种一份像样的库：3 角色 / 1 单聊 / 2 群聊 / 1 世界书 / 1 数据银行文档 */
export const SEED = `(function(){
  var now = new Date().toISOString();
  function mkChar(id, name, i){
    return { id:id, name:name, description:'一位来自'+name+'的旅人，话不多但记事，偶尔毒舌。',
      personality:'冷静、克制', scenario:'酒馆打烊后的深夜', firstMessage:'「还醒着？」',
      alternateGreetings:['「第二句开场。」','「第三句开场。」'], exampleMessages:'',
      characterNote:null, talkativeness:50, tags:['奇幻','日常'], favorite:i===0, version:'1.0',
      createdAt:now, updatedAt:now, messages:[] };
  }
  var chars = [mkChar('c1','卡尔文·夜莺',0), mkChar('c2','白栖',1), mkChar('c3','机械师·诺',2), mkChar('c4','Lyra',3)];
  function mkMsg(i, who){
    return { id:'m'+i, role: i%2 ? 'assistant':'user',
      content: i%2 ? '「这条用来量手机上的行长与气泡宽度，故意写长一点，看看三行以后会不会把输入条顶下去。」' : '接着上一句继续。',
      timestamp: new Date(Date.now()-((40-i)*60000)).toISOString(), swipes:[], swipeIndex:0,
      characterId: who ? who.id : undefined, characterName: who ? who.name : undefined };
  }
  var msgs = []; for (var i=0;i<30;i++) msgs.push(mkMsg(i));
  var chats = chars.slice(0,2).map(function(c,ci){
    return { id:'chat'+ci, characterId:c.id, title:c.name+' 的会话',
      messages: msgs.map(function(m,i){ var o=Object.assign({},m); o.id='chat'+ci+'-m'+i; return o; }),
      createdAt:now, updatedAt:new Date(Date.now()-ci*3600000).toISOString() };
  });
  var lb = { id:'lb1', name:'夜莺城设定集', description:'主城与势力', scope:'global',
    entries: [1,2,3,4,5,6,7,8].map(function(n){ return {
      id:'e'+n, title:'关键词条目 '+n, keys:['夜莺城'+n],
      content:'这里是第'+n+'条设定的正文内容，用来撑开条目列表并占出足够的高度。',
      strategy:'constant', probability:100, insertionOrder:100, insertionPosition:'atDepth', depth:4,
      enabled:true, caseSensitive:false, group:'', priority:100, createdAt:now, updatedAt:now }; }),
    createdAt:now, updatedAt:now };
  function mkGroup(id, name, n){
    var members = chars.slice(0,n).map(function(c){ return { characterId:c.id, name:c.name, joinedAt:now, allowAutoSelect:true }; });
    return { id:id, name:name, description:'', members:members, firstMessage:'「都到齐了。」',
      messages: msgs.slice(0,10).map(function(m,i){ var o=Object.assign({},m); o.id=id+'-m'+i; o.characterId=chars[i%n].id; o.characterName=chars[i%n].name; return o; }),
      mode:'natural', lastSpeakerId:null, createdAt:now, updatedAt:now, lifecycleStatus:'active', archivedAt:null };
  }
  var groups = [mkGroup('g1','打烊之后的三个人',3), mkGroup('g2','四个人的长桌',4)];
  return new Promise(function(resolve){
    var req = indexedDB.open('ai-roleplay');
    req.onsuccess = function(){
      var db = req.result;
      var tx = db.transaction(['characters','chats','lorebooks','groups'],'readwrite');
      chars.forEach(function(c){ tx.objectStore('characters').put(c); });
      chats.forEach(function(c){ tx.objectStore('chats').put(c); });
      tx.objectStore('lorebooks').put(lb);
      groups.forEach(function(g){ tx.objectStore('groups').put(g); });
      tx.oncomplete = function(){ db.close(); resolve('ok'); };
    };
  });
})()`;

export async function phone({ width = 390, height = 844, touch = true, seed = true } = {}) {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN',
    isMobile: touch && width <= 640, hasTouch: touch,
  });
  await ctx.addInitScript(() => localStorage.setItem('ai-roleplay:onboarding-done', '1'));
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  if (seed) await page.evaluate(SEED);
  return { browser, ctx, page };
}

export const go = async (page, route, ms = 1300) => {
  await page.goto(BASE.replace(/\/$/, '') + route, { waitUntil: 'load' });
  await page.waitForTimeout(ms);
};
