# Compaction Suggy Plugin

UserPromptSubmit hook plugin for **Claude Code** and **OpenAI Codex** (CLI, Desktop app, and IDE) that detects abrupt topic shifts via Decision Model APIs (**OpenRouter Jev**, **OpenAI GPT-6 Luna**, or **Local Ollama/vLLM**) and suggests running `/compact`.

## Quick Start

```bash
# Check status
node dist/cli.mjs doctor

# Configure provider (openrouter | openai | local)
node dist/cli.mjs init --provider openrouter

# Run a live test
node dist/cli.mjs test
```

See the root [README.md](../../README.md) for full configuration and marketplace installation details.
