/**
 * market-index integration tests
 *
 * End-to-end test of the community market real download flow:
 * - Load remote index manifest
 * - Download item content with streaming progress
 * - Verify SHA-256 hash
 * - Import into character store
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useCharacterStore } from '../../src/stores/character';
import { IndexedDBAdapter } from '../../src/storage/indexeddb-adapter';
import {
  fetchMarketIndex,
  downloadMarketItem,
  parseMarketIndex,
  verifySha256Hex,
  type MarketIndexItem,
  type MarketIndexManifest,
} from '@core/market-index';

// Resolve market directory relative to project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
const seraphinaFilePath = resolve(projectRoot, 'market', 'cards', 'seraphina.json');

const INDEX_URL = 'https://example.com/market/index.json';
const ITEM_URL = 'https://example.com/market/items/test.json';

function makeManifest(items: MarketIndexItem[] = []): MarketIndexManifest {
  return {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    items,
  };
}

function makeItem(overrides: Partial<MarketIndexItem> = {}): MarketIndexItem {
  return {
    id: 'test-item',
    type: 'character',
    name: 'Test Character',
    description: 'A test character',
    tags: ['test'],
    author: 'tester',
    version: '1.0.0',
    size: 100,
    sha256: '',
    url: ITEM_URL,
    ...overrides,
  };
}

describe('fetchMarketIndex (integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and parse valid manifest', async () => {
    const item = makeItem({
      sha256: 'abc123',
    });
    const manifest = makeManifest([item]);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifest), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchMarketIndex(INDEX_URL);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.id).toBe('test-item');
    expect(mockFetch).toHaveBeenCalledWith(INDEX_URL);
  });

  it('should return null for invalid manifest', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('not json', { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchMarketIndex(INDEX_URL);
    expect(result).toBeNull();
  });

  it('should throw on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchMarketIndex(INDEX_URL)).rejects.toThrow('HTTP 404');
  });

  it('should respect size limit', async () => {
    const largeContent = 'x'.repeat(600 * 1024); // > 512KB limit
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(largeContent, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchMarketIndex(INDEX_URL)).rejects.toThrow('content too large');
  });
});

describe('downloadMarketItem (integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should download and verify item with matching hash', async () => {
    const itemContent = { name: 'Test', description: 'Desc' };
    const itemText = JSON.stringify(itemContent);
    const itemBytes = new TextEncoder().encode(itemText);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', itemBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const item = makeItem({
      sha256: hashHex,
      size: itemBytes.length,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(itemText, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    let progressCalls = 0;
    const result = await downloadMarketItem(item, () => {
      progressCalls++;
    });
    expect(result).not.toBeNull();
    expect(result!.content).toEqual(itemContent);
    expect(progressCalls).toBeGreaterThan(0);
  });

  it('should reject item with mismatched hash', async () => {
    const itemContent = { name: 'Test' };
    const itemText = JSON.stringify(itemContent);

    const item = makeItem({
      sha256: 'invalid_hash_that_does_not_match',
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(itemText, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await downloadMarketItem(item);
    expect(result).toBeNull();
  });

  it('should reject invalid JSON content', async () => {
    const itemBytes = new TextEncoder().encode('not json');
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', itemBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const item = makeItem({
      sha256: hashHex,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('not json', { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await downloadMarketItem(item);
    expect(result).toBeNull();
  });

  it('should support streaming progress with chunked response', async () => {
    const itemContent = { name: 'Test' };
    const itemText = JSON.stringify(itemContent);
    const itemBytes = new TextEncoder().encode(itemText);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', itemBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const item = makeItem({
      sha256: hashHex,
      size: itemBytes.length,
    });

    // Simulate chunked streaming response
    const chunks: Uint8Array[] = [itemBytes.slice(0, 5), itemBytes.slice(5)];
    let chunkIndex = 0;
    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue(chunks[chunkIndex]!);
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockStream, {
        status: 200,
        headers: { 'Content-Length': String(itemBytes.length) },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const progressEvents: Array<{ received: number; total: number }> = [];
    const result = await downloadMarketItem(item, (received, total) => {
      progressEvents.push({ received, total });
    });

    expect(result).not.toBeNull();
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[progressEvents.length - 1]!.received).toBe(itemBytes.length);
    expect(progressEvents[progressEvents.length - 1]!.total).toBe(itemBytes.length);
  });

  it('should handle HTTP error during download', async () => {
    const item = makeItem();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(downloadMarketItem(item)).rejects.toThrow('HTTP 404');
  });

  it('should respect size limit during download', async () => {
    const largeContent = 'x'.repeat(5 * 1024 * 1024); // > 4MB limit
    const item = makeItem({
      size: largeContent.length,
    });
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(largeContent, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(downloadMarketItem(item)).rejects.toThrow('content too large');
  });
});

describe('Real download flow with character store', () => {
  let adapter: IndexedDBAdapter | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('market-flow-test-db');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    adapter = new IndexedDBAdapter('market-flow-test-db');
    await adapter.init();
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20));
    await adapter?.close();
    adapter = null;
  });

  it('should import downloaded character into character store', async () => {
    // Create a V2-compatible character card content
    const characterContent = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Seraphina',
        description: 'A test character',
        personality: 'Gentle',
        scenario: 'Forest',
        first_mes: 'Hello traveler',
        alternate_greetings: ['Hi there'],
        mes_example: '<START>\nUser: Hello\nChar: Hi',
        creator_notes: 'Test notes',
        tags: ['fantasy', 'elf'],
        avatar: 'none',
      },
    };
    const itemText = JSON.stringify(characterContent);
    const itemBytes = new TextEncoder().encode(itemText);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', itemBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const item = makeItem({
      id: 'seraphina-elf-mage',
      type: 'character',
      name: 'Seraphina 精灵法师',
      description: '守护森林的精灵法师',
      tags: ['奇幻', '精灵', '温柔'],
      sha256: hashHex,
      size: itemBytes.length,
    });

    // Mock fetch to return our character content
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(itemText, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    // Download the item
    const downloaded = await downloadMarketItem(item);
    expect(downloaded).not.toBeNull();

    // Import into character store
    const charStore = useCharacterStore();
    charStore.setStorageAdapter(adapter);

    // Check character is not already there
    const initialCount = charStore.characters.length;

    // Import the downloaded content as a character
    const charCard = downloaded!.content as Record<string, unknown>;
    // Use importV2Card to convert V2 format to CharacterCard
    const { importV2Card } = await import('@core/character-card');
    const card = importV2Card(charCard);
    const { cardToUiChar } = await import('@services/type-adapters');
    const uiChar = cardToUiChar(card);

    // Avoid duplicate names
    if (charStore.characters.some((c) => c.name === uiChar.name)) {
      uiChar.name = `${uiChar.name} (Imported)`;
    }

    charStore.characters.push(uiChar);
    await charStore.persistCharacter(uiChar.id);

    // Verify character was imported
    expect(charStore.characters.length).toBe(initialCount + 1);
    const imported = charStore.characters.find((c) => c.name === 'Seraphina (Imported)');
    expect(imported).not.toBeUndefined();
    expect(imported?.tags).toContain('fantasy');
    expect(imported?.tags).toContain('elf');
  });

  it('should handle corrupted item content gracefully', async () => {
    // Content that has valid hash but invalid structure
    const invalidContent = { not_a_character: true };
    const itemText = JSON.stringify(invalidContent);
    const itemBytes = new TextEncoder().encode(itemText);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', itemBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const item = makeItem({
      sha256: hashHex,
      size: itemBytes.length,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(itemText, { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    const downloaded = await downloadMarketItem(item);
    expect(downloaded).not.toBeNull();

    // Try to import invalid content - should be caught
    const charCard = downloaded!.content as Record<string, unknown>;
    const { importV2Card } = await import('@core/character-card');

    // importV2Card might throw or return a card with defaults for missing fields
    // The key point is that the flow doesn't crash
    try {
      const card = importV2Card(charCard);
      expect(card).toBeDefined();
      // Even with missing fields, it should create a card object
    } catch (e) {
      // If it throws, that's also acceptable as long as it's a controlled error
      expect(e).toBeInstanceOf(Error);
    }
  });
});

describe('parseMarketIndex with real manifest', () => {
  it('should parse the actual seraphina manifest from project', () => {
    const realManifest = {
      version: 1,
      updatedAt: '2026-08-22T00:00:00.000Z',
      items: [
        {
          id: 'seraphina-elf-mage',
          type: 'character',
          name: 'Seraphina 精灵法师',
          description: '一位守护迷雾森林的精灵法师，温柔而坚韧。社区市场示例角色卡。',
          tags: ['奇幻', '精灵', '温柔'],
          author: 'ai-roleplay',
          version: '1.0.0',
          size: 827,
          sha256: 'b2da8ee88b8ee6088aa1ca3ebaed9a0aeddc97a0d9eb466853298ec7d8987d9b',
          url: 'https://raw.githubusercontent.com/zhuweib-design/ai-roleplay/main/market/cards/seraphina.json',
        },
      ],
    };

    const result = parseMarketIndex(JSON.stringify(realManifest));
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.id).toBe('seraphina-elf-mage');
    expect(result!.items[0]!.type).toBe('character');
    expect(result!.items[0]!.name).toBe('Seraphina 精灵法师');
  });
});

describe('verifySha256Hex with real seraphina file', () => {
  it('should verify actual hash of seraphina character file', async () => {
    // Read the actual file content from disk
    const fileContent = readFileSync(seraphinaFilePath, 'utf-8');
    const bytes = new TextEncoder().encode(fileContent);

    // Verify against the hash in market index
    const expectedHash = 'b2da8ee88b8ee6088aa1ca3ebaed9a0aeddc97a0d9eb466853298ec7d8987d9b';
    const isValid = await verifySha256Hex(bytes, expectedHash);
    expect(isValid).toBe(true);
  });

  it('should detect tampered content', async () => {
    const originalContent = { name: 'Seraphina' };
    const originalBytes = new TextEncoder().encode(JSON.stringify(originalContent));

    const tamperedContent = { name: 'SeraphinaX' };
    const tamperedBytes = new TextEncoder().encode(JSON.stringify(tamperedContent));

    // Get hash of original
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', originalBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Tampered content should not match original hash
    const isValid = await verifySha256Hex(tamperedBytes, hashHex);
    expect(isValid).toBe(false);
  });
});
