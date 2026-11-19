#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_LOCAL_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  getUserConfigPath,
  loadConfig,
  resolveDecisionProvider,
  type HookMode,
  type LanguagePreference,
  type LocalApiFormat,
  type PartialTopicShiftConfig,
  type ProviderSelection,
} from "@topic-shift-compact/core";

const HOOK_MARKERS = ["compaction-suggy", "topic-shift-compact"];

function isOwnHookCommand(command: unknown): boolean {
  return (
    typeof command === "string" &&
    HOOK_MARKERS.some((marker) => command.includes(marker))
  );
}

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string | boolean>;
} {
  const command = argv[0] ?? "help";
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex > 2) {
      const key = token.slice(2, eqIndex);
      flags[key] = token.slice(eqIndex + 1);
    } else {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command, flags };
}

function getFlagString(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function resolveHookScriptPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(currentFile), "hook.mjs");
}

function printHelp(): void {
  console.log(`Compaction Suggy CLI

Usage:
  node cli.mjs <command> [options]

Commands:
  init                 Write user config (~/.config/topic-shift-compact/config.json)
    --provider         openrouter | openai | local | auto (default: auto)
    --model            Override model ID (e.g. typesafe/jev-latest, gpt-6-luna, tev1)
    --threshold        Topic-shift probability threshold 0.0-1.0 (default: 0.75)
    --mode             block | advisory (default: block)
    --language         auto | ko | en (default: auto)
    --local-url        Local endpoint URL (default: ${DEFAULT_LOCAL_URL})
    --local-format     systemone | openai-decisions (default: systemone)
    --min-turns        Minimum user turns before checking (default: 3)

  doctor               Inspect resolved config, provider credentials, and hook status

  test                 Send a live test decision query using active config
    --context          Prior conversation context (optional sample provided)
    --prompt           New user prompt to test (optional sample provided)

  install-user         Register UserPromptSubmit hook in user settings (Claude Code, Claude Desktop Cowork, Codex CLI/Desktop)
    --target           claude | codex | all (required)

  uninstall-user       Remove Compaction Suggy hook from user settings
    --target           claude | codex | all (required)
`);
}

