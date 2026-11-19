# Compaction Suggy

Topic-shift detection & context compaction assistant across **ChatGPT Web**, **Claude.ai Web**, **Claude Code (Hooks & In-Process Mods)**, **Claude Desktop (Code & Cowork)**, and **OpenAI Codex (CLI / Desktop / IDE)** — powered by ultra-low-latency **Decision Model APIs**.

Before the main LLM processes your new prompt, **Compaction Suggy** compares it against the active conversation window using a Decision Model (`0.0 ~ 1.0` probability). When your new request shifts abruptly to an unrelated topic, it offers a clean **New Chat / Compact Handoff** (ChatGPT & Claude.ai Web) or `/compact` suggestion (Claude Code & OpenAI Codex) so you avoid context rot and wasted tokens.

---

## Supported Platforms

| Platform | Package / Plugin | Integration Mode |
| :--- | :--- | :--- |
| **ChatGPT Web** (`chatgpt.com`) | `packages/browser-extension` | Chrome / Edge MV3 extension — intercepts Enter/Send, offers **New Chat**, **Compact Handoff**, or **Send here** |
| **Claude Web** (`claude.ai`) | `packages/browser-extension` | Same unified Chrome / Edge MV3 extension — native terracotta UI, ProseMirror/TipTap adapter, `/new` handoff |
| **Claude Code** (CLI / IDE, all versions) | `plugins/compaction-suggy` | Universal `UserPromptSubmit` hook plugin (`compaction-suggy@compaction-suggy-marketplace`) |
| **Claude Code Mods** (v2.1.287+) | `plugins/compaction-suggy-mod` | In-process worker-thread Mod (`compaction-suggy-mod@compaction-suggy-marketplace`) — zero subprocess spawn overhead + UI toasts |
| **Claude Desktop** (Code / Cowork) | `plugins/compaction-suggy` | Shared Claude Code hook + `cli.mjs install-user --target claude` (`~/.claude/settings.json` fallback for Cowork) |
| **OpenAI Codex** (CLI / Codex Desktop / ChatGPT Desktop Codex / IDE) | `plugins/compaction-suggy` | Codex plugin marketplace + `cli.mjs install-user --target codex` (`~/.codex/hooks.json`) |
| **ChatGPT Desktop / Claude Desktop** (general Chat tab) | *N/A* | Neither native desktop app exposes pre-send prompt interception APIs for general chat tabs (use Web + extension for general chat, and hooks above for Codex / Claude Code / Cowork) |

---

## Supported Decision Model Backends

| Provider | Endpoint | Default Model | API Format |
| :--- | :--- | :--- | :--- |
| **OpenRouter (Jev)** | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-latest` | System One (`type: "noul"`) |
| **OpenAI (GPT-6 Luna)** | `https://api.openai.com/v1/decisions` | `gpt-6-luna` | OpenAI Decisions (`type: "predicate"`) |
| **Local Serving** | `http://localhost:11434/v1/systemone` (Ollama v0.35+)<br>`http://localhost:8000/v1/decisions` (vLLM / LiteLLM) | `tev1` (or `nimble`, `d3-mini`) | `systemone` or `openai-decisions` |

---

## 1. Browser Extension (ChatGPT Web + Claude.ai Web)

See [packages/browser-extension/README.md](packages/browser-extension/README.md) for step-by-step loading, testing, and Chrome Web Store publishing instructions:

```bash
npm run build              # Builds packages/browser-extension/dist/ (chrome://extensions -> Load unpacked)
npm run package:extension  # Builds release/compaction-suggy-extension-v0.1.0.zip for Chrome Web Store / Edge Add-ons
npm run mock-server        # Optional local mock Decision API server for zero-cost UI testing
```

---

## 2. Plugin Marketplace Installation (Claude Code & OpenAI Codex)

### Claude Code (Universal Hook or In-Process Mod)

```bash
claude plugin marketplace add https://github.com/bullbearbull/compaction-suggy

# Universal hook plugin (works on all Claude Code versions + Claude Desktop Code/Cowork):
claude plugin install compaction-suggy@compaction-suggy-marketplace

# Or In-Process Mod (Claude Code 2.1.287+, zero subprocess spawn overhead + UI toasts):
claude plugin install compaction-suggy-mod@compaction-suggy-marketplace
```

### OpenAI Codex (CLI / Codex Desktop / ChatGPT Desktop Codex / IDE)

```bash
codex plugin marketplace add https://github.com/bullbearbull/compaction-suggy
codex plugin install compaction-suggy@compaction-suggy-marketplace
```

### One-Command Local User-Level Install (Claude + Codex Together)

Useful for **Claude Desktop Cowork** (`--setting-sources user`) or quick local testing without marketplace install:

