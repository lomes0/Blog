import type { UIMessage } from "ai";
import type { SerializedEditorState } from "lexical";
import type { Session } from "next-auth";
import type { EntityState } from "@reduxjs/toolkit";

export interface Alert {
  title: string;
  content: string;
  actions: { label: string; id: string }[];
}
export interface Announcement {
  message?: { title: string; subtitle?: string };
  action?: {
    label: string;
    onClick: string;
  };
  timeout?: number;
}
export interface AttachmentPreviewState {
  open: boolean;
  nodeKey: string | null;
  url: string | null;
  filename: string | null;
  mimetype: string | null;
}

/**
 * How a pane is showing its document — the state that replaced the `/view` vs
 * `/edit` route split in Phase 5 of docs/plans/archive/workspace-panes.md. Flipping it
 * is a state change, not a navigation: same pane, same Lexical instance, same
 * scroll position, `editor.setEditable(false)`.
 */
export type PaneMode = "read" | "write";

/**
 * How many panes may be open at once (plan §5.3).
 *
 * Two, side by side — deliberately not a recursive grid. The singleton work
 * behind split view costs the same for N as for 2, but nested splits multiply
 * the layout, resize and drag surface for very little gain in an authoring
 * tool. The cap lives here rather than in the reducer that enforces it so the
 * command layer can refuse a third split with a message instead of watching a
 * dispatch quietly do nothing.
 */
export const MAX_PANES = 2;

/**
 * How far the splitter may travel, as the left pane's share of the row.
 *
 * These live beside {@link MAX_PANES} rather than in `WorkspacePanes.tsx`
 * because the *reducer* clamps: `splitRatio` is persisted (plan §8.2), so a
 * stored record is attacker-adjacent input in the same sense a request body is,
 * and a component-local constant is not reachable from the place that has to
 * refuse a ratio of `-4`.
 */
export const MIN_PANE_RATIO = 0.2;
export const MAX_PANE_RATIO = 0.8;
export const DEFAULT_PANE_RATIO = 0.5;

/**
 * A viewport onto a document.
 *
 * Note the vocabulary (plan §2.1): a **pane** is a viewport; a **tab** is a
 * child document of a post (`Document.parentId`, `tabLabel`). A pane contains a
 * tab group, which is what `tabIds` / `activeTabId` are. "Tab" never means
 * "open document" — that is a pane.
 *
 * `id` is stable for the pane's lifetime even though there is only ever one
 * today: Phase 3 lets the AI name panes, and retrofitting ids after that is
 * painful.
 */
export interface WorkspacePane {
  id: string;
  /** The post this pane is rooted at. Its tabs are this post's children. */
  rootId: string;
  /**
   * The root plus its children, in display order. Empty until the children
   * have been fetched — `activeTabId` may lead it, and callers fall back to
   * `rootId`.
   */
  tabIds: string[];
  activeTabId: string | null;
  mode: PaneMode;
  /**
   * Was the global `ui.diff.open` (plan §5.1 #4). Derived from `ui.diff.docId`
   * — see there — rather than owned here: this is the render gate, and the
   * request it answers outlives any one pane.
   */
  diffOpen: boolean;
}

/**
 * What is open, as state rather than as a path string.
 *
 * Up to {@link MAX_PANES} panes, left to right in array order.
 *
 * **This object is the persisted record** (plan §8.2, answered 31 Jul 2026):
 * it is written to IndexedDB under the session's user id — or `"guest"` — and
 * read back on entering the workspace, so a reload gives you the same two
 * documents at the same split. It is stored per *device* and not in the cloud
 * on purpose: a ratio that fits a desktop does not fit a laptop, and a guest
 * with no account still deserves their layout back. `src/lib/workspaceRestore.ts`
 * is what turns a stored record back into a value of this type, and it does not
 * trust it.
 *
 * One document may be open in at most one pane. That is a reducer invariant,
 * not a convention: `saveRegistry` is keyed by document id, so a second live
 * editor for the same document would silently overwrite the first one's save
 * callback and stop persisting it (plan §5.2). Restoring has to honour the same
 * rule — a stored record can name one document twice, and nothing downstream
 * would notice.
 */
