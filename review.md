## Major

**4. 30+ copy-pasted `try/catch` blocks — app.ts**
Every thunk repeats the same `catch (error: unknown) → console.error → rejectWithValue` scaffold. Any change to error format, logging, or messaging must be applied in 30+ places. A `createAppThunk` wrapper would fix this.

**5. Series sync logic inside document reducers — app.ts**
`createCloudDocument.fulfilled`, `deleteCloudDocument.fulfilled`, etc. contain inline series-membership mutation. A document reducer shouldn't know about series data structure.

**6. Pervasive `as unknown as` type erasure — project-wide (31 occurrences)**
Most critically in document.ts where `toCloudDocument` returns `as unknown as Document`. These casts indicate a misalignment between Prisma-generated types and domain types — silent runtime bugs waiting to happen.

**7. Auth/disabled-check boilerplate in every API route — api**
`user.disabled` appears **34 times** across 27 route files. The `getServerSession → check null → check disabled → check author` pattern is fully repeated in every handler. The existing `withApiHandler` wrapper only handles error serialization, not auth. Any auth logic change requires touching 27+ files.

**8. N+1-ish query pattern at the API layer — [src/app/api/documents/[id]/route.ts](src/app/api/documents/[id]/route.ts)**
The GET route calls both `findDocument` and `findEditorDocument`, which each issue their own queries. Every document GET executes 3–4 DB round-trips that could be collapsed into one query with a proper `include`.

---

## Minor

**9. `getDocumentById` thunk is just a selector — app.ts**
It only calls `thunkAPI.getState()` and returns an entity — no async work. This is a plain selector disguised as an `createAsyncThunk`, adding spurious loading-state changes.

**10. `console.log` in editor plugins** — violates the project's own ESLint rule (`no-console` except `warn`/`error`). Found in ImageComponent.tsx, LexicalTablePluginHelpers.ts, and MarkdownTransformers.tsx.

**11. Duplicate identical Prisma select objects — document.ts**
`authorSelect` and `revisionAuthorSelect` are byte-for-byte identical.

**12. No memoization on derived data in list components**
PostsListView.tsx and SeriesGroupCard.tsx compute filtered/sorted data inline. With 64 `useAppSelector` calls across components, every Redux update triggers unnecessary re-renders.