```bash
# Register hooks in BOTH ~/.claude/settings.json and ~/.codex/hooks.json
node plugins/compaction-suggy/dist/cli.mjs install-user --target all

# Or individually: --target claude | --target codex
```

> Note: Codex requires trusting newly registered hooks on first use via `/hooks` (CLI) or Desktop **Settings → Hooks**.

---

## 3. CLI Provider Setup (Claude Code & Codex)

```bash
# Option 1: OpenRouter (typesafe/jev-latest)
export OPENROUTER_API_KEY="sk-or-..."
node plugins/compaction-suggy/dist/cli.mjs init --provider openrouter --model typesafe/jev-latest

# Option 2: OpenAI (gpt-6-luna)
export OPENAI_API_KEY="sk-..."
node plugins/compaction-suggy/dist/cli.mjs init --provider openai --model gpt-6-luna

# Option 3: Local Ollama v0.35+ (tev1)
ollama pull tev1
node plugins/compaction-suggy/dist/cli.mjs init \
  --provider local \
  --local-url http://localhost:11434/v1/systemone \
  --local-format systemone \
  --model tev1

# Verify config, credentials, and installed hooks
node plugins/compaction-suggy/dist/cli.mjs doctor
node plugins/compaction-suggy/dist/cli.mjs test
```

---

## Configuration Reference

Config precedence (lowest to highest):
1. `${PLUGIN_DATA}/config.json` (or `${CLAUDE_PLUGIN_DATA}/config.json`, `${CODEX_PLUGIN_DATA}/config.json`)
2. `~/.config/topic-shift-compact/config.json` (or `$TSC_CONFIG_PATH`)
3. `<project>/.topic-shift-compact.json`
4. Environment variables (`TSC_*`)

| Env Var | JSON Key | Default | Description |
| :--- | :--- | :--- | :--- |
| `TSC_PROVIDER` | `provider` | `auto` | `openrouter`, `openai`, `local`, or `auto` (`openrouter` → `openai` → `local`) |
| `TSC_MODEL` | `model` | provider default | Override model ID |
| `TSC_THRESHOLD` | `threshold` | `0.75` | Shift probability (`0.0`–`1.0`) required to suggest compaction |
| `TSC_MODE` | `mode` | `block` | `block` (pause & suggest `/compact`) or `advisory` (inject hint only) |
| `TSC_LANGUAGE` | `language` | `auto` | `auto` (detect Korean/English), `ko`, or `en` |
| `TSC_MIN_TURNS` | `minTurns` | `3` (CLI) / `2` (Web) | Minimum user turns since start/compaction before calling API |
| `TSC_MIN_CONTEXT_CHARS` | `minContextChars` | `150` (CLI) / `80` (Web) | Minimum context chars before calling API |
| `TSC_TIMEOUT_MS` | `timeoutMs` | `2500` | HTTP request timeout (fails open on timeout) |
| `TSC_LOCAL_URL` | `local.url` | `http://localhost:11434/v1/systemone` | Local decision server endpoint |
| `TSC_LOCAL_API_FORMAT` | `local.apiFormat` | `systemone` | `systemone` (Ollama/Jev) or `openai-decisions` (vLLM/LiteLLM) |
| `TSC_DISABLED` | `enabled` | `false` (`enabled: true`) | Set `TSC_DISABLED=1` to temporarily disable |
| `TSC_DEBUG` | `debug` | `false` | Set `TSC_DEBUG=1` to log decision scores and latency |

---

## Repository Structure

```text
compaction-suggy/
├── .claude-plugin/marketplace.json            # Claude Code Marketplace (compaction-suggy + compaction-suggy-mod)
├── .agents/plugins/marketplace.json           # OpenAI Codex / Agent Marketplace (compaction-suggy)
├── packages/
│   ├── core/                                  # Shared zero-dependency Decision Engine (Node + Browser)
│   ├── cli-hook/                              # Universal UserPromptSubmit hook + CLI helper
│   ├── claude-mod/                            # In-process Claude Code Mod (Mods API 2.1.287+)
│   └── browser-extension/                     # Unified Chrome/Edge MV3 Extension (ChatGPT Web + Claude.ai Web)
├── plugins/
│   ├── compaction-suggy/                      # Universal Claude Code + Codex hook plugin (zero-dep bundles)
│   └── compaction-suggy-mod/                  # In-process Claude Code Mod plugin (zero-dep bundle)
└── scripts/                                   # esbuild bundler, icon generator, extension packager, mock server
```

---

## Development

```bash
npm install
npm run build              # Typecheck + build all plugins, Claude Mod, and unified Browser Extension
npm test                   # Run all unit, bundle, Mod, and E2E tests
npm run package:extension  # Build release/compaction-suggy-extension-v0.1.0.zip
```

> Always run `npm run build` before committing so `plugins/*/dist/` stays up to date for zero-dependency marketplace installs.
