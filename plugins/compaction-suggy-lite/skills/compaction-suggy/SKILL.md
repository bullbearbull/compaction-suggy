---
name: compaction-suggy
description: Proactively detects abrupt topic shifts in long conversations and suggests running /compact (or starting a fresh chat) with a tailored compaction focus prompt before diving into an unrelated task. Use whenever the user switches to a new subsystem, domain, or independent task after several turns of prior context, or asks whether it is time to compact the conversation.
---

# Compaction Suggy (Lite)

Help the user avoid context rot and unnecessary token usage when a long conversation shifts abruptly to an unrelated topic.

## When to Suggest Compaction

Suggest running `/compact` (or opening a new chat) **before** starting a long response when **all** of the following hold:

1. **Substantial prior context exists**: The current session already has at least 3 substantive user turns (or heavy debugging/editing back-and-forth) since session start or the last compaction.
2. **Clear topic divergence**: The user's newest message starts an unrelated task, switches to a different subsystem/domain, or asks an independent question that does not depend on the earlier conversation details.
3. **Not a continuation or override**: Do **not** interrupt for short follow-ups (`ok`, `go ahead`, `thanks`, `응`, `진행해줘`), refinements of the active task, slash commands, or messages explicitly prefixed with `!keep` / `[keep]`.

## How to Respond When a Topic Shift Is Detected

Keep the suggestion brief, polite, and immediately actionable in the user's language (Korean if the user writes in Korean; English otherwise):

1. **One-line notice**: Briefly note that the new request shifts away from the earlier topic (mentioning the prior topic in 3–5 words).
2. **Copy-ready `/compact` suggestion**: Provide a tailored `/compact` command summarizing only what is worth keeping (or recommend `/clear` / a fresh chat if nothing from the previous topic is needed).
   - Example (English):
     > Notice: This switches from *PostgreSQL index debugging* to a new *React dark-mode* task. To keep context clean and fast, consider running `/compact Keep only project conventions and drop the PostgreSQL debugging details` (or `/clear` for a fresh slate), then re-send your request.
   - Example (Korean):
     > 안내: 이전 주제(*PostgreSQL 인덱스 디버깅*)에서 새 주제(*React 다크모드 구현*)로 전환된 것으로 보입니다. 컨텍스트를 깔끔하게 유지하려면 `/compact 이전 PostgreSQL 디버깅 내용은 비우고 프로젝트 기본 규칙만 유지` 또는 `/clear` 후 진행해 보세요.
3. **Do not block small answers**: If the user's new question is short and self-contained (answerable in 2–4 lines), answer it concisely first and place the compaction tip at the end so you stay helpful without friction. If the new task is large or multi-step, pause with the 2–3 line compaction suggestion and offer to proceed immediately if they prefer to stay in the current thread.

## Manual Slash Commands

- `/suggest-compact`: Generate a concise compaction focus summary and ready-to-run `/compact` instruction for the current session.
- `/topic-check`: Audit the current conversation thread for topic drift and recommend whether to continue, `/compact`, or start a fresh session.
