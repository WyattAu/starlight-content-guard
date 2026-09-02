import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CacheEntry, ValidationCache } from '../types.js';

const DEFAULT_TTL_MS = 86_400_000;

export class FileValidationCache implements ValidationCache {
  private cacheDir: string;
  private memoryCache = new Map<string, CacheEntry>();

  private constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  static async create(root: string): Promise<FileValidationCache> {
    const cacheDir = join(root, '.cache', 'content-guard');
    await fs.mkdir(cacheDir, { recursive: true });
    const instance = new FileValidationCache(cacheDir);
    await instance.load();
    return instance;
  }

  private async load(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(join(this.cacheDir, file), 'utf-8');
          const entry: CacheEntry = JSON.parse(raw);
          const key = file.slice(0, -5);
          if (entry.expiresAt > Date.now()) {
            this.memoryCache.set(key, entry);
          } else {
            await fs.unlink(join(this.cacheDir, file)).catch(() => {});
          }
        } catch {
          // corrupted cache entry, skip
        }
      }
    } catch {
      // no cache dir yet
    }
  }

  async get(key: string): Promise<CacheEntry | undefined> {
    const entry = this.memoryCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      await this.invalidate(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const entry: CacheEntry = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    this.memoryCache.set(key, entry);
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.writeFile(
      join(this.cacheDir, `${safeName}.json`),
      JSON.stringify(entry),
    );
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== undefined;
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map((f) => fs.unlink(join(this.cacheDir, f)).catch(() => {})),
      );
    } catch {
      // ignore
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.unlink(join(this.cacheDir, `${safeName}.json`)).catch(() => {});
  }
}
