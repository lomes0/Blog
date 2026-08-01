/**
 * The set arithmetic behind the copy out of the fork's old IndexedDB database.
 *
 * The properties that matter are the ones that make it safe to run on every
 * boot: a record is only ever released from the legacy database once the new
 * one is known to hold it, and a second run of an already-finished migration
 * copies nothing.
 */
import {
  drainableKeys,
  planStoreCopy,
  selectMigratableStores,
} from "../migrationPlan";

describe("planStoreCopy", () => {
  it("copies keys the new database does not have", () => {
    expect(planStoreCopy(["a", "b"], [])).toEqual({
      copy: ["a", "b"],
      drain: [],
    });
  });

  it("drains keys the new database already has", () => {
    expect(planStoreCopy(["a", "b"], ["a", "b"])).toEqual({
      copy: [],
      drain: ["a", "b"],
    });
  });

  it("splits a partially migrated store", () => {
    expect(planStoreCopy(["a", "b", "c"], ["b"])).toEqual({
      copy: ["a", "c"],
      drain: ["b"],
    });
  });

  it("ignores keys the new database has and the legacy one does not", () => {
    expect(planStoreCopy(["a"], ["a", "written-since"])).toEqual({
      copy: [],
      drain: ["a"],
    });
  });

  it("preserves legacy order so a retry repeats the same sequence", () => {
    expect(planStoreCopy(["c", "a", "b"], []).copy).toEqual(["c", "a", "b"]);
  });

  it("considers a duplicated key once", () => {
    expect(planStoreCopy(["a", "a"], [])).toEqual({ copy: ["a"], drain: [] });
  });

  it("plans nothing for an empty store", () => {
    expect(planStoreCopy([], ["a"])).toEqual({ copy: [], drain: [] });
  });
});

describe("selectMigratableStores", () => {
  const wanted = ["documents", "revisions", "copilotThreads"];

  it("skips stores the version-5 legacy database predates", () => {
    // `copilotThreads` arrived in version 6 and will not be there.
    expect(
      selectMigratableStores(wanted, ["documents", "revisions"], wanted),
    ).toEqual(["documents", "revisions"]);
  });

  it("skips stores the new database no longer declares", () => {
    expect(
      selectMigratableStores(wanted, wanted, ["documents", "revisions"]),
    ).toEqual(["documents", "revisions"]);
  });

  it("ignores stores nobody asked to migrate", () => {
    // `notesCanvas` is in the legacy database and deliberately left there.
    expect(
      selectMigratableStores(
        ["documents"],
        ["documents", "notesCanvas"],
        ["documents"],
      ),
    ).toEqual(["documents"]);
  });

  it("returns them in the requested order, not the database's", () => {
    expect(
      selectMigratableStores(wanted, [...wanted].reverse(), wanted),
    ).toEqual(wanted);
  });
});

describe("drainableKeys", () => {
  const plan = { copy: ["a", "b"], drain: ["z"] };

  it("releases what was already there plus what just landed", () => {
    expect(drainableKeys(plan, ["a", "b"])).toEqual(["z", "a", "b"]);
  });

  it("holds on to a record whose write failed", () => {
    // `b` stays in the legacy database, so the next boot tries again.
    expect(drainableKeys(plan, ["a"])).toEqual(["z", "a"]);
  });

  it("still releases already-present keys when every write failed", () => {
    expect(drainableKeys(plan, [])).toEqual(["z"]);
  });

  it("leaves a finished store with nothing to do", () => {
    expect(drainableKeys({ copy: [], drain: [] }, [])).toEqual([]);
  });
});
