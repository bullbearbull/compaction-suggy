import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { BypassCache } from "../dist/bypass-cache.js";

describe("BypassCache", () => {
  it("supports one-shot bypass per session and prompt, and respects TTL", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-cache-test-"));
    try {
      const cachePath = path.join(tmpDir, "bypass-cache.json");
      const cache = new BypassCache(cachePath, 60);
      const t0 = 1_700_000_000_000;

      assert.equal(cache.consumeIfBypassed("sess-1", "Build dark mode", t0), false);

      cache.recordBlockedPrompt("sess-1", "Build dark mode", 0.93, t0);

      // Different session must not bypass
      assert.equal(cache.consumeIfBypassed("sess-2", "Build dark mode", t0 + 1000), false);

      // Same session & prompt bypasses once (whitespace normalized)
      assert.equal(cache.consumeIfBypassed("sess-1", "  Build   dark mode ", t0 + 1000), true);

      // Second immediate call must NOT bypass again (one-shot consumed)
      assert.equal(cache.consumeIfBypassed("sess-1", "Build dark mode", t0 + 2000), false);

      // TTL expiration test
      cache.recordBlockedPrompt("sess-1", "Another prompt", 0.88, t0);
      assert.equal(cache.consumeIfBypassed("sess-1", "Another prompt", t0 + 61_000), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