export interface WorkspaceState {
  panes: WorkspacePane[];
  focusedPaneId: string | null;
  /**
   * The left pane's share of the row, in
   * [{@link MIN_PANE_RATIO}, {@link MAX_PANE_RATIO}]. Meaningless with one
   * pane, but kept anyway so a split re-opens where it was left.
   */
  splitRatio: number;
  /**
   * The pane currently filling the row on its own, if any — the ⤢ button in a
   * pane's strip, and `pane.maximize`.
   *
   * **Not persisted, unlike everything else here.** A maximize is a way of
   * *looking* at a layout rather than part of one: it is what you do to read one
   * document closely for a minute, and Esc undoes it. Coming back tomorrow to a
   * split that says it has one pane — with the other still open, merely hidden —
   * would be the layout lying about itself. `sanitizeWorkspace` therefore always
   * returns `null` here, the way it always returns `diffOpen: false`.
   *
   * The other pane stays mounted and merely `display: none` (the same choice
   * `EditorTabPanel` makes for an inactive tab): unmounting it would throw away
   * its undo stack and its scroll position for the sake of a temporary view.
   */
  maximizedPaneId: string | null;
}

/** Which view the left sidebar renders, switched from the activity rail. */
export type SidebarView = "explorer" | "search" | "notes";

// ─── The right panel's slots ────────────────────────────────────────────────

/**
 * A view the right rail can switch to.
 *
 * The panel used to render all five at once as a stack of collapsible cards.
 * The rules that move between them live in
 * `components/Layout/RightRail/panelState.ts`; only the shape is here, for the
 * same reason `WorkspaceState` is — this file is a leaf, and the persistence
 * layer has to name the type without reaching into a component.
 */
export type RailViewId =
  | "agent-changes"
  | "outline"
  | "properties"
  | "revisions"
  | "backlinks";

/** Which slot has focus — the one the next rail click fills. */
export type RailSlotIndex = 0 | 1;

/**
 * The panel's slots, top first.
 *
 * The `null` is the placeholder a split opens, and it is only ever the *second*
 * slot. Slot 0 always holds a real view, which is what lets the panel's open
 * state be derived (`isPanelOpen`) instead of stored: "open iff a slot is
 * filled" stays exactly true, and an open panel with nothing in it is
 * unrepresentable rather than merely avoided.
 */
export type RailSlots =
  | []
  | [RailViewId]
  | [RailViewId, RailViewId | null];

/**
 * One document's right-panel layout.
 *
 * Stored per document and per *device*, in the same IndexedDB workspace record
 * as `splitRatio` and `scrollTops` — a panel layout is the same kind of fact
 * they are, and giving it a record of its own would mean a second read on the
 * critical path and a second lifetime to keep in step.
 *
 * Deliberately no `isOpen`. See {@link RailSlots}.
 */
export interface RailPanelState {
  slots: RailSlots;
  /** The top slot's share of the panel, clamped to a range the divider can reach. */
  ratio: number;
  focused: RailSlotIndex;
  /**
   * Whether {@link ratio} is the user's, from a divider drag.
   *
   * The sizing rule defers to each view's `preferredHeight` until the user
   * drags, after which their number wins. Without this the drag would be
   * silently overridden on the next render, which reads as the divider being
   * broken.
   */
  ratioExplicit: boolean;
}

/**
 * How an open post's latest edit is faring on its way to storage.
 *
 * `retrying` is the transient-disconnect case the save loop exists for: the edit
 * is safe in the `pendingSaves` store and will land when the network returns, so
 * the user is told to keep going rather than warned about data loss.
 */
export type SaveStatus = "idle" | "saving" | "retrying" | "error";

// ─── Agent proposals (docs/plans/archive/agent-gating.md §3.5) ───────────────────────

/**
 * An agent write that has been stored but is not yet the document.
 *
 * Metadata only. The content lives behind `GET /api/revisions/[id]` and is
 * fetched by the diff, which is the one thing that needs it — the rail shows
 * origin, time and summary, and that is the whole "awareness" tier.
 */
