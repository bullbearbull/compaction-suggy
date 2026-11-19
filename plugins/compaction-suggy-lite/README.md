# Compaction Suggy (Lite)

Lightweight, pure-instruction **topic-shift awareness and context compaction advisor** for Claude.

Compaction Suggy Lite helps prevent context rot in long conversations by recognizing when your requests diverge onto a new, unrelated topic and offering tailored `/compact` or fresh-thread recommendations — with zero external scripts or background processes.

## What Is Included

- **Skill (`compaction-suggy`)**: Guides Claude to notice abrupt topic switches after several turns of prior context and proactively offer a concise `/compact` focus command (or `/clear`) in English or Korean.
- **`/suggest-compact`**: Summarizes essential active context (decisions, modified files, open TODOs) and outputs a copy-ready `/compact` command.
- **`/topic-check`**: Audits the current thread for topic drift and recommends whether to continue, compact, or start fresh.

## Quick Usage

- Keep working normally — when you pivot to an unrelated task in a long thread, Claude briefly suggests a tailored `/compact` instruction before starting a heavy response.
- Prefix a prompt with `!keep` or `[keep]` whenever you want to skip compaction suggestions for that turn.
- Run `/suggest-compact` anytime you want a clean compaction prompt, or `/topic-check` to inspect context drift.

## Full Automated Edition

Looking for automated pre-submission interception powered by ultra-low-latency Decision Models (plus the ChatGPT & Claude.ai browser extension and OpenAI Codex support)? Visit the open-source repository:

https://github.com/bullbearbull/compaction-suggy
