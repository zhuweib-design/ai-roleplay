import { chromium } from '@playwright/test';
const BASE='http://localhost:5199/';
const b=await chromium.launch({channel:'msedge'});
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
await ctx.addInitScript(()=>localStorage.setItem('ai-roleplay:onboarding-done','1'));
const p=await ctx.newPage();
await p.goto(BASE,{waitUntil:'load'}); await p.waitForTimeout(1500);
await p.evaluate(`(function(){var now=new Date().toISOString();
var mk=function(i){return{id:'c'+i,name:'角色'+i,description:'一位来自远方的旅人，话不多但记事，偶尔毒舌。',personality:'冷静',scenario:'深夜',firstMessage:'「还醒着？」',alternateGreetings:[],exampleMessages:'',characterNote:null,talkativeness:50,tags:['奇幻','日常'],favorite:false,version:'1.0',createdAt:now,updatedAt:now,messages:[]};};
return new Promise(function(r){var q=indexedDB.open('ai-roleplay');q.onsuccess=function(){var db=q.result;var tx=db.transaction(['characters'],'readwrite');for(var i=0;i<8;i++)tx.objectStore('characters').put(mk(i));tx.oncomplete=function(){db.close();r('ok');};};});})()`);
await p.goto(BASE+'character',{waitUntil:'load'}); await p.waitForTimeout(1500);
console.log(await p.evaluate(()=>{
  const vh=innerHeight;
  const cards=[...document.querySelectorAll('.character-card,.char-card,.card')].filter(e=>e.getBoundingClientRect().height>80);
  const c=cards[0];
  const blocks=[...document.querySelectorAll('body *')].filter(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    return r.height>24&&r.width>300&&cs.display!=='none'&&cs.position!=='fixed';});
  const roots=blocks.filter(e=>!blocks.some(o=>o!==e&&o.contains(e)&&Math.abs(o.getBoundingClientRect().height-e.getBoundingClientRect().height)<8));
  return JSON.stringify({ cardCount:cards.length, cardH: c?Math.round(c.getBoundingClientRect().height):null,
    cardsPerScreen: c? +(vh/c.getBoundingClientRect().height).toFixed(1):null,
    blocks: roots.map(e=>`${String(e.className||e.tagName).split(' ')[0].slice(0,24).padEnd(24)} h=${Math.round(e.getBoundingClientRect().height).toString().padStart(4)} ${(e.getBoundingClientRect().height/vh*100).toFixed(0)}%`) },null,1);
}));
await b.close();