function runInit(flags: Record<string, string | boolean>): void {
  const configPath = getUserConfigPath();
  const provider = (getFlagString(flags, "provider") ?? "auto") as ProviderSelection;
  if (!["openrouter", "openai", "local", "auto"].includes(provider)) {
    throw new Error(`Invalid --provider "${provider}". Use openrouter | openai | local | auto.`);
  }

  const mode = (getFlagString(flags, "mode") ?? "block") as HookMode;
  if (!["block", "advisory"].includes(mode)) {
    throw new Error(`Invalid --mode "${mode}". Use block | advisory.`);
  }

  const language = (getFlagString(flags, "language") ?? "auto") as LanguagePreference;
  if (!["auto", "ko", "en"].includes(language)) {
    throw new Error(`Invalid --language "${language}". Use auto | ko | en.`);
  }

  const localFormat = (getFlagString(flags, "local-format") ??
    "systemone") as LocalApiFormat;
  if (!["systemone", "openai-decisions"].includes(localFormat)) {
    throw new Error(
      `Invalid --local-format "${localFormat}". Use systemone | openai-decisions.`,
    );
  }

  const thresholdRaw = getFlagString(flags, "threshold");
  const threshold = thresholdRaw ? Number(thresholdRaw) : 0.75;
  const minTurnsRaw = getFlagString(flags, "min-turns");
  const minTurns = minTurnsRaw ? Number(minTurnsRaw) : 3;
  const model = getFlagString(flags, "model");
  const localUrl = getFlagString(flags, "local-url") ?? DEFAULT_LOCAL_URL;

  const nextConfig: PartialTopicShiftConfig = {
    enabled: true,
    provider,
    ...(model ? { model } : {}),
    threshold: Number.isFinite(threshold) ? Math.min(1, Math.max(0, threshold)) : 0.75,
    mode,
    language,
    minTurns: Number.isFinite(minTurns) ? Math.max(1, Math.round(minTurns)) : 3,
    openrouter: {
      model: DEFAULT_OPENROUTER_MODEL,
    },
    openai: {
      model: DEFAULT_OPENAI_MODEL,
    },
    local: {
      url: localUrl,
      apiFormat: localFormat,
      model: DEFAULT_LOCAL_MODEL,
    },
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  console.log(`Wrote config to ${configPath}`);
  console.log(JSON.stringify(nextConfig, null, 2));
}

function runDoctor(): void {
  const config = loadConfig({ cwd: process.cwd() });
  const resolved = resolveDecisionProvider(config);

  console.log("Compaction Suggy doctor\n");
  console.log(`User config path : ${getUserConfigPath()}`);
  console.log(`Bypass cache path: ${config.bypassCachePath}`);
  console.log(`Enabled          : ${config.enabled}`);
  console.log(`Mode             : ${config.mode}`);
  console.log(`Language         : ${config.language}`);
  console.log(`Threshold        : ${config.threshold}`);
  console.log(`Timeout (ms)     : ${config.timeoutMs}`);
  console.log(`Min turns / chars: ${config.minTurns} turns / ${config.minContextChars} chars`);
  console.log(`Configured mode  : provider=${config.provider}`);
  console.log(
    `Resolved provider: ${resolved ? `${resolved.name} (${resolved.model})` : "NONE"}`,
  );
  console.log("\nProvider readiness:");
  console.log(
    `  - OpenRouter (Jev)   : ${config.openrouter.apiKey ? "API key set" : "OPENROUTER_API_KEY missing"} (${config.openrouter.model})`,
  );
  console.log(
    `  - OpenAI (GPT-6 Luna): ${config.openai.apiKey ? "API key set" : "OPENAI_API_KEY missing"} (${config.openai.model})`,
  );
  console.log(
    `  - Local Serving      : ${config.local.url} [${config.local.apiFormat}] (${config.local.model})`,
  );
  console.log("\nUser-level hook status:");
  for (const target of ["claude", "codex"] as const) {
    const filePath = getUserSettingsFile(target);
    const installed = isHookInstalledInFile(filePath);
    const label =
      target === "claude"
        ? "Claude Code / Desktop"
        : "Codex CLI / Desktop  ";
    console.log(
      `  - ${label}: ${installed ? "INSTALLED" : "not registered"} (${filePath})`,
    );
  }
}

async function runTest(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig({ cwd: process.cwd() });
  const provider = resolveDecisionProvider(config);
  if (!provider) {
    throw new Error(
      "No Decision Model provider configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or configure local provider via `init --provider local`.",
    );
  }

  const previousContext =
    getFlagString(flags, "context") ??
    [
      "User: PostgreSQL 마이그레이션 스크립트에서 users 테이블 인덱스 생성이 락을 유발해.",
      "Assistant: CREATE INDEX CONCURRENTLY를 사용하고 트랜잭션 블록 밖에서 실행하도록 분리했습니다.",
      "User: 롤백 스크립트도 같이 점검해줘.",
      "Assistant: DROP INDEX CONCURRENTLY 구문과 락 타임아웃 설정을 추가했습니다.",
    ].join("\n");

  const newPrompt =
    getFlagString(flags, "prompt") ??
    "React 대시보드 헤더에 다크모드 토글 버튼과 Tailwind 테마 전환 기능 구현해줘.";

  console.log(`Calling ${provider.name}/${provider.model} (timeout ${config.timeoutMs}ms)...`);
  const result = await provider.decide(
    {
      previousContext,
      newPrompt,
      recentUserTopics: [previousContext.split("\n")[0] ?? ""],
    },
    config.timeoutMs,
  );

  const triggered = result.probability >= config.threshold;
  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        model: result.model,
        probability: result.probability,
        threshold: config.threshold,
        wouldTrigger: triggered,
        mode: config.mode,
        latencyMs: result.latencyMs,
      },
      null,
      2,
    ),
  );
}

