---
description: Summarize active decisions from this thread and generate a tailored /compact instruction for a clean handoff.
---

Review the current conversation from the last compaction boundary (or session start) and prepare a clean compaction handoff for the user in the same language they have been using (Korean or English):

1. **Current Active Topic (1 line)**: Identify the main task or subsystem currently being worked on.
2. **Essential State to Preserve (3–5 short bullets)**: List only durable facts (key decisions, modified files/interfaces, remaining TODOs, open constraints). Omit dead ends, resolved errors, and verbose tool output.
3. **Ready-to-Run Command**: Provide a single copy-ready `/compact <focus instructions>` line tailored to keep the essential state above while dropping older noise. If the user is pivoting to a completely unrelated topic, note that `/clear` or a new chat is even cleaner.