export interface PendingProposal {
  /** The proposal's revision id — the right-hand side of the review diff. */
  id: string;
  /**
   * The row's squash counter (§3.2), carried so a per-hunk approval can pin the
   * version its hunks were computed from.
   *
   * Without it the third fence in `planApproval` cannot be raised from the
   * browser: an agent batch squashing onto the proposal *while the review is
   * open* moves neither `head` nor `baseRevisionId`, so nothing else on this
   * row would notice that the hunks on screen describe a state it has moved
   * past.
   */
  version: number;
  documentId: string;
  documentName: string;
  documentHandle: string | null;
  /** The document's head *now* — the left-hand side of the review diff. */
  head: string | null;
  /**
   * The head the proposal was built on. Approval compare-and-sets against this,
   * so when it differs from {@link head} the approval will 409 rather than
   * overwrite whatever moved head (§3.4).
   */
  baseRevisionId: string | null;
  proposedAt: string;
  origin: string | null;
  summary: string | null;
  staleAt: string | null;
}

/** A post an agent created, landed as a draft and flagged for accept (§3.7). */
export interface AgentCreatedPost {
  id: string;
  name: string;
  handle: string | null;
  agentCreatedAt: string;
  agentOrigin: string | null;
}

/**
 * A rename an agent proposed, waiting on the author
 * (docs/plans/claude-code-backlog.md §8).
 *
 * Keyed by the document, because a rename has no row of its own — it is three
 * columns on the post. Both titles travel: the row's whole content is
 * "`title` → `proposedTitle`", and `title` is whatever the post is called
 * *now*, not what it was called when the rename was written.
 */
export interface PendingRename {
  /** The document's id. There is at most one pending rename per post. */
  id: string;
  /** The title the post has now. */
  title: string;
  handle: string | null;
  proposedTitle: string;
  proposedAt: string;
  origin: string | null;
}

/**
 * What `GET /api/proposals` answers — every kind of agent work at once.
 *
 * One request rather than three, because the rail asks one question ("what is
 * waiting on me") and the poll in front of it has already said the answer is
 * non-empty.
 */
export interface ProposalListing {
  proposals: PendingProposal[];
  agentPosts: AgentCreatedPost[];
  renames: PendingRename[];
}

/** What `GET /api/proposals/count` answers — the §3.5 focus poll. */
export interface ProposalCount {
  proposals: number;
  agentPosts: number;
  renames: number;
  total: number;
}

/**
 * What of Claude's work is waiting on the signed-in author.
 *
 * Global rather than per-pane on purpose: the sidebar badge, the rail and the
 * review bar are three surfaces asking the same question about the same set of
 * documents, and the answer comes from one poll. (Contrast §3.9's "has this tab
 * unsaved edits", which is deliberately *not* here — that is one component
 * asking itself at one moment, and it is answered from `useSave`'s baseline.)
 *
 * Proposals are keyed by document because that is how every reader addresses
 * them — a sidebar row knows its post id and nothing else — and because
 * `revision_one_pending_per_document` makes the key unique in the database.
 */
export interface ProposalsState {
  byDocId: Record<string, PendingProposal>;
  agentPosts: AgentCreatedPost[];
  /**
   * The same set as {@link agentPosts}, keyed for membership.
   *
   * Both shapes exist because the two readers ask different questions. The rail
   * renders the posts in the order the server listed them, so it needs the
   * array; a tree row asks only "is this id in there", and it asks once per row
   * on every store change — a scan of the array would make that answer cost the
   * whole list, per row, forever. Written by whatever writes the array, never
   * on its own.
   */
  agentPostIds: Record<string, true>;
  /**
   * Pending renames, keyed by document for the reason proposals are: every
   * reader addresses one by the post it is against, and the database allows
   * only one per post.
   *
   * A document can hold a rename *and* a proposal at once — they are separate
   * columns answered by separate buttons — so this is a second map rather than
   * another arm of {@link byDocId}.
   */
  renames: Record<string, PendingRename>;
  count: ProposalCount;
  /**
   * `loading` is set by every poll, including the ones that refresh a list
   * already on screen — a reader that paints a skeleton must also check whether
   * it has anything to show, or the rail flashes on every window focus.
   */
  status: "idle" | "loading" | "error";
  error: string | null;
  /** Whether a listing has ever come back, so `idle` + empty means "none". */
  loaded: boolean;
}

