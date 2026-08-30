import { cloudBackend, localBackend, toCreateInput } from "@/store/backend";
import { orderBy } from "@/lib/orderArray";
import { EMPTY_EDITOR_STATE, Revision } from "@/types";
import { createApiThunk, fail } from "./createApiThunk";

/**
 * Move drafts written while signed out into the freshly signed-in account.
 *
 * Guests write to IndexedDB; once they sign in, that store is no longer the
 * backend the app reads from, so anything left there would silently disappear
 * from view. This uploads each draft with its revision history and then clears
 * the local copy.
 *
 * Deliberately non-destructive on failure: a draft is only deleted locally after
 * its upload succeeds, so a network blip mid-import leaves work recoverable and
 * the next sign-in retries it. A no-op when there is nothing to import, which is
 * the overwhelmingly common case.
 */
export const importGuestDrafts = createApiThunk(
  "app/importGuestDrafts",
  async (_, thunkAPI) => {
    const { user } = thunkAPI.getState();
    if (!user) return 0;

    const unordered = await localBackend.list();
    if (unordered.length === 0) return 0;

    // Uploaded in the order the guest had them in, because the cloud appends
    // each create to `User.rootOrder` (docs/plans/ordering-simplification.md
    // §6) — so the sequence of uploads *is* where they land. The local root
    // order does not travel with them; this is what carries it over.
    const drafts = orderBy(await localBackend.rootOrder() ?? [], unordered);

    // A local record whose id the account already owns is not a draft — it is
    // a leftover mirror from when every post was stored in both places. Those
    // are dropped rather than uploaded, which would fail on the duplicate id.
    const cloudIds = new Set((await cloudBackend.list()).map((p) => p.id));

    let imported = 0;
    const failures: string[] = [];

    for (const draft of drafts) {
      try {
        if (cloudIds.has(draft.id)) {
          await localBackend.delete(draft.id);
          continue;
        }
        const full = await localBackend.get(draft.id);
        if (!full) continue;

        const revisions: Revision[] = [];
        for (const meta of full.revisions ?? []) {
          const revision = await localBackend.revisions.get(meta.id);
          if (revision) revisions.push(revision);
        }
        // A draft always needs at least its head revision, or the cloud copy
        // would have no content to render.
        if (!revisions.some((r) => r.id === full.head)) {
          revisions.push({
            id: full.head,
            documentId: full.id,
            createdAt: full.updatedAt,
            data: full.data ?? EMPTY_EDITOR_STATE,
          });
        }

        await cloudBackend.create(toCreateInput(full, {
          data: full.data ?? EMPTY_EDITOR_STATE,
          revisions,
        }));
        await localBackend.delete(full.id);
        imported++;
      } catch (error: unknown) {
        console.error(error);
        failures.push(draft.name);
      }
    }

    if (failures.length > 0) {
      fail(
        `${failures.length} of ${drafts.length} kept locally — they will be retried next sign-in`,
        "Some drafts could not be imported",
      );
    }
    return imported;
  },
  { title: "Could not import your local drafts" },
);
