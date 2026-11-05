import { webkit } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const b = await webkit.launch();
const p = await b.newPage();
const log = [];
await p.route('**/mock/v1/chat/completions', (route) => {
  log.push('ROUTE HIT ' + route.request().url());
  return void route.fulfill({ status: 200, contentType: 'text/plain', body: 'MOCKED' });
});
await p.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 20000 });
const r = await p.evaluate(async () => {
  try {
    const res = await fetch('http://127.0.0.1:5173/mock/v1/chat/completions', { method: 'POST', body: '{}' });
    return `${res.status} ${await res.text()}`;
  } catch (e) { return 'ERR ' + String(e); }
});
const r2 = await p.evaluate(async () => {
  try {
    const res = await fetch('http://localhost:5173/mock/v1/chat/completions', { method: 'POST', body: '{}' });
    return `${res.status} ${await res.text()}`;
  } catch (e) { return 'ERR ' + String(e); }
});
writeFileSync('scripts/archive/r4-3-lorebook-split/wk-route-probe.txt',
  `log=${JSON.stringify(log)}\n127=${r}\nlocalhost=${r2}\n`);
await b.close();
