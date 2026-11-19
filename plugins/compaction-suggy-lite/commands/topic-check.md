---
description: Check whether the conversation has drifted across unrelated topics and recommend continue, /compact, or /clear.
---

Evaluate the current conversation history and give the user a concise context-health check in their language (Korean or English):

1. **Topics Covered**: List the distinct topics discussed since the session started or was last compacted (1 line each).
2. **Drift Assessment**: State clearly whether the latest requests still belong to the same thread (`Low drift`), partially overlap (`Moderate drift`), or represent a separate task (`High drift`).
3. **Recommendation**: Give one clear recommendation:
   - **Continue**: Context is still focused; no compaction needed.
   - **Run `/compact`**: Provide a one-line tailored `/compact <focus>` command.
   - **Start fresh (`/clear` / New Chat)**: Prior context is no longer relevant to the current task.
