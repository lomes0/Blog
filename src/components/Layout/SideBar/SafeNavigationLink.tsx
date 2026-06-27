"use client";
import RouterLink from "next/link";

// SafeNavigationLink is a plain Next.js Link used by the sidebar. It must be a
// stable top-level component (not defined inside render or useCallback) so MUI's
// `component` prop does not remount the element on every render.
//
// Navigating away from edit mode does NOT push to the cloud. Unsaved edits are
// preserved as a LOCAL draft by `useLocalDraft` on editor unmount, so the doc
// surfaces as "modified" in the sidebar and can be synced explicitly (the sync
// button / Save button / Ctrl+S).
type SafeNavigationLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  href: string;
};

export const SafeNavigationLink = ({
  href,
  onClick,
  children,
  ...props
}: SafeNavigationLinkProps) => {
  return (
    <RouterLink href={href} onClick={onClick} {...props}>
      {children}
    </RouterLink>
  );
};
