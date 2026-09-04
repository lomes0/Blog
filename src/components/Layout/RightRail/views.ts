import {
  GitPullRequest,
  History,
  Info,
  Link as LinkIcon,
  type LucideIcon,
  Table,
} from "lucide-react";
import type { PreferredHeight, ViewId } from "./panelState";

/**
 * What the rail and the slot header both need to know about a view.
 *
 * One table rather than two, because the rail icon and the slot header title
 * used to be the same fact written in two places — `RailSection` took a `title`
 * and an `icon` from inside each section, and the compact strip repeated both
 * as literals. They drifted: the strip's Agent-changes tooltip said "agent
 * changes waiting for review" while the section called itself "Agent changes".
 *
 * The count is *not* here. It comes from a hook per view (`useViewSignals`),
 * because three of the five need a selector and two need a fetch, and a
 * descriptor that could hold a hook would be a component in a lookup table.
 */
interface ViewDescriptor {
  id: ViewId;
  /** The slot header's title, and the rail tooltip. */
  title: string;
  icon: LucideIcon;
  preferredHeight: PreferredHeight;
  /**
   * Whether the view speaks about the open document or about the account.
   *
   * Only `agent-changes` is global, and that is load-bearing rather than
   * incidental: an agent writes to whatever it was asked about, so work waiting
   * on the author is not a property of the document that happens to be open.
   * It is the one view with something to say when nothing is open, and the one
   * whose rail icon must not be dimmed just because the workspace is empty.
   */
  scope: "document" | "global";
  /**
   * What the badge counts, for the icon's accessible name. Rendered into
   * "3 pending changes" / "1 revision", so it has to read as a noun.
   */
  countNoun: readonly [singular: string, plural: string];
}

export const VIEWS: Record<ViewId, ViewDescriptor> = {
  "agent-changes": {
    id: "agent-changes",
    title: "Agent changes",
    icon: GitPullRequest,
    // A list of proposals, each several lines tall, and the one view whose
    // length is not bounded by the document.
    preferredHeight: "grow",
    scope: "global",
    countNoun: ["change waiting for review", "changes waiting for review"],
  },
  outline: {
    id: "outline",
    title: "Outline",
    icon: Table,
    preferredHeight: "grow",
    scope: "document",
    countNoun: ["heading", "headings"],
  },
  properties: {
    id: "properties",
    title: "Properties",
    icon: Info,
    // A key/value list with a fixed set of keys — it is as tall as it is, and
    // stretching it to half the panel is empty space with a border round it.
    preferredHeight: "content",
    scope: "document",
    countNoun: ["property", "properties"],
  },
  revisions: {
    id: "revisions",
    title: "Revisions",
    icon: History,
    preferredHeight: "grow",
    scope: "document",
    countNoun: ["revision", "revisions"],
  },
  backlinks: {
    id: "backlinks",
    title: "Backlinks",
    icon: LinkIcon,
    // Usually a handful of links, often none.
    preferredHeight: "content",
    scope: "document",
    countNoun: ["backlink", "backlinks"],
  },
};

export const preferredHeightOf = (view: ViewId): PreferredHeight =>
  VIEWS[view].preferredHeight;

/**
 * A rail icon's accessible name.
 *
 * The count belongs in the name rather than only in the badge: the badge is a
 * number in a circle, which a screen reader either reads as a bare digit next
 * to an icon or skips entirely. "Revisions, 3 revisions" is clumsy, so the
 * count replaces the plain title rather than following it.
 */
export const railIconLabel = (view: ViewId, count: number | null): string => {
  const { title, countNoun } = VIEWS[view];
  if (count === null || count === 0) return title;
  return `${title}, ${count} ${count === 1 ? countNoun[0] : countNoun[1]}`;
};
