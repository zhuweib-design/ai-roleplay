import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 窄屏"竖排挤压"回归网（2026-10-16）
 *
 * 起因：真机上连着量到三处同类缺陷——群聊头部标题 4 个字被压成 21×154（6 行）、
 * 世界书页头"世界书"被压成 20×96、设置页数据面板"创建并切换"被压成 22×85，
 * 外加社区市场"登录"按钮 42×48。共同成因都是 flex 行里没给文字元素
 * `min-width:0` / `white-space:nowrap` / 容器 `flex-wrap`，于是按比例一起缩。
 *
 * 判据只问浏览器算出来的几何，不看 CSS 写了什么（静态守卫量不到 flex 收缩）：
 * 某元素**自己**持有 ≤10 个字符的文字、按内容盒折算 ≥3 行、内容盒宽 <64px ⇒ 竖排。
 *
 * 三个校准过的点，改之前先读懂，否则这张网会变瞎或全是噪声：
 * 1. 行数必须按**内容盒**算。第一版用 border-box，把 nav.tabs 的三个 tab 冤枉成竖排
 *    （实际是上下各 8px 内边距）。
 * 2. 元素不能要求"有边框或背景"。第一版加了这条，纯文本的 h1/h2 全被筛掉，
 *    撤掉修复也报 0 命中。
 * 3. 文字要取整棵子树，但只要有子元素的文字与自己相同就当父容器跳过——
 *    按钮的文字在子 <span> 里，只读直接文本节点会取到空串。
 * 牙齿：撤掉 WorldBookView 那处修复，本规格立刻红出
 * `世界书 20x96 内宽20 ≈3 行 header.page-header>div.header-title>h1`；改回去 0 命中。
 */

const WIDTHS = [390, 412];
const ROUTES_A = [
  '/chat',
  '/character',
  '/character/new',
  '/worldbook',
  '/databank',
  '/story',
  '/random-events',
  '/community-market',
  '/guide',
];
const ROUTES_B = [
  '/local-model',
  '/image-gen',
  '/archives',
  '/settings',
  '/settings?cat=model',
  '/settings?cat=extension',
  '/settings?cat=data',
  '/settings?cat=security',
  '/settings?cat=appearance',
];

/** 群聊头部要点进群才渲染；列表页没有 .group-title-row，扫它等于没扫 */
const GROUP_ROUTE = '/group';

async function seedGroup(page: Page) {
  await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => {
          const db = req.result;
          const now = new Date().toISOString();
          const chars = ['sq-a', 'sq-b'].map((id, i) => ({
            id,
            name: i === 0 ? '扫描甲角色' : '扫描乙角色',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: [],
            exampleMessages: '',
            characterNote: null,
            talkativeness: 50,
            tags: [],
            favorite: false,
            version: '1.0',
            createdAt: now,
            updatedAt: now,
            messages: [],
          }));
          const group = {
            id: 'grp-squeeze-scan',
            name: '挤压扫描群',
            description: '',
            members: chars.map((c) => ({ characterId: c.id, name: c.name, joinedAt: now, allowAutoSelect: true })),
            firstMessage: '',
            messages: [{ id: 'm1', role: 'user', content: '第一句', timestamp: now }],
            mode: 'natural',
            lastSpeakerId: null,
            createdAt: now,
            updatedAt: now,
            lifecycleStatus: 'active',
            archivedAt: null,
          };
          const tx = db.transaction(['characters', 'groups'], 'readwrite');
          for (const c of chars) tx.objectStore('characters').put(c);
          tx.objectStore('groups').put(group);
          tx.oncomplete = () => {
            db.close();
            resolve('ok');
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      })
  );
}

const SCAN = `(function(){
  var out=[];
  function visible(e){
    var r=e.getBoundingClientRect();
    if(r.width<2||r.height<2) return false;
    var cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0) return false;
    return true;
  }
  function path(e){
    var parts=[],cur=e;
    while(cur&&parts.length<3&&cur.tagName){
      var cls=(cur.className&&typeof cur.className==='string')?cur.className.split(/\\s+/).filter(Boolean).slice(0,2).join('.'):'';
      parts.unshift(cur.tagName.toLowerCase()+(cls?'.'+cls:''));
      cur=cur.parentElement;
    }
    return parts.join('>');
  }
  var all=document.querySelectorAll('button,a,span,label,th,td,li,h1,h2,h3,h4,div,p');
  for(var e of all){
    if(!visible(e)) continue;
    var t=(e.textContent||'').trim();
    if(!t||t.length>10) continue;
    var childSame=false;
    for(var c of e.children){ if((c.textContent||'').trim()===t){childSame=true;break;} }
    if(childSame) continue;
    var cs=getComputedStyle(e);
    var lh=parseFloat(cs.lineHeight);
    if(!Number.isFinite(lh)) lh=parseFloat(cs.fontSize)*1.2;
    var r=e.getBoundingClientRect();
    var inner=r.height-(parseFloat(cs.paddingTop)||0)-(parseFloat(cs.paddingBottom)||0)
      -(parseFloat(cs.borderTopWidth)||0)-(parseFloat(cs.borderBottomWidth)||0);
    var innerW=r.width-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);
    var lines=Math.round(inner/lh);
    if(lines>=3&&innerW<64) out.push({sel:path(e),text:t,w:Math.round(r.width),h:Math.round(r.height),innerW:Math.round(innerW),lines:lines});
  }
  var seen=new Set();
  out=out.filter(function(o){var k=o.sel+'|'+o.text+'|'+o.lines;if(seen.has(k))return false;seen.add(k);return true;});
  return out;
})()`;

async function scanRoute(page: Page, route: string): Promise<string[]> {
  await page.goto(route);
  await page.waitForTimeout(700);
  if (route === GROUP_ROUTE) {
    await page.locator('.group-item', { hasText: '挤压扫描群' }).first().click();
    await page.waitForTimeout(700);
  }
  const hits = await page.evaluate(SCAN);
  return hits.map((h: { text: string; w: number; h: number; innerW: number; lines: number; sel: string }) =>
    `${route} ${h.text} ${h.w}x${h.h} 内宽${h.innerW} ≈${h.lines} 行 ${h.sel}`
  );
}

for (const width of WIDTHS) {
  for (const [gi, chunk] of [ROUTES_A, ROUTES_B].entries()) {
    test(`窄屏竖排挤压：${width}px · 路由第 ${gi + 1}/2 组`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await seedGroup(page);
      const offenders: string[] = [];
      for (const route of [...chunk, ...(gi === 0 ? [GROUP_ROUTE] : [])]) {
        offenders.push(...(await scanRoute(page, route)));
      }
      expect(
        offenders,
        `以下元素在 ${width}px 下被压成多行竖排（文字 ≤10 字却 ≥3 行、内容盒 <64px 宽）：\n${offenders.join('\n')}`
      ).toEqual([]);
    });
  }
}
