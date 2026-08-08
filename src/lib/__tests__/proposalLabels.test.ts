/**
 * The `origin` string's format, composed and read back (mcp_support.md phase 5).
 *
 * Both halves live in one module so the format has one definition; these pin
 * that they agree — a composer whose output its own reader mislabels would put
 * the wrong machine's name in the review rail, which is worse than putting none.
 */
import { describe, expect, it } from "vitest";
import { agentOrigin, originLabel } from "../proposalLabels";

describe("agentOrigin", () => {
  it("is the bare agent name when there is no instance", () => {
    expect(agentOrigin("claude-code")).toBe("claude-code");
    expect(agentOrigin("claude-code", null)).toBe("claude-code");
    expect(agentOrigin("claude-code", "")).toBe("claude-code");
  });

  it("appends an instance", () => {
    expect(agentOrigin("claude-code", "laptop")).toBe("claude-code:laptop");
  });

  it("cannot be made to smuggle a separator", () => {
    // Token names are user-supplied and this runs on a write path. A name
    // containing ":" must not be able to fake a different agent.
    expect(agentOrigin("claude-code", "a:b")).toBe("claude-code:a-b");
    expect(agentOrigin("claude-code", "copilot:x")).toBe("claude-code:copilot-x");
  });

  it("sanitises rather than rejects", () => {
    // Refusing a proposal because someone named their token oddly would be a
    // worse outcome than storing a tidied name.
    expect(agentOrigin("claude-code", "my laptop")).toBe("claude-code:my-laptop");
    // The space becomes "-" first, then "/" and "#" are dropped.
    expect(agentOrigin("claude-code", "ci/build #2")).toBe("claude-code:cibuild-2");
    // A name of nothing but junk degrades to no instance, not to a dangling ":".
    expect(agentOrigin("claude-code", "!!!")).toBe("claude-code");
  });

  it("caps the length", () => {
    const long = agentOrigin("claude-code", "x".repeat(200));
    expect(long.length).toBeLessThanOrEqual("claude-code:".length + 32);
  });
});

describe("originLabel", () => {
  it("names the agents it knows", () => {
    expect(originLabel("claude-code")).toBe("Claude Code");
    expect(originLabel("copilot")).toBe("Copilot");
  });

  it("falls back to the raw string rather than a shrug", () => {
    // Which writer it was is the field's whole content, so an unrecognised
    // value is still more informative than "Unknown".
    expect(originLabel("some-future-agent")).toBe("some-future-agent");
    expect(originLabel(null)).toBe("Agent");
    expect(originLabel(undefined)).toBe("Agent");
  });

  it("reads back what agentOrigin wrote", () => {
    expect(originLabel(agentOrigin("claude-code", "laptop")))
      .toBe("Claude Code (laptop)");
    expect(originLabel(agentOrigin("claude-code"))).toBe("Claude Code");
    expect(originLabel(agentOrigin("some-future-agent", "ci")))
      .toBe("some-future-agent (ci)");
  });

  it("does not choke on a malformed value from the database", () => {
    // `origin` is a free-form column; nothing stops an older row or a hand-run
    // script from holding something this format never produced.
    expect(originLabel("claude-code:")).toBe("Claude Code");
    expect(originLabel(":laptop")).toBe(" (laptop)");
  });
});
