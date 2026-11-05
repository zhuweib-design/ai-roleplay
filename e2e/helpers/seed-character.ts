/**
 * E2E 造角色夹具（2026-10-26 起角色库从空开始，首次启动零数据）
 *
 * 以前浏览器用例默认"打开就有 4 个示例角色"，很多 spec 直接 `goto('/chat')` 就假定能有
 * 当前角色、就绪条、上下文面板。现在这些都得自己造。用法：
 *
 *   await seedCharacter(page);              // 内部先落 origin，写一条，随后调用方自己 goto
 *   await seedCharacter(page, { id: 'seraphina', name: 'Seraphina' });
 *
 * 注意：写入后必须再导航一次才会被 store 读到（store 在 App 挂载时读库）。
 */
import type { Page } from '@playwright/test';

export interface SeedCharacterOverrides {
  id?: string;
  name?: string;
  description?: string;
  avatarType?: 'image' | 'gradient';
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  [key: string]: unknown;
}

export async function seedCharacter(page: Page, overrides: SeedCharacterOverrides = {}): Promise<string> {
  const id = String(overrides.id ?? 'seed-character');
  const name = String(overrides.name ?? '夹具角色');
  const now = '2026-10-26T00:00:00.000Z';

  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(
    ({ id, name, now, overrides }) => {
      localStorage.setItem('ai-roleplay:onboarding-done', '1');
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['characters'], 'readwrite');
          tx.objectStore('characters').put({
            id,
            name,
            description: '只为了跑用例',
            personality: '',
            scenario: '',
            firstMessage: '你好',
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
            ...overrides,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { id, name, now, overrides }
  );
  return id;
}
