import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const npmPkgDir = path.join(repoRoot, "packages", "compaction-suggy");

async function runNodeAsync(
  scriptPath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdinText?: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
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
    child.on("close", (code) => resolve({ status: code, stdout, stderr }));
    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

describe("Publishable npm package (`compaction-suggy`) E2E", () => {
  it("packs cleanly with zero dependencies and survives simulated _npx cache deletion", async () => {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(npmPkgDir, "package.json"), "utf8"),
    ) as { name: string; version: string; dependencies?: Record<string, string> };

    assert.equal(pkgJson.name, "compaction-suggy");
    assert.equal(pkgJson.dependencies, undefined, "Publishable npm package must have zero runtime dependencies");

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "suggy-npm-e2e-"));
    const packDir = path.join(tmpRoot, "pack");
    const extractDir = path.join(tmpRoot, "npx-cache");
    const fakeHome = path.join(tmpRoot, "home");
    const xdgData = path.join(fakeHome, ".local", "share");
    const xdgConfig = path.join(fakeHome, ".config");
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });

    let server: http.Server | undefined;

    try {
      // 1. Run `npm pack` on packages/compaction-suggy
      const tarballName = execFileSync(
        "npm",
        ["pack", "--silent", "--pack-destination", packDir],
        { cwd: npmPkgDir, encoding: "utf8" },
      ).trim();
      const tarballPath = path.join(packDir, tarballName);
      assert.equal(fs.existsSync(tarballPath), true, `Expected tarball ${tarballPath}`);

      // 2. Extract tarball into isolated folder with NO node_modules
      execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir]);
      const unpackedPkg = path.join(extractDir, "package");
      const unpackedCli = path.join(unpackedPkg, "dist", "cli.mjs");
      const unpackedHook = path.join(unpackedPkg, "dist", "hook.mjs");
      assert.equal(fs.existsSync(unpackedCli), true);
      assert.equal(fs.existsSync(unpackedHook), true);
      assert.equal(fs.existsSync(path.join(unpackedPkg, "README.md")), true);
      assert.equal(fs.existsSync(path.join(unpackedPkg, "LICENSE")), true);

      const isolatedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_DATA_HOME: xdgData,
        XDG_CONFIG_HOME: xdgConfig,
      };

      // 3. Verify --version
      const verRes = await runNodeAsync(unpackedCli, ["--version"], isolatedEnv);
      assert.equal(verRes.status, 0);
      assert.equal(verRes.stdout.trim(), pkgJson.version);

      // 4. Run `install --target all` (copies standalone hook binary & registers Claude + Codex)
      const installRes = await runNodeAsync(
        unpackedCli,
        ["install", "--target", "all"],
        isolatedEnv,
      );
      assert.equal(installRes.status, 0, installRes.stderr);

      const permanentHook = path.join(xdgData, "compaction-suggy", "hook.mjs");
      assert.equal(fs.existsSync(permanentHook), true, "Permanent hook binary should be installed");

      const claudeSettings = JSON.parse(
        fs.readFileSync(path.join(fakeHome, ".claude", "settings.json"), "utf8"),
      ) as { hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string; args?: string[] }> }> } };
      const codexHooks = JSON.parse(
        fs.readFileSync(path.join(fakeHome, ".codex", "hooks.json"), "utf8"),
      ) as { hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string; args?: string[] }> }> } };

      assert.equal(claudeSettings.hooks.UserPromptSubmit[0]?.hooks[0]?.command, "node");
      assert.deepEqual(claudeSettings.hooks.UserPromptSubmit[0]?.hooks[0]?.args, [permanentHook]);
      assert.equal(codexHooks.hooks.UserPromptSubmit[0]?.hooks[0]?.command, "node");
      assert.deepEqual(codexHooks.hooks.UserPromptSubmit[0]?.hooks[0]?.args, [permanentHook]);

      // 5. Delete the extracted `_npx` package completely to simulate npm cache cleanup!
      fs.rmSync(extractDir, { recursive: true, force: true });
      assert.equal(fs.existsSync(unpackedCli), false);

      // 6. Execute the PERMANENT installed hook against a mock Decision Model server
      server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ answers: { topic_shifted: { noul: 0.95 } } }));
      });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");

      const transcriptPath = path.join(tmpRoot, "session.jsonl");
      fs.writeFileSync(
        transcriptPath,
        [
          { type: "user", message: { role: "user", content: "PostgreSQL 마이그레이션 락 분석해줘." } },
          { type: "assistant", message: { role: "assistant", content: "CREATE INDEX CONCURRENTLY로 분리했습니다." } },
          { type: "user", message: { role: "user", content: "롤백 스크립트도 추가해줘." } },
          { type: "assistant", message: { role: "assistant", content: "DROP INDEX CONCURRENTLY 구문을 추가했습니다." } },
          { type: "user", message: { role: "user", content: "스테이징 DB 검증 체크리스트도 정리해줘." } },
          { type: "assistant", message: { role: "assistant", content: "락 타임아웃과 pg_stat_activity 점검 항목을 추가했습니다." } },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n"),
        "utf8",
      );

      const hookRun = await runNodeAsync(
        permanentHook,
        [],
        {
          ...isolatedEnv,
          TSC_PROVIDER: "local",
          TSC_LOCAL_URL: `http://127.0.0.1:${addr.port}/v1/systemone`,
          TSC_BYPASS_CACHE_PATH: path.join(tmpRoot, "bypass.json"),
        },
        JSON.stringify({
          session_id: "npm-e2e-sess",
          transcript_path: transcriptPath,
          prompt: "다음 달 도쿄 3박 4일 여행 일정이랑 시부야 맛집 추천해줘.",
        }),
      );
      assert.equal(hookRun.status, 0);
      const decisionJson = JSON.parse(hookRun.stdout.trim()) as {
        decision?: string;
        reason?: string;
      };
      assert.equal(decisionJson.decision, "block");
      assert.match(decisionJson.reason ?? "", /\/compact/);

      // 7. Re-extract cli and verify clean `uninstall --target all`
      fs.mkdirSync(extractDir, { recursive: true });
      execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir]);
      const uninstallRes = await runNodeAsync(
        unpackedCli,
        ["uninstall", "--target", "all"],
        isolatedEnv,
      );
      assert.equal(uninstallRes.status, 0, uninstallRes.stderr);
      assert.equal(fs.existsSync(permanentHook), false, "Uninstall should delete permanent binary");
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
