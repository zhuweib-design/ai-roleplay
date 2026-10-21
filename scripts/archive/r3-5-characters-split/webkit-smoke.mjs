import { webkit } from '@playwright/test';
const b = await webkit.launch();
const p = await b.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));
const resp = await p.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 20000 });
await p.waitForTimeout(4000);
const html = await p.evaluate(() => document.getElementById('app')?.innerHTML.slice(0, 300) ?? 'NO #app');
import { writeFileSync } from 'node:fs';
writeFileSync('scripts/archive/r3-5-characters-split/webkit-smoke.txt',
  `status=${resp?.status()}\nurl=${p.url()}\nerrs=${JSON.stringify(errs, null, 1)}\napp-html=${html}\n`);
await b.close();