export interface AppState {
  user?: User;
  posts: EntityState<Post, string>;
  series: Series[];
  projects: Project[];
  /**
   * A guest's root order (docs/plans/archive/ordering-simplification.md §7).
   *
   * The signed-in half of this lives on `user.rootOrder`, because the row that
   * owns the author's root list *is* the user. IndexedDB has no such row, so a
   * guest's copy is a keyval record there and this is where it is held in
   * memory. Read only when `user` is absent — a signed-in author with an empty
   * `rootOrder` genuinely has no manual order and must get the tolerant
   * reader's createdAt fallback, not a guest's array.
   *
   * It holds document ids only: a guest has no series and no projects.
   */
  guestRootOrder: string[];
  ui: {
    announcements: Announcement[];
    alerts: Alert[];
    initialized: boolean;
    postsLoading: boolean;
    /** Per-post save status, keyed by post id. Absent means `idle`. */
    saveStatus: Record<string, SaveStatus>;
    drawer: boolean;
    page: number;
    /**
     * The comparison being shown: which revisions, and **which document's**
     * review it belongs to.
     *
     * `docId` is the durable half. A pane is a viewport that can be torn down
     * and rebuilt under a request that is still in flight — the workspace
     * restore, the deep-link replay and `closeAllPanes` all rewrite panes after
     * a click has already asked for a diff — so `WorkspacePane.diffOpen` is a
     * projection of this onto whichever pane currently holds the document, not
     * the record itself. `openPane` seeds it from here; `setDiffOpen` writes
     * both together. Absent means no review is showing.
     */
    diff: {
      old?: string;
      new?: string;
      docId?: string;
      /**
       * The hunks the author has refused, when the right-hand side is a pending
       * proposal being reviewed per hunk (docs/plans/archive/haklex-adoption.md §7).
       *
       * Here rather than inside `Diff/ProposalReview` because the decision and
       * the button that commits it are drawn by two different components:
       * `AgentChangeBar` is sticky above the review and owns Approve, so a
       * selection held locally by the list underneath it could not reach the
       * only control that can act on it. Cleared by `setDiffRevisions` — a new
       * comparison is a new set of hunks, and a decision about the previous
       * one's ids means nothing against them.
       */
      rejectedHunks?: string[];
    };
    attachmentPreview: AttachmentPreviewState | null;
    attachmentModified: { url: string; timestamp: number } | null;
    workspace: WorkspaceState;
    /**
     * Whether {@link workspace} has been read back from storage yet.
     *
     * Deliberately **not** `initialized`. The deep-link seam has to wait for
     * this before replaying the URL as an `openPane`, or the restore and the
     * URL clobber each other — but `initialized` is set at the end of the
     * `load` bootstrap, which awaits the session, the guest-draft import, the
     * posts and the series over the network. An IndexedDB read is a
     * millisecond; gating the editor's first paint on the other thing would be
     * a visible regression. Two flags because they answer two questions.
     *
     * Reset by `closeAllPanes`, so re-entering the workspace restores again.
     */
    workspaceHydrated: boolean;
    /**
     * Whose layout {@link workspace} currently is — a user id, or `"guest"`.
     * Null until the first restore. The persistence middleware writes under
     * this key and re-hydrates when the resolved session disagrees with it, so
     * two accounts sharing a browser cannot inherit each other's panes.
     */
    workspaceKey: string | null;
    /**
     * Each document's right-panel layout, keyed by the focused pane's `rootId`.
     *
     * Per document because the views are: the outline of one post says nothing
     * about another, and someone who reads with Properties open and edits with
     * Revisions open should not have to re-pick on every switch. Bounded, and
     * evicted least-recently-used, for the reason `scrollTops` is — the map
     * rides in a record written on every layout change and must not accumulate
     * a profile's entire history.
     *
     * A document absent from the map has never had its panel touched and opens
     * on the default. That is deliberately *not* a contextual default: the panel
     * does not open Agent changes because something is pending, because a panel
     * that rearranges itself in response to background events reads as the app
     * changing under you. The rail badge does that job.
     */
    railPanel: Record<string, RailPanelState>;
    /**
     * Whether the read behind {@link workspaceHydrated} failed — it timed out,
     * or it threw — rather than answering "nothing stored".
     *
     * Two facts, not one, because the session must go on either way but must not
     * *record* either way. Hydration still completes on a failure, so the
     * deep-link seam opens the requested document and the editor is usable; this
     * flag is what stops the persistence middleware writing the pane that seam
     * mints over a stored layout nobody managed to read. Cleared by the next
     * restore that succeeds — `workspaceKeyChanged` re-arms one, and a single
     * early failure must not silence the rest of the session.
     */
    workspaceRestoreFailed: boolean;
    /**
     * Whether {@link workspace} is showing a layout the user never asked to
     * keep — a cold-start `/edit/<id>` retargeted a pane the restore had just
     * filled, and evicted whatever was in it.
     *
     * A deep link is an *entry*, not a layout change (see
     * docs/plans/archive/workspace-url.md §3.3). A stale bookmark opened once
     * must not rewrite the split the user actually works in, and that is what
     * used to happen: the seam retargeted the focused pane, the debounced
     * writer saw a changed workspace, and the evicted document was gone from
     * the record before the user had touched anything. Worse with an id that no
     * longer resolves, since the record then names a document that cannot load
     * and the broken pane comes back on every load after.
     *
     * So the view retargets and the record does not follow: the middleware
     * refuses to write while this is set, and the view and the stored record
     * disagree for as long as the session stays provisional. That is the
     * accepted cost — a reload lands back on the stored layout, which is the
     * one the user built.
     *
     * Set only when something was actually displaced, and cleared by the first
     * deliberate layout change (see `commitLayout` in `workspaceReducers.ts`)
     * and by every restore, so it cannot outlive the entry that raised it.
     */
    workspaceProvisional: boolean;
    sidebarView: SidebarView;
    /** Agent work awaiting review — see {@link ProposalsState}. */
    proposals: ProposalsState;
  };
}

