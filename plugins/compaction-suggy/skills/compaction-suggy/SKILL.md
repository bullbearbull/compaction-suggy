---
name: compaction-suggy
description: Configure, tune, test, or troubleshoot the Compaction Suggy UserPromptSubmit hook plugin (OpenRouter Jev, OpenAI GPT-6 Luna, or local Ollama/vLLM Decision Model). Use when the user asks to configure, disable, adjust threshold, switch decision model provider, or debug topic-shift compaction suggestions.
---

# Compaction Suggy

This plugin registers a `UserPromptSubmit` hook that evaluates whether an incoming prompt shifts sharply away from the current conversation topic using a fast Decision Model API, and suggests running `/compact` before processing.

## Configuration

Configuration is loaded in order (higher overrides lower):
1. `${PLUGIN_DATA}/config.json` or `${CLAUDE_PLUGIN_DATA}/config.json`
2. `~/.config/topic-shift-compact/config.json` (or `$TSC_CONFIG_PATH`)
3. `<project>/.topic-shift-compact.json`
4. Environment variables (`TSC_*`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)

### Supported Decision Providers

- **OpenRouter Jev** (`provider: "openrouter"`):
  - Requires `OPENROUTER_API_KEY`
  - Endpoint: `https://openrouter.ai/api/alpha/decisions`
  - Default model: `typesafe/jev-latest`
- **OpenAI GPT-6 Luna** (`provider: "openai"`):
  - Requires `OPENAI_API_KEY`
  - Endpoint: `https://api.openai.com/v1/decisions`
  - Default model: `gpt-6-luna`
- **Local Decision Model** (`provider: "local"`):
  - Ollama v0.35+: `http://localhost:11434/v1/systemone` (`local.apiFormat: "systemone"`, models: `tev1`, `nimble`)
  - vLLM Semantic Router / LiteLLM: `http://localhost:8000/v1/decisions` (`local.apiFormat: "openai-decisions"`, models: `d3-mini`, `d3`)

## Helper CLI Commands

Run using the bundled `cli.mjs` inside this plugin (`${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs` or `${PLUGIN_ROOT}/dist/cli.mjs`):

```bash
# Inspect active config and provider readiness
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" doctor

# Initialize user config with a specific provider
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" init --provider openrouter --threshold 0.75
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" init --provider openai --model gpt-6-luna
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" init --provider local --local-url http://localhost:11434/v1/systemone --model tev1

# Send a live test decision query
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" test

# Fallback user-level hook install (recommended for Claude Desktop Cowork VM)
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.mjs" install-user --target claude
```

## Quick Overrides

- Re-submit the exact same prompt once to bypass a block automatically.
- Prefix a prompt with `!keep ` or `[keep] ` to skip topic-shift detection for that turn.
- Set `TSC_DISABLED=1` to temporarily disable the hook.
- Set `TSC_MODE=advisory` if you prefer non-blocking hints instead of blocking on topic shifts.
- Set `TSC_DEBUG=1` to inspect decision probabilities and latencies on `stderr`.
