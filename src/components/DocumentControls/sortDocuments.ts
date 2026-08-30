import type { Post } from "@/types";

function compareObjectsByKey(key: string, ascending = true) {
  return function innerSort(
    objectA: Record<string, unknown>,
    objectB: Record<string, unknown>,
  ) {
    const valueA = key.split(".").reduce(
      (o: Record<string, unknown> | undefined, i) =>
        o?.[i] as Record<string, unknown> | undefined,
      objectA as Record<string, unknown>,
    );
    const valueB = key.split(".").reduce(
      (o: Record<string, unknown> | undefined, i) =>
        o?.[i] as Record<string, unknown> | undefined,
      objectB as Record<string, unknown>,
    );
    const a = valueA as string | number | null | undefined;
    const b = valueB as string | number | null | undefined;
    const sortValue = a == null
      ? -1
      : b == null
      ? 1
      : a > b
      ? 1
      : a < b
      ? -1
      : 0;
    return ascending ? sortValue : -1 * sortValue;
  };
}

// Sort a document browser's list by an explicit key (Updated / Created / Name).
// Manual ordering is applied by the content surfaces (posts list, series,
// sidebar) from the container's own order array
// (docs/plans/archive/ordering-simplification.md §2); this browser sort is a
// deliberate alternate view, so it sorts purely by the chosen key.
export const sortDocuments = (
  documents: Post[],
  sortkey: string,
  sortDirection: string,
) => {
  const data = documents.map((d) => {
    const docData = d!;
    return { ...docData, id: d.id };
  });

  const sorted = [...data].sort(
    compareObjectsByKey(sortkey, sortDirection === "asc"),
  );

  return sorted.map((docData) => documents.find((d) => d.id === docData.id)!);
};
