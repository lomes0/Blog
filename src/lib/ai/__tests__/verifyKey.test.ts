/**
 * Checking a provider key before storing it —
 * docs/plans/archive/byo-provider-keys.md §4.6, phase 2.
 *
 * The happy path is not what needs pinning. Two of the failure paths do:
 *
 * - **"rejected" versus "unreachable".** The route turns the first into a 400
 *   on the user's field and the second into a 502 about the deployment. Getting
 *   that backwards tells someone their key is wrong because our network was
 *   down, and they will retype a perfectly good key until they give up.
 * - **Redaction.** The provider's own message is quoted into a 400 body and a
 *   log line, and the key was in the headers of the call that produced it.
 */
import { beforeEach, expect, vi } from "vitest";

const generateText = vi.fn();

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: (...args: unknown[]) => generateText(...args),
}));

// Through `ai` rather than `@ai-sdk/provider`, which is a transitive dependency
// and not resolvable from here. The mock above spreads the original, so this is
// the real class the module under test will match against.
const { APICallError } = await import("ai");
const { verifyProviderKey } = await import("../verifyKey");

const KEY = "sk-ant-api03-notarealkeyatall";

const apiError = (statusCode: number, message: string) =>
  new APICallError({
    message,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
  });

beforeEach(() => {
  vi.clearAllMocks();
  generateText.mockResolvedValue({ text: "" });
});

describe("a working key", () => {
  it("is accepted", async () => {
    expect(await verifyProviderKey("anthropic", KEY)).toEqual({ ok: true });
  });

  it("costs one token and is not retried", async () => {
    await verifyProviderKey("anthropic", KEY);
    const [options] = generateText.mock.calls[0] as [Record<string, unknown>];
    expect(options.maxOutputTokens).toBe(1);
    // Retrying a rejected credential cannot succeed; all it adds is the delay
    // before the user is told what is wrong.
    expect(options.maxRetries).toBe(0);
  });

  it("asks the cheapest model the registry knows for that provider", async () => {
    await verifyProviderKey("anthropic", KEY);
    const [options] = generateText.mock.calls[0] as [{ model: { modelId: string } }];
    expect(options.model.modelId).toBe("claude-sonnet-5");

    await verifyProviderKey("google", KEY);
    const [second] = generateText.mock.calls[1] as [{ model: { modelId: string } }];
    expect(second.model.modelId).toBe("gemini-2.5-flash");
  });
});

describe("the provider says no", () => {
  it.each([401, 403])("reports %i as rejected", async (status) => {
    generateText.mockRejectedValue(apiError(status, "invalid x-api-key"));
    expect(await verifyProviderKey("anthropic", KEY)).toMatchObject({
      ok: false,
      reason: "rejected",
    });
  });
});

describe("we could not ask", () => {
  it("does not call a server error a bad key", async () => {
    generateText.mockRejectedValue(apiError(503, "upstream unavailable"));
    const result = await verifyProviderKey("anthropic", KEY);
    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
    expect((result as { message: string }).message).toContain("503");
  });

  it("does not call a timeout a bad key", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    generateText.mockRejectedValue(timeout);
    expect(await verifyProviderKey("anthropic", KEY)).toMatchObject({
      ok: false,
      reason: "unreachable",
    });
  });

  it("does not call an unrecognised failure a bad key", async () => {
    generateText.mockRejectedValue(new Error("socket hang up"));
    expect(await verifyProviderKey("anthropic", KEY)).toMatchObject({
      ok: false,
      reason: "unreachable",
      message: "socket hang up",
    });
  });

  it("blames the deployment, not the key, when the endpoint is unconfigured", async () => {
    // Azure needs a base URL from the environment, which is not set here. That
    // failure happens before any call is made, and the one thing it must not do
    // is come back as "your key was rejected".
    const result = await verifyProviderKey("azure", KEY);
    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("redaction", () => {
  it("strips the key out of anything the provider said", async () => {
    generateText.mockRejectedValue(
      apiError(401, `authentication_error for key ${KEY} — check the console`),
    );
    const result = await verifyProviderKey("anthropic", KEY);
    const { message } = result as { message: string };
    expect(message).not.toContain(KEY);
    expect(message).toContain("[redacted]");
  });

  it("strips it out of a plain error too", async () => {
    generateText.mockRejectedValue(new Error(`connect failed sending ${KEY}`));
    const result = await verifyProviderKey("anthropic", KEY);
    expect((result as { message: string }).message).not.toContain(KEY);
  });
});
