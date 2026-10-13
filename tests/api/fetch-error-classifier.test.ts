/**
 * fetch 失败的"断网 / 被跨域拦"分开判据
 *
 * 这条链路的价值全在"分开"上：过去两种情况都是同一条 `kind:'network'` 与同一句
 * "网络请求失败（可能原因 1-4）"，用户在手机上分不清是地址填错了，还是这家压根不接受浏览器直连。
 * 所以除判据本身，还锁两件事：
 * - 探测不能打在 chat 端点上（同一份对话体重发会被服务商计第二次费）；
 * - 探测必须有时间上界（黑洞型网络里 `fetch` 不会自己失败，否则错误提示被探测拖住）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isHostReachable, probeUrlFor } from '@/api/cors-probe';
import { OpenAIClient } from '@api/openai-client';
import { ApiError } from '@api/types';

describe('probeUrlFor：只取 origin 根路径', () => {
  it('把带路径的 baseUrl 收敛到 origin', () => {
    expect(probeUrlFor('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/');
    expect(probeUrlFor('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/');
  });

  it('非 http(s) 与不成形的地址返回 null（不发探测）', () => {
    expect(probeUrlFor('not-a-url')).toBeNull();
    expect(probeUrlFor('file:///C:/x')).toBeNull();
    expect(probeUrlFor('')).toBeNull();
  });
});

describe('isHostReachable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('探测请求能到 ⇒ true', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    await expect(isHostReachable('https://api.x.com/v1')).resolves.toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    // 锁"打在根路径 + no-cors + GET"三条：任一被改坏，要么变成重复计费，要么变成测不出跨域
    expect(url).toBe('https://api.x.com/');
    expect(init.method).toBe('GET');
    expect(init.mode).toBe('no-cors');
  });

  it('探测抛错 ⇒ false（真的连不上）', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(isHostReachable('https://api.x.com/v1')).resolves.toBe(false);
  });

  it('探测一直挂着也要在 3s 上界处中止，不能把错误提示拖没', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    const pending = isHostReachable('https://api.x.com/v1');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBe(false);
  });
});

describe('OpenAIClient 把两类失败分到不同 kind', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('服务器可达 ⇒ kind 落 cors，不再是含糊的 network', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.x.com/v1', apiKey: 'k' });
    let first = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (first) {
        first = false;
        throw new TypeError('Failed to fetch');
      }
      return { ok: true } as Response; // 探测：根路径能连通
    });

    const err = await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('cors');
  });

  it('服务器也连不上 ⇒ 仍是 kind network（不能把断网说成跨域）', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.x.com/v1', apiKey: 'k' });
    // 真请求与探测都失败：这条断言要拦的是"探测失败时也被误判成跨域"
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });

    const err = await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }).catch((e) => e);
    expect((err as ApiError).kind).toBe('network');
  });

  it('负向对照：探测请求确实发出去了，且没有把对话体重发到 chat 端点', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.x.com/v1', apiKey: 'k' });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }).catch(() => null);

    const calls = spy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.length).toBe(2);
    expect(calls[1]?.[0]).toBe('https://api.x.com/');
    expect(calls[1]?.[1]?.body).toBeUndefined();
  });

  it('URL 本身不成形时不发探测（那类错误由 invalid-url 分支处理）', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.x.com/v1', apiKey: 'k' });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError("Failed to construct 'https:// api': Invalid URL");
    });
    const err = await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }).catch((e) => e);
    expect((err as ApiError).kind).toBe('invalid-url');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
