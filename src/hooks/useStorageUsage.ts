"use client";
import { useEffect, useState } from "react";
import { useSelector } from "@/store";
import { fetchStorageUsage } from "@/store/app";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import type { DocumentStorageUsage } from "@/types";

export type StorageUsageState = {
  loading: boolean;
  usage: number;
  details: { value: number; label?: string; color?: string }[];
};

const initial: StorageUsageState = { loading: true, usage: 0, details: [] };

function parse(documents: DocumentStorageUsage[]): StorageUsageState {
  const usage = documents.reduce((acc, d) => acc + (d.size ?? 0), 0) / 1024 /
    1024;
  const details = documents.map((d) => ({
    value: (d.size ?? 0) / 1024 / 1024,
    label: d.name,
  }));
  return { loading: false, usage, details };
}

/**
 * Storage consumed by the session's posts.
 *
 * One figure, not the old local/cloud pair — posts live in exactly one place now,
 * so there is only one number to report. `fetchStorageUsage` asks the server when
 * signed in and measures IndexedDB for guests.
 */
export function useStorageUsage() {
  const user = useSelector((s) => s.user);
  const initialized = useSelector((s) => s.ui.initialized);
  const errorAnnounce = useErrorAnnounce();

  const [usage, setUsage] = useState<StorageUsageState>(initial);

  useEffect(() => {
    setUsage(initial);
    fetchStorageUsage(user)
      .then((payload) => setUsage(parse(payload)))
      .catch((error: unknown) =>
        errorAnnounce("Failed to load storage usage", error)
      );
    // errorAnnounce is stable - no need to re-run when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { usage, initialized };
}
