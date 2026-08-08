/**
 * Registry ↔ tool-schema parity (plan §10).
 *
 * This is the spec that keeps §3.1's guarantee — "you cannot ship a feature the
 * AI can't call" — from being a habit. It asserts the properties that make the
 * derivation total rather than the contents of any one command, so adding a
 * command never means editing this file, and adding a *broken* one always does.
 *
 * DOM-free by construction: importing `@/commands` under `environment: "node"`
 * is itself part of the test. The registry must not acquire a static edge to
 * `@/store` (and through it to IndexedDB), because `api/copilot/route.ts`
 * imports this same graph on the server — see the note in `commands/ui.ts`.
 */
import { type CommandContext, commandRegistry } from "@/commands";
import {
  buildCommandTools,
  commandForTool,
  commandInputSchema,
  commandToolDescription,
  isAutoRunTool,
  isProposalTool,
  toolDisposition,
  toolNameForCommand,
} from "@/lib/ai/commandTools";
import { READ_TOOLS, WRITE_TOOLS } from "@/lib/ai/copilotAgentTools";
import { COPILOT_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

/** What every major provider accepts as a tool name. */
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

describe("command registry", () => {
  it("is non-empty", () => {
    expect(commandRegistry.length).toBeGreaterThan(0);
  });

  it("has unique, namespaced ids", () => {
    const ids = commandRegistry.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/);
    }
  });

  it("declares no URL-shaped command (plan §3.2)", () => {
    for (const command of commandRegistry) {
      expect(command.id).not.toMatch(/navigate|goto|url|href|route/i);
      const properties = Object.keys(
        (commandInputSchema(command).properties ?? {}) as object,
      );
      expect(properties).not.toContain("url");
      expect(properties).not.toContain("href");
      expect(properties).not.toContain("path");
    }
  });
});

describe("zod → JSON Schema", () => {
  it("converts every command's params to an object schema", () => {
    for (const command of commandRegistry) {
      const schema = commandInputSchema(command);
      expect(schema.type, `${command.id} params`).toBe("object");
      expect(typeof schema.properties).toBe("object");
    }
  });

  it("gives a parameterless command an empty object, not a bare {}", () => {
    // `z.void()` converts to a schema with no `type`, which providers reject
    // for tool input. `commandInputSchema` normalizes it; this is the case that
    // would otherwise ship a declaration the model cannot call.
    const parameterless = commandRegistry.filter(
      (c) =>
        Object.keys((commandInputSchema(c).properties ?? {}) as object)
          .length === 0,
    );
    expect(parameterless.length).toBeGreaterThan(0);
    for (const command of parameterless) {
      expect(commandInputSchema(command)).toEqual({
        type: "object",
        properties: {},
        additionalProperties: false,
      });
    }
  });

  it("keeps required parameters required", () => {
    // A regression here would let the model omit an id and have the call
    // validated only by the command's own zod parse, after the round trip.
    const open = commandRegistry.find((c) => c.id === "document.open");
    expect(open).toBeDefined();
    expect(commandInputSchema(open!).required).toEqual(["id"]);
  });
});

describe("generated tool list", () => {
  const tools = buildCommandTools();

  it("contains exactly one tool per registry command", () => {
    expect(Object.keys(tools).length).toBe(commandRegistry.length);
    for (const command of commandRegistry) {
      const name = toolNameForCommand(command.id);
      expect(tools[name], `${command.id} is missing from the tool list`)
        .toBeDefined();
      expect(commandForTool(name)).toBe(command);
    }
  });

  it("names tools legally and uniquely", () => {
    const names = Object.keys(tools);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(TOOL_NAME);
  });

  it("never collides with a hand-written content tool", () => {
    const content = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS]);
    for (const name of Object.keys(tools)) {
      expect(content.has(name), `${name} collides with a content tool`)
        .toBe(false);
    }
  });

  it("describes every tool", () => {
    for (const command of commandRegistry) {
      expect(commandToolDescription(command).length).toBeGreaterThan(0);
    }
  });

  it("routes every tool to exactly one of auto-run or propose", () => {
    for (const command of commandRegistry) {
      const name = toolNameForCommand(command.id);
      expect(isAutoRunTool(name)).toBe(command.effect === "read");
      expect(isProposalTool(name)).toBe(command.effect === "mutate");
    }
  });
});

