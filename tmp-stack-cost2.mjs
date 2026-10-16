import { chromium } from '@playwright/test';
const BASE='http://127.0.0.1:5199/';
const b = await chromium.launch({ channel:'msedge' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'zh-CN' });
await ctx.addInitScript(()=>localStorage.setItem('ai-roleplay:onboarding-done','1'));
const p = await ctx.newPage();
await p.goto(BASE,{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(`(function(){var now=new Date().toISOString();
var mk=function(id,name,i){return{id:id,name:name,description:'旅人',personality:'冷静',scenario:'深夜',firstMessage:'「还醒着？」',alternateGreetings:[],exampleMessages:'',characterNote:null,talkativeness:50,tags:['奇幻'],favorite:i===0,version:'1.0',createdAt:now,updatedAt:now,messages:[]};};
var chars=[mk('c1','卡尔文',0),mk('c2','白栖',1),mk('c3','诺',2)];
var lb={id:'lb1',name:'夜莺城设定集',description:'主城与势力',scope:'global',entries:[1,2,3,4,5,6].map(function(n){return{id:'e'+n,title:'条目'+n,keys:['x'+n],content:'正文',strategy:'constant',probability:100,insertionOrder:100,insertionPosition:'atDepth',depth:4,enabled:true,caseSensitive:false,group:'',priority:100,createdAt:now,updatedAt:now};}),createdAt:now,updatedAt:now};
var members=chars.map(function(c){return{characterId:c.id,name:c.name,joinedAt:now,allowAutoSelect:true};});
var msgs=[1,2,3,4,5,6,7,8].map(function(i){return{id:'m'+i,role:i%2?'assistant':'user',content:'消息 '+i,timestamp:now,swipes:[],swipeIndex:0,characterId:chars[i%3].id,characterName:chars[i%3].name};});
var g={id:'g1',name:'打烊之后的三个人',description:'',members:members,firstMessage:'「都到齐了。」',messages:msgs,mode:'natural',lastSpeakerId:null,createdAt:now,updatedAt:now,lifecycleStatus:'active',archivedAt:null};
return new Promise(function(r){var q=indexedDB.open('ai-roleplay');q.onsuccess=function(){var db=q.result;var tx=db.transaction(['characters','lorebooks','groups'],'readwrite');chars.forEach(function(c){tx.objectStore('characters').put(c);});tx.objectStore('lorebooks').put(lb);tx.objectStore('groups').put(g);tx.oncomplete=function(){db.close();r('ok');};};});})()`);
for (const [name,route] of [['group','/group'],['worldbook','/worldbook']]) {
  await p.goto(BASE.replace(/\/$/,'')+route,{waitUntil:'load'}); await p.waitForTimeout(1400);
  // 若在列表页则点进第一项
  const item = p.locator('.group-item, .lorebook-item, .wb-item, .list-item').first();
  if (await item.count()) { await item.click().catch(()=>{}); await p.waitForTimeout(1200); }
  console.log('\n==', name, await p.evaluate(()=>{
    const de=document.documentElement;
    const scr=[...document.querySelectorAll('body *')].filter(e=>e.scrollHeight>e.clientHeight+8&&e.clientHeight>80)
      .map(e=>`${e.tagName}.${String(e.className||'').split(' ')[0]||'(none)'} ${e.clientHeight}→${e.scrollHeight}`);
    const inp=document.querySelector('textarea,input[type=text]');
    return JSON.stringify({ docScroll:de.scrollHeight, vh:innerHeight, scrollers:scr,
      composerTop: inp?Math.round(inp.getBoundingClientRect().top):null,
      firstBubbleTop: (()=>{const m=document.querySelector('.msg-bubble,.message-bubble,.group-msg,.bubble');return m?Math.round(m.getBoundingClientRect().top):null;})() },null,1);
  }));
}
await b.close();
