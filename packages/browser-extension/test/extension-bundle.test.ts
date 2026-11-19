import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildParsedTranscriptFromTurns,
  evaluateTranscriptTopicShift,
  getDefaultConfig,
} from "@topic-shift-compact/core/browser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDistDir = path.resolve(__dirname, "..", "dist");

describe("ChatGPT Chrome Extension build artifacts", () => {
  it("contains valid MV3 manifest, assets, valid PNG icons, and browser-clean JS bundles", () => {
    const manifestPath = path.join(extDistDir, "manifest.json");
    assert.equal(fs.existsSync(manifestPath), true, "dist/manifest.json should exist");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    assert.equal(manifest.manifest_version, 3);
    assert.ok(Array.isArray(manifest.permissions));
    assert.ok((manifest.permissions as string[]).includes("storage"));
    assert.ok(
      (manifest.permissions as string[]).includes("declarativeNetRequestWithHostAccess"),
    );

    const contentScripts = manifest.content_scripts as Array<{ matches: string[]; js: string[] }>;
    assert.ok(Array.isArray(contentScripts) && contentScripts.length === 1);
    assert.ok(contentScripts[0]?.matches.includes("https://chatgpt.com/*"));
    assert.ok(contentScripts[0]?.matches.includes("https://claude.ai/*"));
    assert.ok(contentScripts[0]?.js.includes("content.js"));

    for (const rel of ["background.js", "content.js", "popup.js", "popup.html", "popup.css"]) {
      const full = path.join(extDistDir, rel);
      assert.equal(fs.existsSync(full), true, `Expected ${rel} in extension dist`);
      assert.ok(fs.statSync(full).size > 0, `Expected ${rel} to be non-empty`);
    }

    // Verify PNG signature on generated icons
    const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    for (const size of [16, 32, 48, 128]) {
      const iconPath = path.join(extDistDir, "icons", `icon${size}.png`);
      assert.equal(fs.existsSync(iconPath), true, `Expected icon${size}.png`);
      const buf = fs.readFileSync(iconPath);
      assert.equal(buf.subarray(0, 8).equals(pngSig), true, `icon${size}.png must be valid PNG`);
    }

    // Verify zero Node.js built-in imports leaked into browser bundles
    for (const bundle of ["background.js", "content.js", "popup.js"]) {
      const src = fs.readFileSync(path.join(extDistDir, bundle), "utf8");
      assert.doesNotMatch(
        src,
        /from\s*["']node:|require\(\s*["']node:/,
        `${bundle} must not contain node:* imports`,
      );
    }
  });

  it("evaluates live against a local System One HTTP endpoint using browser-safe core", async () => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as {
          state?: { new_user_prompt?: string };
        };
        const isTravel = parsed.state?.new_user_prompt?.includes("도쿄") ?? false;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            answers: { topic_shifted: { noul: isTravel ? 0.94 : 0.12 } },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");

    try {
      const baseConfig = getDefaultConfig();
      const config = {
        ...baseConfig,
        provider: "local" as const,
        minTurns: 2,
        minContextChars: 40,
        threshold: 0.75,
        local: {
          ...baseConfig.local,
          url: `http://127.0.0.1:${addr.port}/v1/systemone`,
          apiFormat: "systemone" as const,
          model: "tev1",
        },
      };

      const turns = [
        { role: "user" as const, text: "TypeScript에서 strict mode 설정을 어떻게 최적화하면 좋을까?" },
        { role: "assistant" as const, text: "noUncheckedIndexedAccess와 exactOptionalPropertyTypes를 검토하세요." },
        { role: "user" as const, text: "tsconfig project references 구성 예시도 보여줘." },
        { role: "assistant" as const, text: "composite: true와 references 배열을 패키지에 추가하면 됩니다." },
      ];

      const shiftOutcome = await evaluateTranscriptTopicShift(
        "다음 주 도쿄 3박 4일 여행 일정 추천해줘",
        buildParsedTranscriptFromTurns(turns),
        { config },
      );
      assert.equal(shiftOutcome.action, "block");
      assert.equal(shiftOutcome.decision?.probability, 0.94);

      const sameTopicOutcome = await evaluateTranscriptTopicShift(
        "composite 옵션을 켰을 때 esbuild와 같이 쓰는 팁도 알려줘",
        buildParsedTranscriptFromTurns(turns),
        { config },
      );
      assert.equal(sameTopicOutcome.action, "allow");
      assert.equal(sameTopicOutcome.decision?.probability, 0.12);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
