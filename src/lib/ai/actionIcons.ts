import {
  ChevronsDownUp,
  ChevronsUpDown,
  ListPlus,
  type LucideIcon,
  Play,
  RefreshCcw,
  Search,
  SpellCheck,
  Text,
} from "lucide-react";
import type { AIActionId } from "./actions";

/**
 * The glyph for each AI action, in one place because two surfaces draw the same
 * list — the editor toolbar's menu and the Copilot's empty-state chips — and a
 * per-site map would be the icon choice stated twice.
 *
 * Components rather than elements, so each site sizes them from `ICON_SIZE`
 * itself: the toolbar's menu icons and the chips' inline icons are different
 * tokens, and baking a size in here would settle that at the wrong end.
 *
 * Separate from `actions.ts`, and deliberately absent from `@/lib/ai`'s barrel:
 * `/api/completion` imports that barrel, and the registry stays data-only so
 * nothing drags `lucide-react` onto the server route.
 */
export const AI_ACTION_ICON: Record<AIActionId, LucideIcon> = {
  continue: Play,
  improve: RefreshCcw,
  shorter: ChevronsDownUp,
  longer: ChevronsUpDown,
  summarize: Text,
  fix: SpellCheck,
  section: ListPlus,
  find: Search,
};
