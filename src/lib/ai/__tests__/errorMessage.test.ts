/**
 * Unpacking an API refusal from an AI SDK error —
 * docs/plans/byo-provider-keys.md §4.7, phase 4.
 *
 * What this stands between: the route wrapper answers with
 * `{ error: { title, subtitle, code } }`, and the SDK's streaming hooks hand a
 * component that body as `error.message`. Rendering it raw puts a serialized
 * object in front of the user. That was tolerable when the only refusals were a
 * 401 and a real 500; it is not now that "you have no key for this provider" is
 * the commonest thing either AI route says.
 */
import { expect } from "vitest";
import {
  describeAIError,
  isMissingProviderKey,
  MISSING_PROVIDER_KEY,
} from "../errorMessage";

/** What the SDK actually throws: the response body, as a string, in `message`. */
const sdkError = (body: unknown) => new Error(JSON.stringify(body));

const missingKeyBody = {
  error: {
    title: "No Anthropic key",
    subtitle: "Add one in Settings → Provider keys to use this model.",
    code: MISSING_PROVIDER_KEY,
  },
};

describe("the envelope", () => {
  it("reads title, subtitle and code back out", () => {
    expect(describeAIError(sdkError(missingKeyBody))).toEqual({
      title: "No Anthropic key",
      subtitle: "Add one in Settings → Provider keys to use this model.",
      code: MISSING_PROVIDER_KEY,
    });
  });

  it("never renders the serialized body", () => {
    const described = describeAIError(sdkError(missingKeyBody));
    expect(described.title).not.toContain("{");
    expect(described.title).not.toContain("error");
  });

  it("tolerates an envelope with no code — most errors have none", () => {
    const described = describeAIError(
      sdkError({ error: { title: "Model not found" } }),
    );
    expect(described).toEqual({
      title: "Model not found",
      subtitle: undefined,
      code: undefined,
    });
  });
});

describe("everything that is not an envelope", () => {
  it("keeps a plain message rather than replacing it with an apology", () => {
    // A truthful technical message beats a generic one that hides it.
    expect(describeAIError(new Error("fetch failed")).title).toBe("fetch failed");
  });

  it("falls back when there is no message at all", () => {
    expect(describeAIError(new Error(""), { title: "Fallback" }))
      .toEqual({ title: "Fallback" });
    expect(describeAIError(undefined, { title: "Fallback" }))
      .toEqual({ title: "Fallback" });
  });

  it("survives a body that is JSON but not ours", () => {
    expect(describeAIError(sdkError({ detail: "nope" })).title)
      .toBe('{"detail":"nope"}');
  });

  it("still names an expired session plainly", () => {
    expect(describeAIError(new Error("Unauthorized")).title)
      .toBe("Sign in to use AI features");
  });
});

describe("isMissingProviderKey", () => {
  it("is true only for the coded refusal", () => {
    expect(isMissingProviderKey(sdkError(missingKeyBody))).toBe(true);
    // Same meaning in prose, no code: matching on wording is exactly what the
    // code exists to avoid, so this must stay false.
    expect(isMissingProviderKey(sdkError({ error: { title: "No Anthropic key" } })))
      .toBe(false);
    expect(isMissingProviderKey(new Error("fetch failed"))).toBe(false);
  });
});
