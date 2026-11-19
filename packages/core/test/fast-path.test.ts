import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDefaultConfig } from "../dist/config.js";
import { checkPromptFastPath } from "../dist/fast-path.js";

describe("checkPromptFastPath", () => {
  const cfg = getDefaultConfig();

  it("skips slash commands", () => {
    assert.equal(checkPromptFastPath("/compact", cfg), "slash_command");
    assert.equal(checkPromptFastPath("  /clear  ", cfg), "slash_command");
  });

  it("skips explicit override prefixes", () => {
    assert.equal(
      checkPromptFastPath("!keep Now switch to React UI work", cfg),
      "override_prefix",
    );
    assert.equal(
      checkPromptFastPath("[keep] Different topic but keep context", cfg),
      "override_prefix",
    );
  });

  it("skips short EN/KR acknowledgements", () => {
    assert.equal(checkPromptFastPath("ok!", cfg), "short_acknowledgement");
    assert.equal(checkPromptFastPath("진행해줘.", cfg), "short_acknowledgement");
    assert.equal(checkPromptFastPath("LGTM", cfg), "short_acknowledgement");
  });

  it("skips prompts shorter than minPromptChars", () => {
    assert.equal(checkPromptFastPath("why?", cfg), "short_prompt");
  });

  it("skips when disabled", () => {
    assert.equal(
      checkPromptFastPath("Completely new long prompt here", { ...cfg, enabled: false }),
      "disabled",
    );
  });

  it("allows normal substantive prompts through", () => {
    assert.equal(
      checkPromptFastPath("React 대시보드에 다크모드 토글을 추가해줘.", cfg),
      undefined,
    );
  });
});
