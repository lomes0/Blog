# API Client Layer

## Overview

All HTTP calls to `/api/*` routes go through the central client at
`src/api/client.ts`. No component, hook, Redux thunk, or utility is permitted to
call `fetch('/api/...')` directly.

```
src/api/
├── client.ts   – apiClient object + ApiClientError class
├── types.ts    – shared request/response types for the client
└── index.ts    – single re-export entry point
```

Import exclusively from the barrel:

```ts
import { apiClient, ApiClientError } from "@/api";
```

---

## `apiClient` — grouped namespaces

Every route is accessed through a named method grouped by resource. The full
surface is:

| Namespace    | Methods                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`       | `getSession()`                                                                                                                                  |
| `documents`  | `list()`, `get()`, `create()`, `update()`, `move()`, `delete()`, `children()`, `checkHandle()`, `fork()`, `uploadAttachment()`, `updateTimes()` |
| `revisions`  | `get()`, `create()`, `delete()`                                                                                                                 |
| `series`     | `list()`, `get()`, `create()`, `move()`, `update()`, `delete()`, `availablePosts()`, `updatePosts()`                                            |
| `projects`   | `list()`, `get()`, `create()`, `move()`, `update()`, `delete()`                                                                                 |
| `users`      | `update()`                                                                                                                                      |
| `storage`    | `getUsage()`                                                                                                                                    |
| `thumbnails` | `get()`                                                                                                                                         |
| `embed`      | `render()`                                                                                                                                      |
| `notes`      | `getCanvas()`, `create()`                                                                                                                       |

Container changes go through the dedicated `move()` methods, never `update()`.
`PostUpdateInput` omits `parentId` / `seriesId` / `rank`, and the `PATCH` route
schemas are `.strict()`, so passing one is a 400 naming the field rather than a
silent reparent. See the route conventions in [CLAUDE.md](../../CLAUDE.md).

---

## Error handling

The private `request<T>` helper throws `ApiClientError` on any non-2xx response
**or** when the JSON body contains a top-level `error` field (the
`{ data?, error? }` envelope used by every API route).

```ts
export class ApiClientError extends Error {
  statusCode?: number; // HTTP status
  details?: ApiError; // { title, subtitle? } from the response body
}
```

Callers do not need to inspect `response.ok` or unwrap `{ data, error }` — they
just catch:

```ts
// In a Redux thunk:
try {
  const data = await apiClient.documents.create(input);
  return thunkAPI.fulfillWithValue(data);
} catch (error) {
  return thunkAPI.rejectWithValue({
    title: "Something went wrong",
    subtitle: error instanceof Error ? error.message : "Unknown error",
  });
}

// In a component:
try {
  const series = await apiClient.series.create({ title });
  router.push(`/series/${series!.id}`);
} catch (err) {
  setError(err instanceof Error ? err.message : "An error occurred");
}
```

To surface structured server details (e.g. in a validation hook):

```ts
import { ApiClientError } from "@/api";

} catch (err) {
  if (err instanceof ApiClientError && err.details) {
    const { title, subtitle } = err.details;
    setError(subtitle ? `${title}: ${subtitle}` : title);
  }
}
```

---

## Adding a new route

1. **Add a method** to the appropriate namespace in `src/api/client.ts`. The
   route below is illustrative — it does not exist:

   ```ts
   documents: {
     // existing methods …

     /** DELETE /api/documents/:id/attachments/:attachmentId */
     deleteAttachment: (documentId: string, attachmentId: string) =>
       request<void>(`/api/documents/${documentId}/attachments/${attachmentId}`, {
         method: "DELETE",
       }),
   },
   ```

2. **Add any new request/response types** to `src/api/types.ts`, not inline in
   the component.

3. Use `request<T>` for `{ data?, error? }` envelope responses (all standard API
   routes). Use `requestRaw<T>` only when the response is **not** wrapped in
   that envelope (currently only `/api/auth/session`). Use `requestText` for
   routes that return raw text (currently only `/api/embed`).

4. **Do not** add `Content-Type: application/json` manually — use the private
   `json(body)` helper already used by all POST/PATCH methods:

   ```ts
   request<T>(url, { method: "POST", ...json(payload) });
   ```

5. **FormData uploads** must NOT set `Content-Type` — omit it so the browser
   sets it with the multipart boundary automatically (see `uploadAttachment`).

---

## What does NOT belong in this layer

| Concern                                             | Where it lives                                        |
| --------------------------------------------------- | ----------------------------------------------------- |
| Server-side fetch with ISR (`next: { revalidate }`) | `src/app/api/utils.ts` (server only)                  |
| Business logic / data transformation                | `src/repositories/`                                   |
| State mutations after API calls                     | Redux thunks in `src/store/`                          |
| UI error display                                    | component `setError` state or `useErrorAnnounce` hook |

---

## Testing / mocking

Because `apiClient` is a plain object, individual methods can be replaced per
test without any fetch interception library:

```ts
import { apiClient } from "@/api";

jest.spyOn(apiClient.documents, "list").mockResolvedValue([mockDoc]);
jest.spyOn(apiClient.series, "create").mockRejectedValue(
  new ApiClientError("Title is required", 400),
);
```
