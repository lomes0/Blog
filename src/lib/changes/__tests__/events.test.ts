import {
  APP_ORIGIN,
  CHANGE_CHANNEL,
  CHANGE_PAYLOAD_LIMIT,
  type ChangeEvent,
  decodeChangeEvent,
  encodeChangeEvent,
  isAgentOrigin,
} from "../events";

/**
 * The change feed's payload contract — docs/plans/changes_detection.md §2.1,
 * §10.
 *
 * `events.ts` is import-free by design (the same rule as `diff.ts` and
 * `dragGeometry.ts`) precisely so this can run with no database, no Prisma and
 * no browser. `notify.ts` has nothing pure left to test once the payload is
 * built here: what remains is a `$executeRaw` and a `try/catch`, and the thing
 * worth asserting about it — that a notification can never fail a write — is
 * the property that {@link encodeChangeEvent} either produces a bounded string
 * or throws *before* any statement is issued. That is what these tests pin.
 */

const doc = (over: Partial<ChangeEvent> = {}): ChangeEvent => ({
  kind: "document.updated",
  id: "d1",
  authorId: "u1",
  origin: APP_ORIGIN,
  ...over,
} as ChangeEvent);

describe("encodeChangeEvent", () => {
  test("carries id, authorId and origin on every kind", () => {
    const kinds: ChangeEvent[] = [
      { kind: "document.created", id: "d1", authorId: "u1", origin: APP_ORIGIN },
      { kind: "document.updated", id: "d1", authorId: "u1", origin: APP_ORIGIN },
      { kind: "document.deleted", id: "d1", authorId: "u1", origin: APP_ORIGIN },
      {
        kind: "proposal.upserted",
        id: "d1",
        revisionId: "r1",
        authorId: "u1",
        origin: "claude-code",
      },
      {
        kind: "proposal.resolved",
        id: "d1",
        revisionId: "r1",
        resolution: "approved",
        authorId: "u1",
        origin: APP_ORIGIN,
      },
    ];

    for (const event of kinds) {
      const payload = JSON.parse(encodeChangeEvent(event));
      expect(payload.kind).toBe(event.kind);
      expect(payload.id).toBe("d1");
      expect(payload.authorId).toBe("u1");
      expect(typeof payload.origin).toBe("string");
    }
  });

  /**
   * §10's "no content in the payload", as a property of the code rather than a
   * rule someone has to remember. The encoder whitelists fields, so a caller
   * that spreads a whole Prisma row into an event cannot leak its body onto a
   * channel every listener on the database can read.
   */
  test("drops anything that is not a whitelisted id", () => {
    const smuggled = {
      ...doc(),
      data: { root: { children: ["a lot of document content"] } },
      name: "Secret Post",
      email: "someone@example.com",
    } as unknown as ChangeEvent;

    const payload = JSON.parse(encodeChangeEvent(smuggled));
    expect(Object.keys(payload).sort()).toEqual([
      "authorId",
      "id",
      "kind",
      "origin",
    ]);
  });

  test("keeps revisionId and resolution on proposal events", () => {
    const upserted = JSON.parse(encodeChangeEvent({
      kind: "proposal.upserted",
      id: "d1",
      revisionId: "r7",
      authorId: "u1",
      origin: "claude-code",
    }));
    expect(upserted.revisionId).toBe("r7");
    expect(upserted.resolution).toBeUndefined();

    const resolved = JSON.parse(encodeChangeEvent({
      kind: "proposal.resolved",
      id: "d1",
      revisionId: "r7",
      resolution: "rejected",
      authorId: "u1",
      origin: APP_ORIGIN,
    }));
    expect(resolved.revisionId).toBe("r7");
    expect(resolved.resolution).toBe("rejected");
  });

  /**
   * The fan-out key is what keeps the feed from being a cross-tenant id leak
   * (§2.3), so an event that cannot name a subscriber must not become a
   * statement at all. Throwing here is safe *because* `notify.ts` builds the
   * payload before it issues anything.
   */
  test("refuses an event with no authorId", () => {
    expect(() => encodeChangeEvent(doc({ authorId: "" }))).toThrow(TypeError);
  });

  test("refuses a proposal event with no revisionId", () => {
    expect(() =>
      encodeChangeEvent({
        kind: "proposal.upserted",
        id: "d1",
        revisionId: "",
        authorId: "u1",
        origin: APP_ORIGIN,
      })
    ).toThrow(TypeError);
  });

  test("an ids-only payload is nowhere near the 8000-byte cap", () => {
    const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const payload = encodeChangeEvent({
      kind: "proposal.resolved",
      id: uuid,
      revisionId: uuid,
      resolution: "approved",
      authorId: uuid,
      origin: "claude-code",
    });
    expect(payload.length).toBeLessThan(CHANGE_PAYLOAD_LIMIT / 10);
  });

  test("refuses to emit past the cap", () => {
    expect(() => encodeChangeEvent(doc({ id: "x".repeat(9000) })))
      .toThrow(RangeError);
  });
});

describe("decodeChangeEvent", () => {
  test("round-trips every kind", () => {
    const events: ChangeEvent[] = [
      { kind: "document.created", id: "d1", authorId: "u1", origin: APP_ORIGIN },
      { kind: "document.deleted", id: "d2", authorId: "u2", origin: "cli" },
      {
        kind: "proposal.upserted",
        id: "d3",
        revisionId: "r3",
        authorId: "u3",
        origin: "claude-code",
      },
      {
        kind: "proposal.resolved",
        id: "d4",
        revisionId: "r4",
        resolution: "approved",
        authorId: "u4",
        origin: APP_ORIGIN,
      },
    ];
    for (const event of events) {
      expect(decodeChangeEvent(encodeChangeEvent(event))).toEqual(event);
    }
  });

  /**
   * A notification is not a request: there is nobody to answer, and the payload
   * may have been written by a deployment older or newer than this one sharing
   * the channel. Every malformed shape is `null`, and §3's catch-up carries the
   * change instead.
   */
  test("returns null rather than throwing on anything unrecognised", () => {
    const bad = [
      "not json",
      "null",
      "[]",
      '"a string"',
      JSON.stringify({ kind: "document.updated", id: "d1", authorId: "u1" }),
      JSON.stringify({ kind: "series.updated", id: "s1", authorId: "u1", origin: "app" }),
      JSON.stringify({ kind: "document.updated", id: "", authorId: "u1", origin: "app" }),
      JSON.stringify({
        kind: "proposal.upserted",
        id: "d1",
        authorId: "u1",
        origin: "app",
      }),
      JSON.stringify({
        kind: "proposal.resolved",
        id: "d1",
        revisionId: "r1",
        resolution: "maybe",
        authorId: "u1",
        origin: "app",
      }),
    ];
    for (const raw of bad) expect(decodeChangeEvent(raw)).toBeNull();
  });
});

describe("origin", () => {
  /**
   * §2.1's reason for carrying `origin` at all: an agent write surfaces a
   * marker, the user's own write does not re-announce itself. Written as "not
   * the app" so a writer this module has never heard of is still treated as an
   * agent — swallowing a change the user did not make is the worse failure.
   */
  test("distinguishes an agent write from the app's own", () => {
    expect(isAgentOrigin(APP_ORIGIN)).toBe(false);
    expect(isAgentOrigin("claude-code")).toBe(true);
    expect(isAgentOrigin("some-future-writer")).toBe(true);
  });
});

test("the channel name is the one the LISTEN side will use", () => {
  expect(CHANGE_CHANNEL).toBe("blog_changes");
});