describe("content tools", () => {
  // The command tools describe themselves into the prompt (`commandToolsPromptSection`);
  // the content tools do not — their listing in COPILOT_AGENT_SYSTEM_PROMPT is
  // hand-written, so it is the one place in the surface that can silently
  // describe a tool set the request does not send. A tool the prompt never
  // names is one the model rarely reaches for, which looks like a capability
  // gap rather than a missing line.
  const prompt = COPILOT_AGENT_SYSTEM_PROMPT(null, null);

  /**
   * The names the CONTENT TOOLS section actually lists, one per `- name: …`
   * line.
   *
   * Matched as listing entries rather than as substrings anywhere in the
   * prompt, because since the §4.2 rename two tools are ordinary English words:
   * `toContain("search")` and `toContain("outline")` are satisfied by the prose
   * around them, so a half-finished rename would pass a substring check while
   * the listing still advertised `search_documents`.
   */
  const listed = (prompt.split("CONTENT TOOLS\n")[1] ?? "")
    .split("\n\n")[0]
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(":")[0]);

  it("names every content tool in the system prompt", () => {
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
      expect(listed, `${name} is declared but never described`).toContain(name);
    }
  });

  it("describes no content tool it does not declare", () => {
    // The other direction, and the one a rename breaks: a listing entry for a
    // tool the request never sends is a capability the model will try to use
    // and be told does not exist.
    const declared = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS]);
    for (const name of listed) {
      expect(declared.has(name), `${name} is described but never declared`)
        .toBe(true);
    }
  });

  it("resolves a content write on arrival and holds no chat proposal for it", () => {
    // The §4.4 decision, as an assertion: a content write is neither a read nor
    // a chat proposal. Putting it back in `proposal` would leave an Accept in
    // the transcript that no longer applies anything — the edit is already
    // stored, and the author answers it on the document.
    for (const name of WRITE_TOOLS) {
      expect(toolDisposition(name)).toBe("write");
      expect(isAutoRunTool(name)).toBe(true);
      expect(isProposalTool(name)).toBe(false);
    }
    for (const name of READ_TOOLS) {
      expect(toolDisposition(name)).toBe("read");
      expect(isProposalTool(name)).toBe(false);
    }
  });

  it("names them legally and uniquely", () => {
    const names = [...READ_TOOLS, ...WRITE_TOOLS];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(TOOL_NAME);
  });
});

describe("mutate commands", () => {
  it("all have a preview", () => {
    // The invariant the proposal UI rests on: a `mutate` tool call is never
    // executed on arrival, so `preview()` is the only thing the user sees
    // before accepting it. A mutate command without one renders as its title
    // and nothing else.
    for (const command of commandRegistry) {
      if (command.effect !== "mutate") continue;
      expect(
        typeof command.previewInvoke,
        `${command.id} is a mutate command with no preview()`,
      ).toBe("function");
    }
  });

  it("says so in the tool description", () => {
    for (const command of commandRegistry) {
      if (command.effect !== "mutate") continue;
      expect(commandToolDescription(command)).toContain("PROPOSAL");
    }
  });
});

describe("workspace.describe (plan §6.2)", () => {
  const describeCommand = commandRegistry.find(
    (c) => c.id === "workspace.describe",
  );

  it("exists as a read command taking no parameters", () => {
    expect(describeCommand).toBeDefined();
    expect(describeCommand!.effect).toBe("read");
    expect(commandInputSchema(describeCommand!).properties).toEqual({});
  });

  it("answers with the panes it is given", async () => {
    const panes = [
      {
        id: "pane-1",
        docId: "doc-a",
        title: "Left",
        mode: "write" as const,
        focused: true,
      },
    ];
    // Only `workspace` is read; the rest of the context is never touched by
    // this command, and a partial stand-in keeps the spec from having to build
    // a Redux store and a router to assert a projection.
    const ctx = { workspace: { panes } } as unknown as CommandContext;
    const result = await describeCommand!.invoke(ctx, undefined);
    expect(result).toEqual({ status: "ok", data: { panes } });
  });
});
