import { workspaceUrlForFocus, WORKSPACE_ROUTE } from "@/lib/workspaceUrl";
import type { WorkspaceUrlInput } from "@/lib/workspaceUrl";

/**
 * When the address bar is allowed to follow pane focus.
 *
 * The decision is split out of `WorkspacePanes` precisely so it can be asserted
 * without a browser: every refusal below is a case where rewriting the URL would
 * either fight something else that is mid-flight, or churn it for no reason.
 *
 * The companion property — that replaying the rewritten URL through `openPane`
 * changes nothing — lives in `store/__tests__/workspace.test.ts`, because that
 * one is the reducer's to keep.
 */

/** Two panes open, focus on the right, address bar still naming the left. */
const clickedLeftToRight = (): WorkspaceUrlInput => ({
  currentPath: "/edit/doc-a",
  workspaceHydrated: true,
  urlDocId: "doc-a",
  focusedDocId: "doc-b",
  urlDocIsOpen: true,
});

describe("workspaceUrlForFocus", () => {
  it("rewrites to the focused document when focus has moved", () => {
    expect(workspaceUrlForFocus(clickedLeftToRight())).toBe("/edit/doc-b");
  });

  it("leaves the URL alone while the workspace is still being restored", () => {
    // The layout read is asynchronous; writing here would race the panes it is
    // about to install.
    expect(workspaceUrlForFocus({
      ...clickedLeftToRight(),
      workspaceHydrated: false,
    })).toBeNull();
  });

  it("never writes outside the workspace route", () => {
    for (const currentPath of ["/posts", "/", "/view/doc-a", "/editorial"]) {
      expect(workspaceUrlForFocus({ ...clickedLeftToRight(), currentPath }))
        .toBeNull();
    }
  });

  it("writes on the bare workspace route as well as a document one", () => {
    expect(workspaceUrlForFocus({
      ...clickedLeftToRight(),
      currentPath: WORKSPACE_ROUTE,
    })).toBe("/edit/doc-b");
  });

  it("has nothing to project when no pane is focused", () => {
    expect(workspaceUrlForFocus({
      ...clickedLeftToRight(),
      focusedDocId: null,
    })).toBeNull();
  });

  it("is quiet when the URL already names the focused document", () => {
    expect(workspaceUrlForFocus({
      ...clickedLeftToRight(),
      focusedDocId: "doc-a",
    })).toBeNull();
  });

  it("leaves a handle URL alone while its post is the focused one", () => {
    // `/edit/[id]` takes a handle, and the deep-link seam resolves it before
    // handing it over — so the comparison is between *documents*, and the
    // spelling in the address bar survives until focus genuinely moves.
    expect(workspaceUrlForFocus({
      currentPath: "/edit/my-post",
      workspaceHydrated: true,
      urlDocId: "doc-a",
      focusedDocId: "doc-a",
      urlDocIsOpen: true,
    })).toBeNull();
  });

  it("canonicalises a handle URL once focus moves off that post", () => {
    // Accepted: panes are keyed by id, so the id is the only spelling that can
    // name the focused pane. It costs the handle in the address bar, and only
    // after the user has moved focus themselves.
    expect(workspaceUrlForFocus({
      currentPath: "/edit/my-post",
      workspaceHydrated: true,
      urlDocId: "doc-a",
      focusedDocId: "doc-b",
      urlDocIsOpen: true,
    })).toBe("/edit/doc-b");
  });

  it("yields while the URL names something no pane holds", () => {
    // Two situations, one shape. A deep link the seam has not replayed yet —
    // where the URL is still an *input* and must win. And the beat after
    // `document.open` dispatched but before its `router.push` landed, where
    // writing the destination ourselves would make `HistoryUpdater` skip the
    // push and drop the entry the user came from.
    expect(workspaceUrlForFocus({
      ...clickedLeftToRight(),
      urlDocIsOpen: false,
    })).toBeNull();
  });

  it("does not rewrite a path the browser already has", () => {
    // Reachable when the URL segment is a document id that no pane is rooted at
    // but some pane holds as a tab.
    expect(workspaceUrlForFocus({
      currentPath: "/edit/doc-b",
      workspaceHydrated: true,
      urlDocId: "doc-a",
      focusedDocId: "doc-b",
      urlDocIsOpen: true,
    })).toBeNull();
  });
});
