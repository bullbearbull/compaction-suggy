import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizePromptForComparison } from "./fast-path.js";

export interface BypassEntry {
  expiresAt: number;
  probability: number;
  createdAt: number;
}

interface BypassStore {
  version: 1;
  entries: Record<string, BypassEntry>;
}

const MAX_STORE_ENTRIES = 200;

export function makeBypassKey(sessionId: string | undefined, prompt: string): string {
  const normalized = normalizePromptForComparison(prompt);
  const scope = sessionId?.trim() || "default";
  return crypto
    .createHash("sha256")
    .update(`${scope}::${normalized}`)
    .digest("hex");
}

function readStore(cachePath: string, now: number): BypassStore {
  try {
    if (!fs.existsSync(cachePath)) {
      return { version: 1, entries: {} };
    }
    const raw = fs.readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BypassStore>;
    const entries: Record<string, BypassEntry> = {};
    if (parsed.entries && typeof parsed.entries === "object") {
      for (const [k, v] of Object.entries(parsed.entries)) {
        if (
          v &&
          typeof v === "object" &&
          typeof v.expiresAt === "number" &&
          v.expiresAt > now
        ) {
          entries[k] = v;
        }
      }
    }
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeStore(cachePath: string, store: BypassStore): void {
  try {
    const dir = path.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true });

    // Prune oldest entries if cache grows beyond limit
    const keys = Object.keys(store.entries);
    if (keys.length > MAX_STORE_ENTRIES) {
      keys.sort(
        (a, b) =>
          (store.entries[a]?.createdAt ?? 0) - (store.entries[b]?.createdAt ?? 0),
      );
      const toRemove = keys.slice(0, keys.length - MAX_STORE_ENTRIES);
      for (const k of toRemove) {
        delete store.entries[k];
      }
    }

    const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tmpPath, cachePath);
  } catch {
    // Cache I/O failures must never block user prompts.
  }
}

export class BypassCache {
  private readonly cachePath: string;
  private readonly ttlMs: number;

  constructor(cachePath: string, ttlSeconds: number) {
    this.cachePath = cachePath;
    this.ttlMs = Math.max(5, ttlSeconds) * 1000;
  }

  /**
   * Checks if the given session+prompt has an active one-shot bypass entry.
   * If found, consumes (deletes) it so subsequent independent turns remain protected.
   */
  consumeIfBypassed(
    sessionId: string | undefined,
    prompt: string,
    now = Date.now(),
  ): boolean {
    const key = makeBypassKey(sessionId, prompt);
    const store = readStore(this.cachePath, now);
    const entry = store.entries[key];
    if (!entry || entry.expiresAt <= now) {
      return false;
    }
    delete store.entries[key];
    writeStore(this.cachePath, store);
    return true;
  }

  /**
   * Records a blocked prompt so that if the user immediately re-submits the exact
   * same prompt to proceed without compacting, the next submission passes through.
   */
  recordBlockedPrompt(
    sessionId: string | undefined,
    prompt: string,
    probability: number,
    now = Date.now(),
  ): void {
    const key = makeBypassKey(sessionId, prompt);
    const store = readStore(this.cachePath, now);
    store.entries[key] = {
      createdAt: now,
      expiresAt: now + this.ttlMs,
      probability,
    };
    writeStore(this.cachePath, store);
  }
}