export interface DocumentStorageUsage {
  id: string;
  name: string;
  size: number;
}

export enum DocumentStatus {
  ACTIVE = "ACTIVE",
  DONE = "DONE",
}

// New types for blog structure
export interface Series {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorId: string;
  // Optional membership in a Project. When set the series is one of that
  // project's members, ordered by `Project.seriesOrder`; when null it lives in
  // the author's root list, ordered by `User.rootOrder` (which interleaves
  // standalone posts, ungrouped series and projects).
  projectId?: string | null;
  /**
   * This series' posts, in order (docs/plans/archive/ordering-simplification.md
   * §2). The container owns the order of its children, so `posts` is sorted by
   * this rather than by a key on each post — through `orderBy` in
   * `@/lib/orderArray`, which tolerates an array that has drifted from the
   * rows.
   */
  postOrder?: string[];
  author: User;
  posts: Post[];
}

// Series input types
export interface SeriesCreateInput {
  id: string;
  title: string;
  description?: string;
  authorId: string;
  /**
   * The project the series is born into. Omitted (or null) puts it at the
   * author's root list. Unlike a post's container this *is* accepted at create
   * time — a project is the only container a series can have, so there is no
   * cycle to refuse and nothing for a later `/move` to disambiguate.
   */
  projectId?: string | null;
}

export interface SeriesUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

// Project model: a named grouping of Series in the author's root list.
export interface Project {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorId: string;
  /** This project's member series, in order (ordering-simplification.md §2). */
  seriesOrder?: string[];
  author: User;
  // Member series, ordered by `seriesOrder`. Optional because the API
  // returns project metadata only; the client joins series to their project by
  // `series.projectId` (see the sidebar grouping selectors).
  series?: Series[];
}

