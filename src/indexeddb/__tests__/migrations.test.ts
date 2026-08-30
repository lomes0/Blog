import {
  migrateDocumentToV10,
  migrateDocumentToV11,
  migrateDocumentToV9,
  migrations,
  recordTransformsFor,
  schemaStepsFor,
  type StoredRecord,
} from "../migrations";

/**
 * What a version bump does to a guest's stored drafts.
 *
 * This is the half of the local library nothing else can cover: the DOM half —
 * the `versionchange` transaction, the index swap, whether the browser actually
 * runs these in order — is only answerable in a real engine, and is verified by
 * hand against a profile that holds drafts written on the previous schema. What
 * *is* answerable here is the part that decides whether a draft survives at all:
 * given a record as it sits on disk, what comes back.
 *
 * The load-bearing claim is the negative one. A draft is the only copy that
 * exists (docs/plans/schema-organization.md §B, §C), so the failure that matters
 * is not a crash — it is a migration that runs, returns something, and quietly
 * drops the title or the content on the way through.
 */

/** A document record as v8 stored it, with everything a draft actually holds. */
const v8Record = (): StoredRecord => ({
  id: "doc-1",
  name: "Notes on the migration",
  head: "rev-1",
  type: "DOCUMENT",
  background_image: "/uploads/gone.png",
  description: "a description",
  handle: "notes",
  createdAt: "2026-08-30T10:00:00.000Z",
  updatedAt: "2026-08-30T11:00:00.000Z",
  tabOrder: ["tab-a", "tab-b"],
  data: { root: { children: [{ text: "the draft itself" }] } },
});

describe("migrateDocumentToV9 — head → headRevisionId", () => {
  it("moves the value across", () => {
    expect(migrateDocumentToV9(v8Record())?.headRevisionId).toBe("rev-1");
  });

  it("leaves the old key behind", () => {
    expect(migrateDocumentToV9(v8Record())).not.toHaveProperty("head");
  });

  it("carries every other field through untouched", () => {
    const before = v8Record();
    const after = migrateDocumentToV9(before)!;
    const { head: _head, ...rest } = before;
    for (const [key, value] of Object.entries(rest)) {
      expect(after[key]).toEqual(value);
    }
  });

  it("declines a record it has already converted", () => {
    // `null` is what stops the cursor writing back, which is what makes a
    // re-run — or a partial upgrade resumed after an abort — a no-op rather
    // than a second pass over records that are already correct.
    expect(migrateDocumentToV9({ id: "doc-1", headRevisionId: "rev-1" }))
      .toBeNull();
  });
});

describe("migrateDocumentToV10 — name → title, background_image dropped", () => {
  it("moves the title across", () => {
    expect(migrateDocumentToV10(v8Record())?.title)
      .toBe("Notes on the migration");
  });

  it("drops the dead background column", () => {
    const after = migrateDocumentToV10(v8Record())!;
    expect(after).not.toHaveProperty("background_image");
    expect(after).not.toHaveProperty("name");
  });

  it("keeps the draft's content and its tab order", () => {
    const after = migrateDocumentToV10(v8Record())!;
    expect(after.data).toEqual(v8Record().data);
    expect(after.tabOrder).toEqual(["tab-a", "tab-b"]);
  });

  it("still drops the background when there is no name to rename", () => {
    // The two are one bump, not one change: a record that has been half
    // converted — by a build that shipped between them, or by an upgrade that
    // aborted — must still lose the column.
    const after = migrateDocumentToV10({
      id: "doc-1",
      title: "already renamed",
      background_image: null,
    })!;
    expect(after).not.toHaveProperty("background_image");
    expect(after.title).toBe("already renamed");
  });

  it("declines a record that carries neither", () => {
    expect(migrateDocumentToV10({ id: "doc-1", title: "done" })).toBeNull();
  });

  it("keeps a title that is the empty string", () => {
    // `??` would be wrong here and `||` catastrophically so: an untitled draft
    // is still a draft, and dropping the key would hand the reader `undefined`
    // where the store held `""`.
    expect(migrateDocumentToV10({ id: "doc-1", name: "" })?.title).toBe("");
  });
});

describe("migrateDocumentToV11 — type dropped", () => {
  it("removes the discriminator and nothing else", () => {
    const before = v8Record();
    const after = migrateDocumentToV11(before)!;
    expect(after).not.toHaveProperty("type");
    expect(Object.keys(after).sort()).toEqual(
      Object.keys(before).filter((k) => k !== "type").sort(),
    );
  });

  it("declines a record that has none", () => {
    expect(migrateDocumentToV11({ id: "doc-1" })).toBeNull();
  });
});

describe("recordTransformsFor — what one upgrade does to a record", () => {
  it("is in ascending version order", () => {
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it("carries a v8 draft to v11 with its title and content", () => {
    // The upgrade a real profile performs. This goes through the *same*
    // composition the opener uses, which is the point: the first version of
    // this ran one cursor per migration, and the three passes overwrote each
    // other's work — a spec that composed the transforms by hand agreed with
    // itself while the browser applied exactly one of the three.
    const transform = recordTransformsFor(8, 11).get("documents")!;
    expect(transform(v8Record())).toEqual({
      id: "doc-1",
      title: "Notes on the migration",
      headRevisionId: "rev-1",
      description: "a description",
      handle: "notes",
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T11:00:00.000Z",
      tabOrder: ["tab-a", "tab-b"],
      data: { root: { children: [{ text: "the draft itself" }] } },
    });
  });

  it("applies only the versions the upgrade actually crosses", () => {
    // A profile already on v9 has had `head` renamed; crossing to v10 must
    // rename the title and stop there, leaving `type` where it is.
    const record = { id: "doc-1", name: "a", headRevisionId: "r", type: "DOCUMENT" };
    const after = recordTransformsFor(9, 10).get("documents")!(record)!;
    expect(after).toEqual({
      id: "doc-1",
      title: "a",
      headRevisionId: "r",
      type: "DOCUMENT",
    });
  });

  it("leaves a record alone when the upgrade has nothing to say about it", () => {
    // `null` is what keeps the cursor from writing. A record already in the
    // target shape must come back untouched, so that reopening a converted
    // profile is not a full rewrite of every draft.
    const transform = recordTransformsFor(8, 11).get("documents")!;
    expect(transform({ id: "doc-1", title: "done", headRevisionId: "r" }))
      .toBeNull();
  });

  it("has no work for a database already at the current version", () => {
    expect(recordTransformsFor(11, 11).size).toBe(0);
    expect(schemaStepsFor(11, 11)).toEqual([]);
  });

  it("runs the index swaps for exactly the versions being crossed", () => {
    expect(schemaStepsFor(8, 11).map((m) => m.version)).toEqual([9, 10]);
    expect(schemaStepsFor(9, 11).map((m) => m.version)).toEqual([10]);
  });
});
