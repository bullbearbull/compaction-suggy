# Compaction Suggy — Claude Code Mod (In-Process)

In-process **Claude Code Mods API (v2.1.287+)** edition of **Compaction Suggy**.

Unlike the standard shell-hook plugin (`plugins/compaction-suggy`), this mod runs directly inside Claude Code's worker thread with **zero Node subprocess spawn overhead** and displays native UI toast notifications when a topic shift is detected.

## Install

```bash
claude plugin marketplace add https://github.com/bullbearbull/compaction-suggy
claude plugin install compaction-suggy-mod@compaction-suggy-marketplace
```

> Using Claude Code < 2.1.287, Claude Desktop Cowork, or OpenAI Codex? Install the universal hook plugin `compaction-suggy@compaction-suggy-marketplace` instead.