// Project input types
export interface ProjectCreateInput {
  id: string;
  title: string;
  description?: string;
  authorId: string;
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

// ── Unified document model ───────────────────────────────────────────────────
// One shape for every post, whichever backend it came from. A user is either a
// guest (posts live in IndexedDB) or signed in (posts live in the cloud), so the
// backend is decided once from the session — never carried per-document. There
// is deliberately no `origin: "local" | "cloud"` discriminator: reintroducing one
// would recreate the two-copy branching this model replaces.
// See `src/store/backend/` for the seam and `src/lib/capabilities.ts` for what
// each mode can do.

/** A revision's metadata, without its content. `author` is cloud-only. */
export type RevisionMeta = {
  id: string;
  documentId: string;
  createdAt: string | Date;
  author?: User;
};

/** A revision including its editor content. */
export type Revision = RevisionMeta & { data: SerializedEditorState };

export type Post = {
  id: string;
  /**
   * The post's title (docs/plans/schema-organization.md §C).
   *
   * Was `name`, which collided with `User.name`, `Series.title`, the
   * `NotesCanvas.name`, every DOM node and every IndexedDB store descriptor —
   * so a rename could not be done by search-and-replace and was done by letting
   * the compiler name the sites instead.
   */
  title: string;
  /**
   * The revision this post's content belongs to.
   *
   * In the cloud this is a real foreign key onto `Revision`
   * (docs/plans/schema-organization.md §B); locally it is a plain string, and
   * IndexedDB has no constraint to make it one — a guest's library is the same
   * seam the container order arrays are (ordering-simplification §7), where the
   * invariant is kept by the one write path rather than by the store. The local
   * backend writes the revision before the post that names it, which is the
   * same ordering the FK forces on the cloud side.
   *
   * `""` is how both backends spell "no revision yet": the repositories map a
   * null column to it rather than making every reader handle two empty values.
   */
  headRevisionId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  description?: string | null;
  handle?: string | null;
  /** Parent post when this is a tab of a tabbed post. */
  parentId?: string | null;
  baseId?: string | null;
  seriesId?: string | null;
  series?: Series | null;
  /**
   * This post's child tabs, in order
   * (docs/plans/archive/ordering-simplification.md §2). Empty or absent for a
   * post with no tabs, which is most of them.
   */
  tabOrder?: string[];
  status?: DocumentStatus;
  /** Label for this post's own tab in a tabbed post. */
  tabLabel?: string | null;

  /**
   * Editor content. Present when a post has been loaded for editing or viewing,
   * absent in list views — so `data === undefined` means "not loaded", not
   * "empty".
   */
  data?: SerializedEditorState;
  /** Revision metadata (no content). */
  revisions?: RevisionMeta[];

  // ── Cloud-only. Undefined for guest drafts. ──
  author?: User;
  coauthors?: User[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
};

/**
 * A post as it exists in the database.
 *
 * The cloud-only fields are optional on {@link Post} because a guest draft has
 * no author or collaborators. Server-side that ambiguity doesn't exist — every
 * row has an author — so the repositories return this narrowed shape and API
 * routes can read `post.author.id` without a null check.
 */
export type CloudPost = Post & {
  author: User;
  coauthors: User[];
  revisions: RevisionMeta[];
};

export type PostCreateInput =
  & Omit<Post, "author" | "coauthors" | "revisions">
  & {
    /** Coauthor emails — cloud only, ignored by the local backend. */
    coauthors?: string[];
    /** Seed revisions to create alongside the post. */
    revisions?: Revision[];
    /**
     * Which end of its container the new post lands at. Not a column: both
     * backends turn it into the position the new id takes in the container's
     * order array, and drop it. Defaults to `"end"`.
     */
    placement?: "start" | "end";
  };

/**
 * The fields an update may change.
 *
 * A post's *container* is not among them. `parentId` and `seriesId` describe
 * where a post sits relative to others, which is a move: it has to authorize
 * the destination, refuse parent cycles, and put the id into the destination's
 * order array — all of which `movePost` / `PATCH /api/documents/[id]/move` do
 * in one transaction, and none of which a field-by-field patch can. `tabOrder`
 * is excluded on the same grounds from the other side: a container's order is
 * written by that container's order endpoint.
 *
 * Omitting them here is what makes that a fact rather than a convention. The
 * server's update schema is `.strict()` about the same fields, so the two sides
 * of the seam agree; this half just means the mistake does not compile.
 *
 * `background_image` used to be omitted here for a different reason, and is now
 * gone from the model entirely (docs/plans/schema-organization.md §C): the
 * feature was removed and its bytes deleted (docs/plans/blob-storage.md §10.2),
 * so every path the column could hold named a file that cannot exist. An old
 * export bundle still carries the field and still imports — the importers read
 * it and drop it.
 */
export type PostUpdateInput =
  & Partial<
    Omit<
      PostCreateInput,
      | "id"
      | "parentId"
      | "seriesId"
      | "tabOrder"
    >
  >
  & {
    /**
     * The head this write is replacing, for a save that must not clobber one it
     * has not seen. The cloud backend refuses the update with a 409 if storage
     * has moved on; omit it to write unconditionally, which is what a rename or
     * a publish toggle wants. Never persisted — it is a precondition, not a
     * field.
     */
    expectedHead?: string | null;
  };

/**
 * The container a post lives in. `{}` is the author's root list; a `seriesId`
 * puts it in that series; a `parentId` makes it a tab of that post. It is
 * always read as a *whole* container, never a partial patch — an omitted
 * `seriesId` means "root", not "leave it where it was" — so a caller that
 * renders a container's contents must say which container that is, or a
 * reorder will re-home every row it touches.
 */
export type PostContainer = {
  seriesId?: string | null;
  parentId?: string | null;
};

/**
 * Where a post should land. Not *where among its new siblings*: a move appends,
 * and the destination container's order array places it
 * (docs/plans/archive/ordering-simplification.md §4, decided).
 */
export type MovePostArg = {
  id: string;
  /** Fully specifies the destination container (not a partial patch). */
  destination: PostContainer;
};
// Utility for creating empty editor states
export const EMPTY_EDITOR_STATE: SerializedEditorState = {
  root: {
    children: [],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
};

export const WELCOME_NOTES_EDITOR_STATE = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text:
              "Welcome to your personal notes! This document will automatically save your changes.",
            type: "text",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
} as unknown as SerializedEditorState;

export interface User {
  id: string;
  handle: string | null;
  name: string;
  /**
   * Only present when the viewer is entitled to it — the user themselves, or an
   * author looking at their own content.
   *
   * This is optional rather than required because public payloads genuinely do
   * not carry it. While it was typed as always-present, every query that fed a
   * public surface had to select it to satisfy the compiler, which is how
   * anonymous listings ended up disclosing the email of every author.
   */
  email?: string;
  image: string | null;
  /**
   * The author's root list, in order: standalone post ids, series ids and
   * project ids in one array (docs/plans/archive/ordering-simplification.md
   * §2).
   *
   * Reaches the client through the session — `session.user` is the `User` row
   * (`src/lib/next-auth.d.ts`), so the column travels with it and no route had
   * to be invented to serve it. Absent for a guest, who has no `User` row at
   * all; see `selectRootOrder` for what orders their library instead.
   */
  rootOrder?: string[];
}

/**
 * `/api/auth/session` is the one route not wrapped in the `{ data?, error? }`
 * envelope — NextAuth serves the session object bare — so it is the one
 * response shape the client still has to name. Everything else is read through
 * `request<T>()`, which unwraps `data` and gives back the payload type itself.
 */
export type GetSessionResponse = Session | null;

/**
 * A persisted Copilot conversation.
 *
 * Scoped per user and per workspace scope (plan §6.3): the thread is where the
 * record of what the agent did lives, so it survives a reload and follows its
 * author rather than the browser it was typed in.
 *
 * `messages` is the AI SDK's `UIMessage[]` verbatim. `parts` is an open union
 * owned by that library, so the shape is carried rather than restated — the
 * same call already made by the Copilot route's request schema.
 */
export interface CopilotThread {
  id: string;
  /** A document id, or {@link WORKSPACE_SCOPE} for the document-less thread. */
  scope: string;
  title: string;
  /**
   * The live thread for its scope. The rest are history, newest first. Exactly
   * one is current by convention, not by constraint — see the Prisma model.
   */
  current: boolean;
  updatedAt: string;
  messages: UIMessage[];
}

/**
 * The scope of a conversation with no document behind it — the one the home
 * pane's composer starts. Every other scope is a document id (a uuid), so this
 * cannot collide with one.
 */
export const WORKSPACE_SCOPE = "workspace";

/** A thread as it arrives from a client: everything but ownership. */
export type CopilotThreadInput = Omit<CopilotThread, "updatedAt">;
