# compaction-suggy

Ultra-low-latency **topic-shift detection & `/compact` advisor** for **Claude Code**, **Claude Desktop (Code/Cowork)**, and **OpenAI Codex (CLI / Desktop / IDE)** — powered by **Decision Model APIs** (**OpenRouter Jev**, **OpenAI GPT-6 Luna**, or **Local Ollama / vLLM**).

Zero runtime dependencies (~40 KB standalone hook).

---

## Quick Start (1 Minute)

### 1. Install the `UserPromptSubmit` hook

```bash
# Auto-detect installed Claude Code and/or Codex and install
npx compaction-suggy install

# Or specify target explicitly: claude | codex | all
npx compaction-suggy install --target claude
npx compaction-suggy install --target codex
npx compaction-suggy install --target all
```

> `install` copies a self-contained zero-dependency `hook.mjs` to `~/.local/share/compaction-suggy/hook.mjs` (or `%LOCALAPPDATA%\compaction-suggy\hook.mjs` on Windows) and registers `node <path>` directly in `~/.claude/settings.json` / `~/.codex/hooks.json`. That gives **~25ms startup latency** with zero `npx` overhead and keeps working even if npm clears its `_npx` cache.

### 2. Configure your Decision Model backend

Choose one of the 3 supported Decision Model providers:

```bash
# Option A: OpenRouter Jev (recommended — ultra-fast)
export OPENROUTER_API_KEY="sk-or-..."
npx compaction-suggy init --provider openrouter --model typesafe/jev-latest

# Option B: OpenAI GPT-6 Luna (/v1/decisions)
export OPENAI_API_KEY="sk-..."
npx compaction-suggy init --provider openai --model gpt-6-luna

# Option C: Local Ollama v0.35+ (free & private)
ollama pull tev1
npx compaction-suggy init \
  --provider local \
  --local-url http://localhost:11434/v1/systemone \
  --local-format systemone \
  --model tev1
```

### 3. Verify & Test

```bash
npx compaction-suggy doctor
npx compaction-suggy test
```

---

## How It Works

1. **Zero-Latency Fast-Path**: Slash commands (`/compact`, `/clear`), short confirmations (`ok`, `LGTM`, `응`, `진행해줘`), `!keep ` / `[keep] ` overrides, and early turns (`< minTurns` since session start or last compaction) pass instantly with 0 API calls.
2. **Compaction-Aware Window**: Reads only turns **after the latest compaction boundary** from Claude Code or Codex `.jsonl` transcripts.
3. **Decision Model Check**: Sends a compact sliding window + your new prompt to your Decision Model (`timeout: 2500ms`, **fail-open** on errors/timeouts so your work is never blocked).
4. **One-Shot Bypass**: When `block` mode pauses to suggest `/compact`, simply re-submit the exact same prompt once to proceed anyway.

---

## Commands

| Command | Description |
| :--- | :--- |
| `npx compaction-suggy install [--target claude\|codex\|all]` | Copy standalone hook binary & register `UserPromptSubmit` hook |
| `npx compaction-suggy uninstall [--target claude\|codex\|all]` | Remove hooks & clean up standalone binary |
| `npx compaction-suggy init [options]` | Create `~/.config/topic-shift-compact/config.json` |
| `npx compaction-suggy doctor` | Check config, credentials, binary, and Claude/Codex hook status |
| `npx compaction-suggy test` | Send a live topic-shift test query to your configured Decision Model |

## Full Ecosystem

Looking for the **ChatGPT Web & Claude.ai Web Chrome/Edge Extension** or **Claude Code Marketplace / Mods**?

https://github.com/bullbearbull/compaction-suggy