function getUserSettingsFile(target: string): string {
  if (target === "claude") {
    return path.join(os.homedir(), ".claude", "settings.json");
  }
  if (target === "codex") {
    return path.join(os.homedir(), ".codex", "hooks.json");
  }
  throw new Error(`Invalid --target "${target}". Expected "claude" or "codex".`);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

interface HookHandlerEntry {
  type?: string;
  command?: string;
  timeout?: number;
}

interface HookGroupEntry {
  matcher?: string;
  hooks?: HookHandlerEntry[];
}

function resolveTargets(target: string): Array<"claude" | "codex"> {
  if (target === "all") return ["claude", "codex"];
  if (target === "claude" || target === "codex") return [target];
  throw new Error(`Invalid --target "${target}". Expected "claude", "codex", or "all".`);
}

function isHookInstalledInFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const root = readJsonObject(filePath);
    const hooksMap =
      root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks)
        ? (root.hooks as Record<string, unknown>)
        : undefined;
    const groups = Array.isArray(hooksMap?.UserPromptSubmit)
      ? (hooksMap.UserPromptSubmit as HookGroupEntry[])
      : [];
    return groups.some(
      (group) =>
        Array.isArray(group?.hooks) &&
        group.hooks.some((h) => isOwnHookCommand(h?.command)),
    );
  } catch {
    return false;
  }
}

function installHookToTarget(target: "claude" | "codex", hookScript: string): void {
  const settingsFile = getUserSettingsFile(target);
  const command = `node "${hookScript}"`;
  const root = readJsonObject(settingsFile);
  const hooksMap =
    root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks)
      ? ({ ...(root.hooks as Record<string, unknown>) })
      : {};

  const existingGroups = Array.isArray(hooksMap.UserPromptSubmit)
    ? ([...(hooksMap.UserPromptSubmit as HookGroupEntry[])])
    : [];

  const alreadyInstalled = existingGroups.some(
    (group) =>
      Array.isArray(group?.hooks) &&
      group.hooks.some((h) => isOwnHookCommand(h?.command)),
  );

  if (alreadyInstalled) {
    console.log(`Hook already registered in ${settingsFile}`);
    return;
  }

  existingGroups.push({
    hooks: [
      {
        type: "command",
        command,
        timeout: 10,
      },
    ],
  });

  hooksMap.UserPromptSubmit = existingGroups;
  root.hooks = hooksMap;

  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  console.log(`Registered UserPromptSubmit hook in ${settingsFile}`);
  console.log(`Command: ${command}`);
}

function runInstallUser(flags: Record<string, string | boolean>): void {
  const target = getFlagString(flags, "target");
  if (!target) {
    throw new Error("Missing required --target claude | codex | all");
  }

  const hookScript = resolveHookScriptPath();
  if (!fs.existsSync(hookScript)) {
    throw new Error(`Bundled hook script not found at ${hookScript}. Run npm run build first.`);
  }

  for (const t of resolveTargets(target)) {
    installHookToTarget(t, hookScript);
  }
}

function uninstallHookFromTarget(target: "claude" | "codex"): void {
  const settingsFile = getUserSettingsFile(target);
  if (!fs.existsSync(settingsFile)) {
    console.log(`No settings file found at ${settingsFile}`);
    return;
  }

  const root = readJsonObject(settingsFile);
  const hooksMap =
    root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks)
      ? ({ ...(root.hooks as Record<string, unknown>) })
      : {};

  if (!Array.isArray(hooksMap.UserPromptSubmit)) {
    console.log(`No UserPromptSubmit hooks found in ${settingsFile}`);
    return;
  }

  const filtered = (hooksMap.UserPromptSubmit as HookGroupEntry[]).filter(
    (group) =>
      !(
        Array.isArray(group?.hooks) &&
        group.hooks.some((h) => isOwnHookCommand(h?.command))
      ),
  );

  hooksMap.UserPromptSubmit = filtered;
  root.hooks = hooksMap;
  fs.writeFileSync(settingsFile, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  console.log(`Removed Compaction Suggy UserPromptSubmit hook from ${settingsFile}`);
}

function runUninstallUser(flags: Record<string, string | boolean>): void {
  const target = getFlagString(flags, "target");
  if (!target) {
    throw new Error("Missing required --target claude | codex | all");
  }

  for (const t of resolveTargets(target)) {
    uninstallHookFromTarget(t);
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "init":
      runInit(flags);
      break;
    case "doctor":
      runDoctor();
      break;
    case "test":
      await runTest(flags);
      break;
    case "install-user":
      runInstallUser(flags);
      break;
    case "uninstall-user":
      runUninstallUser(flags);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
