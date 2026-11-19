import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const bundledHook = path.join(
  repoRoot,
  "plugins",
  "compaction-suggy",
  "dist",
  "hook.mjs",
);

async function runHookAsync(
  stdinPayload: string,
  env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundledHook], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ status: code, stdout, stderr });
    });
    child.stdin.write(stdinPayload);
    child.stdin.end();
  });
}

describe("Bundled UserPromptSubmit hook E2E", () => {
  let server: http.Server;
  let baseUrl = "";
  let requestCount = 0;
  let nextProbability = 0.93;
  let tmpDir = "";
  let transcriptPath = "";

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-e2e-"));
    transcriptPath = path.join(tmpDir, "session.jsonl");

    const lines = [
      { type: "user", message: { role: "user", content: "PostgreSQL 마이그레이션 락 이슈 분석해줘." } },
      { type: "assistant", message: { role: "assistant", content: "CREATE INDEX CONCURRENTLY로 변경했습니다." } },
      { type: "user", message: { role: "user", content: "롤백 SQL과 lock_timeout도 추가해줘." } },
      { type: "assistant", message: { role: "assistant", content: "DROP INDEX CONCURRENTLY와 SET lock_timeout = '5s'를 넣었습니다." } },
      { type: "user", message: { role: "user", content: "CI 테스트에서 PostgreSQL 16으로 마이그레이션 검증해줘." } },
      { type: "assistant", message: { role: "assistant", content: "PostgreSQL 16 컨테이너에서 마이그레이션 및 롤백 검증을 완료했습니다." } },
    ];
    fs.writeFileSync(
      transcriptPath,
      `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
      "utf8",
    );

    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requestCount += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        if (req.url === "/v1/decisions") {
          res.end(
            JSON.stringify({
              model: "gpt-6-luna",
              answers: [
                { type: "predicate", name: "topic_shifted", probability: nextProbability },
              ],
            }),
          );
          return;
        }
        res.end(
          JSON.stringify({
            model: "tev1",
            answers: {
              topic_shifted: { type: "noul", noul: nextProbability },
            },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("blocks in Korean when topic shift is detected and bypasses on immediate re-submit", async () => {
    assert.ok(fs.existsSync(bundledHook), `Missing bundle: ${bundledHook}`);
    requestCount = 0;
    nextProbability = 0.93;

    const cachePath = path.join(tmpDir, "bypass-ko.json");
    const stdinPayload = JSON.stringify({
      session_id: "sess-ko-1",
      transcript_path: transcriptPath,
      cwd: tmpDir,
      hook_event_name: "UserPromptSubmit",
      prompt: "React 대시보드 상단 바에 다크모드 토글 버튼을 추가하고 Tailwind 테마를 연결해줘.",
    });

    const env = {
      ...process.env,
      TSC_PROVIDER: "local",
      TSC_LOCAL_URL: `${baseUrl}/v1/systemone`,
      TSC_LOCAL_MODEL: "tev1",
      TSC_BYPASS_CACHE_PATH: cachePath,
      TSC_THRESHOLD: "0.75",
    };

    const run1 = await runHookAsync(stdinPayload, env);
    assert.equal(run1.status, 0);
    assert.equal(requestCount, 1);

    const parsed1 = JSON.parse(run1.stdout.trim()) as {
      decision: string;
      reason: string;
    };
    assert.equal(parsed1.decision, "block");
    assert.match(parsed1.reason, /주제 전환 감지/);
    assert.match(parsed1.reason, /\/compact/);

    // Re-submit exact same prompt -> automatically allowed without hitting API
    const run2 = await runHookAsync(stdinPayload, env);
    assert.equal(run2.status, 0);
    assert.equal(run2.stdout.trim(), "");
    assert.equal(requestCount, 1);
  });

  it("outputs additionalContext in advisory mode using openai-decisions format", async () => {
    requestCount = 0;
    nextProbability = 0.88;

    const stdinPayload = JSON.stringify({
      session_id: "sess-en-1",
      transcript_path: transcriptPath,
      cwd: tmpDir,
      hook_event_name: "UserPromptSubmit",
      prompt: "Write a brand new Python script to scrape baseball box scores.",
    });

    const run = await runHookAsync(stdinPayload, {
      ...process.env,
      TSC_PROVIDER: "local",
      TSC_LOCAL_URL: `${baseUrl}/v1/decisions`,
      TSC_LOCAL_API_FORMAT: "openai-decisions",
      TSC_LOCAL_MODEL: "d3-mini",
      TSC_MODE: "advisory",
      TSC_BYPASS_CACHE_PATH: path.join(tmpDir, "bypass-adv.json"),
    });

    assert.equal(run.status, 0);
    assert.equal(requestCount, 1);
    const parsed = JSON.parse(run.stdout.trim()) as {
      hookSpecificOutput?: { hookEventName: string; additionalContext: string };
    };
    assert.equal(parsed.hookSpecificOutput?.hookEventName, "UserPromptSubmit");
    assert.match(parsed.hookSpecificOutput?.additionalContext ?? "", /Topic Shift Advisory/);
  });

  it("fails open cleanly when local decision server is unreachable", async () => {
    const stdinPayload = JSON.stringify({
      session_id: "sess-failopen",
      transcript_path: transcriptPath,
      cwd: tmpDir,
      hook_event_name: "UserPromptSubmit",
      prompt: "Switch to writing an iOS SwiftUI widget from scratch.",
    });

    const run = await runHookAsync(stdinPayload, {
      ...process.env,
      TSC_PROVIDER: "local",
      TSC_LOCAL_URL: "http://127.0.0.1:1/v1/systemone",
      TSC_TIMEOUT_MS: "400",
      TSC_BYPASS_CACHE_PATH: path.join(tmpDir, "bypass-failopen.json"),
    });

    assert.equal(run.status, 0);
    assert.equal(run.stdout.trim(), "");
  });
});
