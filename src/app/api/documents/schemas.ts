import { z } from "zod";
import type { SerializedEditorState } from "lexical";
import { DocumentStatus } from "@/types";

/**
 * Request-body schemas for the document routes.
 *
 * These exist because `(await request.json()) as PostUpdateInput` was a cast, not
 * a check: the type described the client the app happens to ship, while the
 * handler fed whatever arrived into a Prisma `data` argument. The schema is the
 * enforceable version of the same statement.
 */

/**
 * A date the client supplies (`createdAt`, `updatedAt`).
 *
 * Deliberately looser than `z.string().datetime()`: the app sends
 * `toISOString()`, but form inputs and imported bundles carry other parseable
 * shapes, and the point here is to reject values Prisma would choke on rather
 * than to standardise a wire format. An unparseable date used to reach the query
 * and surface as a 500.
 */
const clientDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be a valid date");

/**
 * Serialized Lexical editor state.
 *
 * Not validated structurally — it is an open, deeply nested node tree defined by
 * the editor's own plugins, and the schema would be a second, always-stale copy
 * of that definition. What is checked is that it is a JSON object with a `root`,
 * which is what every consumer (`generateServerHtml`, the editor itself)
 * dereferences.
 *
 * The trailing assertion is the one place that gap is acknowledged: the node tree
 * is Lexical's to define, so consumers get `SerializedEditorState` from here
 * rather than each casting a loose record on its own.
 */
export const editorStateSchema = z
  .object({ root: z.object({}).passthrough() })
  .passthrough()
  .transform((state) => state as unknown as SerializedEditorState);

/**
 * Fields shared by document create and update.
 *
 * `parentId` and `seriesId` are *not* here — a document's container is set by
 * `/api/documents/[id]/move`, which authorizes the destination, refuses parent
 * cycles and mints a rank in the target container. See `documentUpdateSchema`.
 */
const documentFields = {
  name: z.string(),
  head: z.string().uuid(),
  handle: z.string().nullish(),
  description: z.string().nullish(),
  tabLabel: z.string().nullish(),
  background_image: z.string().nullish(),
  createdAt: clientDate,
  updatedAt: clientDate,
  published: z.boolean(),
  collab: z.boolean(),
  private: z.boolean(),
  status: z.nativeEnum(DocumentStatus),
  coauthors: z.array(z.string().email()),
  data: editorStateSchema,
};

/**
 * POST /api/documents.
 *
 * `parentId` and `seriesId` *are* accepted here — a new tab is born inside its
 * parent, and `createDocument` ranks it in that container — but the route must
 * prove the caller owns the destination before using them. Same for `baseId`,
 * which names the document this one is a fork of.
 *
 * `authorId` is not accepted: it comes from the session.
 *
 * `placement` says which *end* of the container the new document lands at, and
 * is the only ordering input taken here: the rank itself is still minted
 * server-side against the live siblings, so a client cannot pin a position it
 * computed from a stale list. Defaults to `"end"`.
 *
 * Unknown keys are stripped rather than rejected (unlike the update schema): the
 * route allowlists the columns it writes, and callers legitimately post a whole
 * `Post` through `toCreateInput` — `rank`, a joined `series`, seed `revisions` —
 * of which this endpoint uses only some.
 */
export const documentCreateSchema = z.object({
  ...documentFields,
  id: z.string().uuid(),
  type: z.literal("DOCUMENT").optional(),
  parentId: z.string().uuid().nullish(),
  seriesId: z.string().uuid().nullish(),
  baseId: z.string().uuid().nullish(),
  placement: z.enum(["start", "end"]).optional(),
  head: documentFields.head.optional(),
  createdAt: clientDate.optional(),
  updatedAt: clientDate.optional(),
  published: z.boolean().optional(),
  collab: z.boolean().optional(),
  private: z.boolean().optional(),
  status: documentFields.status.optional(),
  coauthors: documentFields.coauthors.optional(),
  data: editorStateSchema.optional(),
});

/**
 * PATCH /api/documents/[id] — every field optional, unknown fields rejected.
 *
 * `.strict()` is doing real work. `parentId` and `seriesId` are absent from this
 * schema on purpose, and strict mode turns that absence into a 400 naming the
 * field instead of a value that reaches Prisma. Before this, `parentId` went
 * straight into the update: any signed-in user could graft their own document
 * into *anyone else's* post as a child tab — no ownership check on the
 * destination, no cycle check, and no rank in the container it landed in. The
 * comment saying membership changes go through `/move` is now enforced.
 *
 * `rank` is likewise not accepted: it is derived from `between` inside the move
 * transaction, which is what keeps concurrent reorders consistent.
 *
 * `expectedHead` is the one field here that is not a column. It is the
 * compare-and-set: send the head this write is based on and the update is
 * refused with a 409 if storage has moved on, which is what stops a long-open
 * tab from pointing `head` back at its own revision and orphaning whatever an
 * agent wrote meanwhile. Omitting it writes unconditionally — correct for a
 * rename or a publish toggle, which are not racing anyone over content.
 */
export const documentUpdateSchema = z
  .object({
    ...documentFields,
    expectedHead: z.string().uuid().nullable(),
  })
  .partial()
  .strict();
