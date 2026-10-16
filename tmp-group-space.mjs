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
var msgs=[1,2,3,4,5,6,7,8].map(function(i){return{id:'m'+i,role:i%2?'assistant':'user',content:'消息内容 '+i,timestamp:now,swipes:[],swipeIndex:0,characterId:chars[i%3].id,characterName:chars[i%3].name};});
var g={id:'g1',name:'打烊之后的三个人',description:'',members:chars.map(function(c){return{characterId:c.id,name:c.name,joinedAt:now,allowAutoSelect:true};}),firstMessage:'「都到齐了。」',messages:msgs,mode:'natural',lastSpeakerId:null,createdAt:now,updatedAt:now,lifecycleStatus:'active',archivedAt:null};
return new Promise(function(r){var q=indexedDB.open('ai-roleplay');q.onsuccess=function(){var db=q.result;var tx=db.transaction(['characters','groups'],'readwrite');chars.forEach(function(c){tx.objectStore('characters').put(c);});tx.objectStore('groups').put(g);tx.oncomplete=function(){db.close();r('ok');};};});})()`);
await p.goto(BASE+'group',{waitUntil:'load'}); await p.waitForTimeout(1600);
await p.locator('.group-item,.list-item').first().click().catch(()=>{});
await p.waitForTimeout(1600);
console.log(await p.evaluate(()=>{
  const out=[]; const vh=innerHeight;
  // 取页面上所有 >24px 高的直接区块，按 y 排序，算每块占多少屏
  const nodes=[...document.querySelectorAll('body *')].filter(e=>{
    const r=e.getBoundingClientRect(), cs=getComputedStyle(e);
    return r.height>24 && r.width>300 && cs.display!=='none' && cs.position!=='fixed';
  });
  // 只保留"最外层"块：父节点不是同样大小的块
  const roots=nodes.filter(e=>!nodes.some(o=>o!==e && o.contains(e) && Math.abs(o.getBoundingClientRect().height-e.getBoundingClientRect().height)<8));
  for (const e of roots){ const r=e.getBoundingClientRect();
    out.push(`${String(e.className||e.tagName).split(' ')[0].slice(0,26).padEnd(26)} y=${Math.round(r.top).toString().padStart(4)} h=${Math.round(r.height).toString().padStart(4)} ${(r.height/vh*100).toFixed(0)}%`); }
  return out.join('\n');
}));
await b.close();
