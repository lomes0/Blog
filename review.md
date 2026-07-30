# Code review — code smells and anti-patterns

First drafted 2026-07-30 against `main` @ `b1822ebb`. **Revised 2026-07-30
against `main` @ `2a53d0d4`**, after every finding was independently verified
against the source in a separate worktree. Sorted by severity, with a fix for
each.

The route-wrapper and `requireDocument` design is genuinely good: making an
unauthorized fetch _unrepresentable_ rather than merely discouraged is the right
instinct, and the ESLint rules that keep the scheme total are the reason it will
stay true. Verification confirmed it holds — **every `DELETE` and batch write
under `src/app/api` is authorized, and no route is missing a check.**

The gap is the one the first draft named, and it is wider than it estimated: the
same rigor was applied to **authorization** (who may act on a row) but not to
**visibility** (which rows are public at all), and the **server-rendered pages
under `src/app` were brought under neither**. Four separate instances of that
one gap are now confirmed — §1, §2, §4, §6 — and three of them are more serious
than anything in the original draft. It is the top structural finding, not §9.

### What the revision changed

Verification confirmed most claims, corrected several, and refuted three. It
also found seven issues the first draft did not have, including the two most
serious ones and one endpoint that is broken in production right now. Every
claim below carries a status:

|               |                                                                      |
| ------------- | -------------------------------------------------------------------- |
| **CONFIRMED** | verified against source, references corrected where they had drifted |
| **UPGRADED**  | real, and worse than first stated                                    |
| **CORRECTED** | real, but the stated impact or mechanism was wrong                   |
| **REFUTED**   | not a defect                                                         |
| **NEW**       | not in the first draft                                               |

The original numbering is noted per finding so prior discussion still maps.

**Base state.** The validation refactor the first draft described as "in flight
in the working tree" landed as `831d4b85` + `2a53d0d4`. There is no
committed-vs-working-tree split; everything below applies to `2a53d0d4`.
`src/store/app.ts` is now 586 lines, not 1,242.

---

# Part 1 — Live vulnerabilities

## 1. `/view`, `/embed`, `/pdf`, `/docx` serve unpublished drafts to anyone

**NEW — highest severity in this review.**

`src/app/(appLayout)/view/[id]/page.tsx:120-134` checks `private` and never
consults `published`:

```tsx
const session = await getCachedSession();
if (!session) {
  if (document.private) {
    return <SplashScreen title="This post is private" … />;
  }
  …
}
```

Same omission at `:42` (`generateMetadata`) and `:140` (signed-in non-author
branch), and in `src/app/embed/[id]/page.tsx:40`, `:83`,
`src/app/pdf/[id]/route.ts:16`, `src/app/docx/[id]/route.ts:11`. All four routes
are reachable anonymously; the page fetches through `findDocument`, which
applies no visibility filter, and bypasses `src/lib/access.ts` entirely.

**An anonymous visitor who knows an id receives the fully rendered body of any
unpublished draft.** The API path for the same document is correctly refused —
`GET /api/revisions/[id]` routes through
`requireRevision → requireDocument →
permitsDocument` (`access.ts:55`), which
checks both flags. This is §4's API/page asymmetry on four more routes with a
much worse payload.

### How to address

Minimal fix — replace each hand-rolled check with the shared predicate from §9,
keeping the collab escape hatch that `permitsDocument` already honours
(`access.ts:50`):

```diff
-      if (document.private) {
+      // Both flags, via the shared predicate: `private` alone let an anonymous
+      // visitor who knew the id read any unpublished draft in full.
+      if (!isPubliclyVisible(document) && !isCollab) {
         return (
           <SplashScreen
-            title="This post is private"
+            title="This post is not available"
             subtitle="Please sign in to view it"
           />
         );
       }
```

Apply at all eight sites listed above.

⚠️ **Changes public output.** Unpublished non-private documents stop being
reachable at `/view/<id>` for anonymous visitors. If drafts are being shared by
URL as an informal preview, that workflow breaks — `collab: true` is the
supported substitute, hence the `&& !isCollab` guard. Confirm before shipping.

The durable version is to route these four pages through
`requireDocument(id, user, "read")` instead of hand-rolling the check. That is
what `access.ts` is for, and it is the same argument the codebase already makes
about `requireOwner`. Do the minimal fix first, then the refactor.

---

## 2. Attachments are served unauthenticated from `public/`

**NEW.** `src/app/api/attachments/access.ts:25-28`:

```ts
export const ATTACHMENTS_DIR = path.join(
  process.cwd(),
  "public/uploads/attachments",
);
```

That is inside Next's static tree. `next.config.ts` has no rewrites or
`/uploads` headers (its only `headers()` entry is a woff2 CORS rule at
`:214-227`) and `src/middleware.ts` is a no-op that excludes `/api` anyway. So:

```
GET /uploads/attachments/attach_<docId>_<rand>.<ext>
```

returns the bytes with **no session, no `requireDocument`, and none of the API's
hardening**. The entire read-authorization model in §11 is decorative — the
filename is the only secret, and filenames leak through revision JSON, forks and
export bundles.

It also defeats the API's deliberate hardening.
`attachments/[filename]/route.ts:110-137` maps unknown extensions (including
`html` and `svg`) to `application/octet-stream` and forces
`Content-Disposition: attachment`, so a malicious `.html` fetched _through the
API_ is inert. Fetched at the static path it is served inline as `text/html`
from the app's origin — **same-origin stored XSS** — and the upload route
explicitly permits that extension (`/^\w{1,16}$/`, no MIME allowlist).

Two honest caveats: Next's production server enumerates `public/` at boot, so a
file uploaded after boot may not be statically served until a restart (immediate
in `next dev`) — a timing accident, not a control, and `blog.service` uses
`Restart=always`. And under Docker/Fly runtime uploads are ephemeral anyway,
which is a separate durability bug that happens to blunt this one.

### How to address

Highest benefit-to-cost change in the review — one constant:

```diff
-export const ATTACHMENTS_DIR = path.join(
-  process.cwd(),
-  "public/uploads/attachments",
-);
+export const ATTACHMENTS_DIR = process.env.UPLOADS_DIR
+  ? path.join(process.env.UPLOADS_DIR, "attachments")
+  : path.join(process.cwd(), "var/uploads/attachments");
```

with matching updates at `documents/[id]/attachments/route.ts:51`,
`import/route.ts:245,267` and `export/route.ts`. Needs a one-time move of
existing files and a Docker/Fly volume — which is wanted anyway for durability.

Then constrain the upload extension to a binary-safe allowlist as defence in
depth:

```diff
-const fileExt = /^\w{1,16}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
+const SAFE_EXT = new Set(["png","jpg","jpeg","gif","webp","pdf","txt","md",
+  "csv","json","zip","tar","gz"]);
+const lowered = rawExt.toLowerCase();
+const fileExt = /^\w{1,16}$/.test(lowered) && SAFE_EXT.has(lowered)
+  ? lowered : "bin";
```

---

## 3. Stored XSS through the Lexical HTML export

**Was §8 — UPGRADED.** The first draft said `/api/embed` was "an unauthenticated
compute sink" and that "any XSS sink in the Lexical serializer is directly
reachable from it". There are sinks, they are reachable, and the larger delivery
path is not `/api/embed` at all.

`patches/@lexical+html+0.28.0.patch` removes the headless guard from
`$generateHtmlFromNodes`, which returns `container.innerHTML` — so whatever an
`exportDOM` puts inside its element is emitted verbatim. **There is no sanitizer
anywhere in the project** (no `dompurify`, `sanitize-html`, `xss`).

**Confirmed sinks:**

- **`KanbanNode/index.tsx:161-171`** builds an HTML string interpolating
  `${task.name}` unescaped, then assigns it at `:183` via `element.innerHTML`.
  `task.name` comes straight from `importJSON` (`:38-41`), typed only as
  `string`. Textbook unescaped interpolation — no library internals involved.
- **`GraphNode/index.tsx:98-107`** URL-decodes attacker-controlled `__src` into
  `innerHTML`; `importJSON` (`:58-90`) validates nothing. Only `<style>` is
  stripped afterward, so `<svg onload>` and `<img onerror>` survive.
- **`SketchNode/index.tsx:104-111`** is the same code without even Graph's
  `data:image/svg+xml` guard, so _any_ `__src` containing a comma is decoded.

Secondary: `IFrameNode:137-160` emits an unfiltered `iframe src` with no
`sandbox` (the YouTube regex is a rewrite convenience, not a filter);
`htmlConfig.tsx:71-87` does no scheme filtering on link hrefs and actively
strips `rel`, removing Lexical's `noopener noreferrer`. `MathNode:63-71` injects
MathLive markup into `innerHTML` with no post-filtering — **unconfirmed**, since
`node_modules` was not readable; verify `\href` / `\htmlData` / `\class` /
`\htmlStyle` before relying on it.

**Delivery paths, in order of impact:**

1. **Stored, on the public post view.** `ViewDocument.tsx:222` injects the same
   serializer output via `dangerouslySetInnerHTML`. Any author saving a document
   with such a payload gets script execution in the browser of **every visitor
   to `/view/[id]`**. Same at `ChildDocumentView.tsx:64`. No involvement from
   `/api/embed` whatsoever.
2. **`/api/embed` as a top-level navigation.** No CSRF token, no `Origin` or
   `Sec-Fetch-Site` check, and `parseBody` calls `request.json()` regardless of
   `Content-Type` — so a cross-origin auto-submitting form with
   `enctype="text/plain"` produces a valid JSON body and navigates the victim to
   a `text/html` response from your origin, where even a bare `<script>` runs.
3. `htmr`-rendered pages (`/embed/[id]`, `/playground`, `/tutorial`) are
   materially safer — React will not execute `<script>` or `javascript:` hrefs.

**Impact is capped at act-as-the-user, not credential theft.** `src/lib/auth.ts`
declares no `cookies` block, so the NextAuth session cookie is `httpOnly` by
default. Injected script cannot read the token — but it runs same-origin and can
call every `userRoute` endpoint with the victim's cookie attached.

The Zod migration did not change this: `editorStateSchema`
(`documents/schemas.ts:40-43`) is `.passthrough()` at both levels, asserting
only that `root` is an object. It renamed the check without tightening it.

### How to address

**Tier 0 — fix the sinks.** Everything else is compensating control; the stored
path is exploitable with no route involvement.

`KanbanNode.exportDOM` should build a tree, never a string, so escaping is
structural:

```ts
for (const task of this.__tasks.filter((t) => t.stage === stageIndex)) {
  const li = document.createElement("li");
  li.textContent = task.name; // escaping is now structural
  ul.append(li);
}
```

Graph and Sketch legitimately need to emit SVG, so sanitize:

```diff
 const html = decodeURIComponent(this.__src.split(",")[1]);
-element.innerHTML = html.replace(/<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/, "");
+element.innerHTML = DOMPurify.sanitize(
+  html.replace(/<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/, ""),
+  { USE_PROFILES: { svg: true, svgFilters: true } },
+);
```

and restore Sketch's missing `isSVG` guard. Replace the `firstElementChild!`
assertions (`GraphNode:108`, `SketchNode:112`) with null checks — today a
malformed payload throws inside `$generateHtmlFromNodes` and silently degrades
the whole document to the empty-state fallback.

Add a `safeUrl` helper (allow `https?:`, `mailto:`, `tel:`, `#`, `/`) for
`htmlConfig.tsx` and `AttachmentNode/index.tsx:116`, stop stripping `rel` on
`target="_blank"`, and allowlist + `sandbox` the iframe src.

**Tier 1 — route mitigations, ~20 lines.** A body size cap (route handlers get
none — `bodySizeLimit: "2mb"` at `next.config.ts:163` is Server-Actions-only), a
`Sec-Fetch-Site` check, and response headers:

```diff
       headers: {
-        "Content-Type": "text/html",
+        "Content-Type": "text/html; charset=utf-8",
+        "X-Content-Type-Options": "nosniff",
+        "Content-Security-Policy":
+          "sandbox allow-popups; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'",
       },
```

`CSP: sandbox` is the highest-leverage line — it makes delivery path 2
non-exploitable even with the serializer unfixed, by rendering the response in
an opaque origin. It does nothing for path 1.

**Do not require a session on `/api/embed`.** `src/app/api/utils.ts:16,80` calls
it over loopback with no cookies, backing `/`, `/view/[id]`, `/user/[id]`,
thumbnails, `/tutorial` and `/playground`. Adding `userRoute` 401s all of them.
The better move is for those two callers to invoke `generateServerHtml` directly
— same process, no HTTP hop — after which the route's exposure can be narrowed
on its own terms.

**Also worth its own ticket:** `generateServerHtml:36-51` assigns
`global.window` / `global.document` / `global.Element` for the duration of a
call and restores them in `finally`. Node serves requests concurrently, so two
overlapping requests clobber each other's globals and the first to finish tears
them out from under the second. Unauthenticated-triggerable, and it can corrupt
unrelated concurrent SSR.

---

## 4. Public user profile leaks private posts and every user's whole row

**Was §1 — CONFIRMED and slightly upgraded.**

`findPublishedDocumentsByAuthorId` (`src/repositories/document.ts:275-291`)
filters `published: true` at `:279` but **not** `private: false`. Its sibling
`findPublishedDocuments` (`:127-144`) checks both and carries a docstring four
lines above explaining exactly why the flags are independent.

Its only caller is `src/app/(appLayout)/user/[id]/page.tsx`, which reads no
session anywhere in the file — so there is no viewer to compare against even in
principle. **A published-and-private post is listed to anyone who visits the
author's profile.**

Second leak, same page: `findUser` (`src/repositories/user.ts:5-9`) is a bare
`findUnique` with no `select`, and `page.tsx:55` passes the whole Prisma row to
`UserCard`, which is `"use client"`. Two distinct disclosures:

- `UserCard.tsx:99` **renders** `user.email` as the subtitle under the user's
  name — visible page text on any stranger's profile.
- `role`, `disabled`, `emailVerified`, `lastLogin`, `createdAt`, `updatedAt` all
  cross into the RSC Flight payload silently, readable in view-source.

The type system was set up to prevent exactly this — `types.ts:299-313` declares
`email?: string` with a docstring saying it is "Only present when the viewer is
entitled to it" — and this call site defeats it by passing a wider object than
the interface describes.

The asymmetry the draft named is real: `GET /api/users/[id]` was deliberately
hardened for this case (`route.ts:44`, with a comment recording that walking
user ids used to harvest every address). The API was fixed; the page reading the
same repository function was not.

Not amplified: the leaked `head` revision ids are _not_ redeemable, because
`GET /api/revisions/[id]` checks both flags. So §4 leaks metadata, not bodies.
Bodies leak through §1.

### How to address

Add the shared filter from §9, and rename — `findPublished…` is what invited
`published: true` and nothing else:

```diff
-const findPublishedDocumentsByAuthorId = async (authorId: string) => {
+const findPubliclyVisibleDocumentsByAuthorId = async (authorId: string) => {
   const docs = await prisma.document.findMany({
-    where: { authorId, published: true, type: PrismaDocumentType.DOCUMENT },
+    where: { authorId, ...PUBLICLY_VISIBLE_DOCUMENT },
     select: {
       ...documentCoreSelect,
       revisions: revisionsSelect,
-      author: { select: authorSelect },
+      author: { select: publicAuthorSelect },
     },
```

Update the export at `document.ts:484` and the two references in
`user/[id]/page.tsx:3`, `:15`.

For the user row, prefer a sibling over an inline `select` — `findUser`'s other
two callers legitimately need the full row (`api/users/[id]/route.ts:35` reads
`user.email` in order to gate it; `api/users/utils.ts:23` checks handle
availability):

```ts
const findPublicUser = async (handle: string) =>
  prisma.user.findUnique({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    select: {
      id: true,
      handle: true,
      name: true,
      image: true,
      createdAt: true,
    },
  });
```

`createdAt` is kept because `generateMetadata` renders "Member since". Point
`getCachedUser` at it, and change `UserCard.tsx:99` to render the handle.

⚠️ **Changes public output** twice: private posts disappear from `/user/[id]`
(the intent), and the profile subtitle changes from email to handle. Note
`UserCard` is also used at `Dashboard.tsx:19` with `showActions`, where the
viewer _is_ the user and seeing their own email may have been intended — gate on
`showActions` if so. Product call.

---

## 5. `document.ts` selects author emails into public listings

**Was §2 — CONFIRMED, one claim corrected.**

`document.ts:21` and `:29` define `authorSelect` and `revisionAuthorSelect`,
both carrying `email: true` — and they are **byte-for-byte identical**, two
names for one shape. Because `revisionsSelect` (`:47-56`) is embedded in every
list query, each public listing carries **two** emails per row: the document
author's and the head revision author's.

Both reach the client. `page.tsx:37` passes them into `<Home>` (`"use client"`),
and `user/[id]/page.tsx:85` into `<UserDocuments>` (also client). They also
reach `/view/[id]` and `/embed/[id]` through two inline re-spellings inside
`findDocument` (`:169`, `:183`).

`series.ts` is the contrast the draft invoked, and it holds up: `:18-24`
`authorSelect` (owner-scoped, with a comment saying the caller is the author) vs
`:26-33` `publicAuthorSelect` (no email, commented _"a public series listing
must not become an address-harvesting endpoint"_). `document.ts` contradicts a
convention its sibling states in a comment.

**Corrected:** the sitemap claim was overstated. `sitemap.ts:10` calls
`findPublishedDocuments()` and consumes only `handle`, `id`, `updatedAt` at
`:36-39` — the output is a URL list. That is an unbounded over-fetch (joining
every author row and head revision, all discarded), not a disclosure.

### How to address

Split the shape, and make the emailless version the default:

```ts
const publicAuthorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
} as const;
const authorSelectWithEmail = { ...publicAuthorSelect, email: true } as const;
```

- `revisionsSelect` (`:52`) → `publicAuthorSelect` (it is embedded in all three
  list queries; the owner listing loses nothing it displays)
- `findPublishedDocuments` (`:137`) → `publicAuthorSelect`
- `findDocumentsByAuthorId` (`:257`) → `authorSelectWithEmail`
- the two inline blocks in `findDocument` (`:169`, `:183`) →
  `publicAuthorSelect`

Then delete the now-dead fallback at
`DocumentCard/components/PostContent.tsx:103`:

```diff
-              {author.name || author.email}
+              {author.name}
```

✅ **No visible output change.** `name` is non-null in the schema, so that
fallback never reached its right operand, and `types.ts:312` already declares
`email?`. This is the one safe change in the visibility cluster — the only
difference is that `/` and `/user/[id]` stop shipping two addresses per card.

---

## 6. `/posts` calls an owner-scoped selector with an unvalidated URL segment

**NEW.** `src/app/(appLayout)/posts/[[...id]]/page.tsx:50`:

```ts
seriesId ? findSeriesById(seriesId) : Promise.resolve(undefined);
```

`findSeriesById` is the owner-scoped selector. `src/lib/access.ts:169-172`
states the rule outright:

> `findSeriesById` returns member posts unfiltered, so it must only ever reach a
> proven author — anonymous and third-party reads go through
> `findPublicSeriesById` instead.

The page calls it with an arbitrary URL segment and no ownership check, then
passes the result to `PostsView`, a client component, so it lands in the RSC
payload. The API route for the same data (`GET /api/series/[id]:31`) is
`optionalUserRoute` and branches correctly — the same API/page asymmetry as §1
and §4.

### How to address

Branch on proven authorship, exactly as the API route does: call
`findPublicSeriesById` unless the session user is the series author. If the page
needs both shapes, resolve the session first and pick — do not pass the
owner-scoped result to a client component under any circumstance.

While in that file, drop the dead `role` prop at `:62`. `PostsView`'s
`user?: User` (`@/types`) has no `role`, nothing reads it, and it only reaches
the client because binding to a `const` first suppresses TypeScript's
excess-property check. `docs/guides/nextauth-ssr.md:39` shows the same snippet
and should be updated with it.

---

# Part 2 — Broken in production

## 7. `GET /api/usage` queries a table that does not exist

**NEW.** `src/repositories/document.ts:428`, inside
`findCloudStorageUsageByAuthorId`:

```sql
FROM
  "Post" d
```

The model is `Document` (`prisma/schema.prisma:64`) with **no `@@map`**, and no
migration ever created a `"Post"` table. So the endpoint
(`src/app/api/usage/route.ts:11`) fails at runtime with
`relation "Post" does not
exist`. Left over from the `2ccea65e` posts/documents
rename, which updated the Prisma model but not the raw SQL — invisible to both
`tsc` and `prisma generate`, which is why it survived.

### How to address

One word: `"Post"` → `"Document"`. Then consider whether any other `$queryRaw`
exists in the codebase — raw SQL is outside every type check the project relies
on, and this is the failure mode.

---

## 8. `DELETE /api/revisions/[id]` can make a post permanently undeletable

**NEW — this is the root cause behind §10.**

`Document.head` is `String? @db.Uuid` (`prisma/schema.prisma:76`) with **no
foreign key**, so the database cannot enforce that it names a live revision.
`src/app/api/revisions/[id]/route.ts:42` calls a `deleteRevision` that is a bare
`prisma.revision.delete` — it never repoints `head`. The Redux reducer
(`app.ts:407-411`) filters the revision out of `post.revisions` and leaves
`post.head` untouched, so the in-memory post keeps a head absent from its own
list.

Delete a post's **only** revision and it is worse than dangling: the document
has zero revisions, `findDocument` returns `null` (`document.ts:212`), and the
post then 404s on `PATCH`, `DELETE`, `move`, `background` and `attachments` —
**it can no longer be deleted through the API.**

Reachability: the route is live and authenticated, `apiClient.revisions.delete`
exists (`src/api/client.ts:306-312`) and the thunk is wired
(`revisionThunks.ts:23-27`), but no current UI component dispatches it. A loaded
gun rather than a fire — any API client, the MCP server, or the next
revision-history UI hits it immediately.

### How to address

Make the delete transactional and head-aware. The `where: { head: id }` scope is
what stops it clobbering a concurrent save:

```ts
const deleteRevision = async (id: string) =>
  prisma.$transaction(async (tx) => {
    const revision = await tx.revision.delete({ where: { id } });
    const next = await tx.revision.findFirst({
      where: { documentId: revision.documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    await tx.document.updateMany({
      where: { id: revision.documentId, head: id },
      data: { head: next?.id ?? null },
    });
    return revision;
  });
```

Mirror it in the reducer so the in-memory post stays consistent. Add the `id`
tiebreaker to the two existing `orderBy: { createdAt: "desc" }` clauses
(`document.ts:174`, `:387`) so "newest revision" is a total order — `createdAt`
is client-supplied (`revisions/route.ts:45`) and not unique.

An FK on `Document.head` is the real fix and is already scoped as Phase B of
`docs/plans/schema-organization.md`.

---

# Part 3 — Structural

## 9. The "who may see this" predicate exists in fifteen places

**Was §3 — CONFIRMED in direction, table corrected, count more than doubled.**

The first draft listed six sites and got one wrong. The real picture:

**Both flags checked (correct) — 3 sites**

| Location                               | Form                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/lib/access.ts:55`                 | `!!doc.published && !doc.private` — the canonical TS predicate  |
| `src/repositories/document.ts:130-131` | inline literals in `findPublishedDocuments`                     |
| `src/repositories/series.ts:87-91`     | `publiclyVisiblePosts` — the only reusable constant in the repo |

**`published` only — private posts pass — 4 sites**

`document.ts:279` (§4), `Home/KanbanBoard.tsx:34`,
`Home/KanbanPreviewCard.tsx:13`, `DocumentCard/hooks/usePostState.ts:23-24`.

**`private` only — unpublished drafts pass — 8 sites, entirely absent from the
first draft**

`view/[id]/page.tsx:42`, `:123`, `:140`; `embed/[id]/page.tsx:40`, `:83`;
`pdf/[id]/route.ts:16`; `docx/[id]/route.ts:11`; `edit/[[...id]]/page.tsx:20`.
Seven of the eight are anonymous — this is §1.

**Two corrections to the original table.** `series.ts:52` was a misread:
`published: true, private: true` there are **`select` keys**, not a where-clause
— they request the columns and filter nothing. And the two Kanban helpers are
**REFUTED as instances of this bug**: they split the _owner's own_ documents
into Drafts and Published columns, where `published`-alone is the correct
predicate. Converting them would misfile every private post as a draft on the
author's own board. What they actually are is a duplicated helper
(`getDocumentPublished` is defined identically in both files) — a code-quality
item, not a visibility one.

### How to address

This remains the highest-value structural fix, but the first draft's proposal —
a single Prisma fragment — **cannot reach the largest sub-family.** Eight of the
fifteen sites are TypeScript boolean tests on an already-fetched row, and a
`where` object cannot serve those. That is precisely where the worst bug lives.

New file `src/lib/visibility.ts` — in `src/lib` because both `access.ts` and
page components under `src/app` must import it, and importing a repository from
a page to get a constant would invert the layering. **Three exports, not one:**

```ts
export const PUBLICLY_VISIBLE = {
  published: true,
  private: false,
} as const satisfies Prisma.DocumentWhereInput;

export const PUBLICLY_VISIBLE_DOCUMENT = {
  ...PUBLICLY_VISIBLE,
  type: PrismaDocumentType.DOCUMENT,
} as const satisfies Prisma.DocumentWhereInput;

/** The same rule against a row already in hand — for pages and `permitsDocument`,
 *  which cannot express themselves as a `where` clause. */
export const isPubliclyVisible = (
  doc: { published?: boolean | null; private?: boolean | null },
): boolean => !!doc.published && !doc.private;
```

`as const satisfies` is load-bearing: it keeps the literal types so spreading
into a `where` stays assignable, while making a typo like `publised: true` a
compile error rather than an ignored extra key.

**Four queries must NOT get it**, and naming them is the point:

1. `findDocumentsByAuthorId` (`document.ts:252-265`) — the owner's own listing.
   Adding the filter hides every draft from its author's own sidebar. **This is
   the one a find-and-replace breaks**: it sits eight lines from the query that
   does need it, with a near-identical shape.
2. `findDocument` (`document.ts:150-188`) — visibility here is
   `requireDocument`'s job, applied after the fetch and parameterised by
   `own`/`write`/`read`. Filtering in the query would stop an author opening
   their own draft and turn every 403 into a 404.
3. `findEditorDocument` (`document.ts:369-416`) — by definition operates on
   drafts.
4. `series.ts:219-221` / `:263-265` — documented owner views.

The rule worth writing down: **`PUBLICLY_VISIBLE` answers "may a stranger see
this", not "is this live".** Owner-facing UI asks the second question and must
keep asking it separately.

Once converged, consider a `no-restricted-syntax` rule rejecting a `published:`
key in a `where` object outside `visibility.ts` — that is what makes the
invariant total rather than documented, which is this codebase's own stated
standard.

---

## 10. `findDocument` writes to the database on a read

**Was §6 — CONFIRMED, undercounted, and one characterisation corrected.**

The write is at `src/repositories/document.ts:213-216` (the draft cited `:205`;
the line moved, the finding stands). The two "route around it" comments are real
— `access.ts:105-106` and `attachments/access.ts:79-80` both say they pass
`revisions: "all"` specifically to avoid the write path.

**A second write-on-read the draft missed:** `document.ts:392-395` inside
`findEditorDocument` is the same repair duplicated — and it has **no `"all"`
escape hatch**, so it writes on every editor open of a broken document. It is
called from `GET /api/documents/[id]`. Any fix must cover both or the
inconsistency just moves.

**The blast radius is 12 of 17 `requireDocument` call sites, not two.** The
draft said "callers know and route around it"; most do not. Two consequences
follow:

- **An anonymous request can cause a database write.**
  `api/thumbnails/[id]/route.ts:13-15` is `optionalUserRoute` with `read` and no
  `"all"`, as are anonymous `GET /pdf/<id>` and `/docx/<id>`. "Read endpoints
  are read-only" is not currently true, and it defeats any future read-replica
  routing.
- **Three call sites use a revision-filtering finder as an existence check** —
  `validateHandle` (`documents/utils.ts:23`), the duplicate-id guard
  (`documents/route.ts:47`) and the `baseId` lookup (`:141`). They get a write
  on a document the caller may not own, plus a **wrong answer** for any document
  with zero revisions: `findDocument` returns `null`, `validateHandle` reports
  the handle as free, and the create then trips the unique constraint and 500s.

**"Racy" — CORRECTED.** Repair-versus-repair is benign: both readers pick a
valid revision of the correct document, last write wins, nothing corrupts. The
hazard is repair-versus-_save_. The `UPDATE` is unconditional with no
compare-and-swap, so a repair racing a concurrent save can roll `head`
**backwards** to an older revision — the user's just-saved content silently
stops being the head. Keep the line, restate the mechanism.

**"Unusable in a read-only transaction" — true for the wrong reason.**
`findDocument` closes over the module-level `prisma` client and accepts no `tx`
handle, so it cannot join _any_ interactive transaction. The `UPDATE` is not
what excludes it; the missing parameter is. Compare `repositories/ordering.ts`,
which does thread `tx`.

### How to address

Order matters — §8 first, because it is what creates the broken state the repair
exists for.

**Do not delete the recovery, only the write.** Both repair branches sit
immediately before a `return null`, so removing the _fallback_ turns a document
with a broken head into a 404 for its own author on every route lacking
`revisions: "all"` — including `DELETE`, making the post undeletable. Keep the
fallback, drop the `prisma.document.update`, in **both** finders.

Then, if a repair function is still wanted, make it a compare-and-swap:

```ts
export const repairDocumentHead = async (
  id: string,
  expectedHead: string | null,
): Promise<string | null> => {
  const latest = await prisma.revision.findFirst({
    where: { documentId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!latest) return null;
  await prisma.document.updateMany({
    where: { id, head: expectedHead }, // guard, not lookup
    data: { head: latest.id },
  });
  return latest.id;
};
```

`updateMany` rather than `update` is what makes the `where` a guard — `update`
throws when it matches nothing. After §8 the only legitimate caller is a one-off
backfill for rows already broken.

Give the three existence checks a `documentExists(handle)` helper that cannot
write or return a false negative. This alone fixes the `validateHandle` 500.

Two remaining producers of broken state, both worth closing:
`POST /api/import:198-208` trusts the bundle's `head` even when it names a
revision the bundle does not contain (fall back on _dangling_, not merely
absent); and `head` is optional on create, so `createDocument` (`:314`) triggers
its own repair on the create path — derive the head from the revision it creates
instead.

Note one defect this mechanism can never see: `useSave.ts:129-142` issues the
revision create and the `head` update as two non-atomic requests, so a partial
failure leaves a **stale-but-valid** head that resolves fine and is never
repaired. The clean fix is for `POST /api/revisions` to advance `head` in the
same transaction, which also lets `useSave` drop its second request.

When the writes are gone, **delete the `revisions: "all"` comments** at
`access.ts:118-121` and `attachments/access.ts:79-93` or they will be read as
still true. Leave the argument — it is also a real perf choice.

---

## 11. Attachment ownership is inferred from the filename

**Was §9 — CONFIRMED and UPGRADED.** The draft called this latent: "any _future_
upload path that names a file differently becomes unauthorizable". That future
already arrived.

`attachments/access.ts:21` recovers the parent document id by regexing
`attach_<uuid>_` out of the filename, feeding `requireAttachmentRead` (`:73-83`)
and `requireAttachmentWrite` (`:86-95`). The uuid **is** the `Document` primary
key, and `prisma/schema.prisma` has **no `Attachment` model at all** — the
filename on disk is the only record that a file exists.

The legitimate upload path is sound: `documents/[id]/attachments/route.ts`
authorizes the route param as `own` and appends a 128-bit CSPRNG suffix, so a
user cannot bind a file to a document they do not own _through that route_.

**But `POST /api/import:236-258` lets them.** It writes files under names taken
from inside the uploaded zip. `resolveWithin` (`safePath.ts:44-51`) blocks
traversal but deliberately does not constrain the _shape_ of a name, so any
signed-in user can plant `attach_<victimDocumentId>_<anything>.<ext>` in the
shared directory. The `existsSync` guard makes this planting rather than
overwriting — but planting is enough, because the filename namespace **is** the
authorization namespace.

Compounding it, import creates documents with `id: docExport.id` straight from
the zip — **an importer chooses primary keys.** Combined with hard deletes and
the fact that `grep -rn "unlink" src` returns nothing (no code in this
repository ever deletes a file), that gives a resurrection chain: after a
document is deleted its files remain and its uuid is free, so an attacker can
import a bundle asserting that id and re-authorize the orphaned files to
themselves. They need the random filenames, which are not secret — they are
preserved in any fork, in any export bundle, and listed verbatim in
`referencedAssets`.

Fork and duplicate never rewrite references: `rewriteAttachmentUrls`
(`lexicalAssetRewriter.ts:88-120`) exists but is only called by the
export/import bundler. So a copy's Lexical nodes still point at the original's
files, and `GET /api/export` (`export/route.ts:116-131`) reads attachments by
filename with no per-file ownership check — it will bundle another user's bytes
into the forker's zip.

### How to address

**Tier 1 — cheap.** §2 (move the directory) is the single highest-value change
and closes the outright bypass. Then stop the importer forging names: re-mint
them against the document the import actually created, and rewrite the
references with the helper that already exists —

```diff
-  const destPath = resolveWithin(destDir, filename);
+  // Names carry authorization meaning (`attach_<documentId>_`), so a name from
+  // inside an uploaded zip is never used as-is.
+  const minted = `attach_${docExport.id}_${crypto.randomBytes(16).toString("hex")}.${ext}`;
+  const destPath = resolveWithin(destDir, minted);
```

Refuse imported document ids (or gate id-preserving restore on admin), call
`rewriteAttachmentUrls` on fork and duplicate, and quote the
`Content-Disposition` filename properly at `[filename]/route.ts:137` —
`assertSafeFilename` blocks `..`, `/` and `\` but not quotes, and import can
create a name containing one.

**Tier 2 — the structural fix**, roughly a day:

```prisma
model Attachment {
  id         String   @id @default(uuid()) @db.Uuid
  documentId String   @db.Uuid
  storageKey String   @unique      // opaque; never parsed for meaning
  filename   String                // original name, display only
  mimetype   String
  size       Int
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@index([documentId])
}
```

Authorization becomes a join, and `requireAttachmentRead` returns the row only
after `requireDocument` passes — the same "missing variable, not missing line"
shape the codebase already commits to. The regex, `documentIdOf` and
`requireDocumentIdOf` all delete.

Migration: add the model, backfill by walking the directory and inserting a row
per `attach_<uuid>_` name (**the names whose document no longer exists are the
orphan list — the first accounting of leaked files this project has ever had**),
switch to `/api/attachments/[id]` with the filename route as a deprecated alias
for one release, then add the cascade file cleanup, which will be the first time
deletion actually removes bytes.

**Do this before the R2/MinIO move, not after.** That migration is not in the
repository at all (only in project notes) — and every question it must answer is
a column on this table. `storageKey` is the bucket key, and the table is what
lets the bucket be private with signed URLs, which is what finally kills §2 for
good.

Also: `docs/architecture/api-client.md:104-107` documents a
`DELETE /api/documents/:id/attachments/:attachmentId` endpoint that does not
exist.

---

## 12. Admin authorization is ad-hoc string comparison

**Was §4 — CONFIRMED, with the severity inverted from how it was framed.**

`api/revalidate/route.ts:11` and `api/users/[id]/route.ts:97` both inline
`if (user.role !== "admin")`, and that is the complete set. `role` is
`String @default("user")` (`schema.prisma:157`) with no enum, and `auth.ts:117`
assigns the whole Prisma row into the session with no normalization — no
`.trim()`, no `.toLowerCase()`.

**The typo risk is real, not theoretical — and the reason is the opposite of
what you would guess.** Every write path to `users` was traced: the PATCH schema
is `.strict()` so `role` in a body is a 400; there is no seed, no script, and no
migration that sets a value; `createUser` is exported with zero call sites.
**`role` can only become `"admin"` through a manual `psql` or Prisma Studio
edit.** So the one path that exists is a human typing a string into an
unconstrained `TEXT` column, and a mistyped `'Admin'` produces an account that
is silently not an admin, with no feedback anywhere — `role` is rendered in no
UI and returned by no endpoint. It fails closed, so it is an operability trap
rather than a hole. The inverse (a typo that _grants_ access) is impossible.

**What the finding brushed past matters more.** `DELETE /api/users/[id]` is a
real hard delete with a wide cascade, and `Revision.author` is
`onDelete: Cascade` while revisions **can** be authored cross-user — `collab`
grants `write` (`access.ts:50`), and `revisions/route.ts:43` stamps
`authorId: user.id`. So **deleting user B destroys revisions out of user A's
document history**, and since `Document.head` has no FK it can leave A's
document pointing at a deleted row, which then trips §10's repair. Uploaded
files are never cleaned up (see §11). There is no self-delete guard — and since
`role` has no application write path, deleting the last admin makes the
capability unrecoverable without database access. Meanwhile `User.disabled`, the
reversible tool the app already enforces in three places, is exposed by no
endpoint at all.

Minor: `revalidate/route.ts:14` throws 403 under the title `"Unauthorized"`; the
users route correctly says `"Forbidden"`. A helper fixes that by construction,
which is a small illustration of the finding's own point.

### How to address

`requireAdmin(user, subtitle)` — in **`src/lib/access.ts`, not `api-utils.ts`**.
The two files have a deliberate split: `api-utils.ts` is plumbing (`ApiError`,
the wrappers, `parseBody`), `access.ts` is policy (all six `require*`). Putting
it in `access.ts` keeps `grep -rn "require" src/lib/access.ts` as the complete
list of authorization rules — the same totality argument that justifies
`publicRoute` existing as a separate name. (The counter-argument is that
`requireOwner` already lives in `api-utils.ts`; that is the existing
inconsistency, and moving it across is a separate mechanical cleanup.)

Signature notes: take `SessionUser` non-null (callers reach it only from
`userRoute`); require the `subtitle` as every other `require*` does; return
`void`, not a boolean, so it cannot be written as a forgettable `if`. Unlike
`requireDocument` there is no row to hand back — the capability is on the
caller, not a target — so this one is legitimately an assertion; say so in the
doc comment, so the asymmetry reads as deliberate.

Then the enum. The repo **already committed to this name** in
`docs/plans/schema-organization.md:120,133` — use `UserRole { USER ADMIN }`
rather than inventing `Role` (`role` is also a Copilot message field and an ARIA
attribute in this codebase). The payoff is compile-time: after the change,
`user.role !== "admin"` is a **type error**, so every typo site becomes a build
failure.

Hand-write the migration; do not let Prisma generate the destructive one:

```sql
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole"
    USING (CASE lower(btrim("role"))
             WHEN 'admin' THEN 'ADMIN'::"UserRole"
             ELSE 'USER'::"UserRole" END),
  ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";
```

`DROP DEFAULT` before the type change is required — Postgres cannot cast the
existing `'user'::text` default in place. **Run
`SELECT DISTINCT role FROM
"users";` first**: `lower(btrim(...))` rescues
`'Admin'`, but `'administrator'` silently becomes `USER`, and the whole premise
of this finding is that someone may have typed exactly that.

**Ship the migration one deploy ahead of the code.** Both orderings fail closed
here, so the worst case at any instant is "an admin gets a 403 for a few
minutes". The real hazard would be a concurrent writer sending text to the enum
column — there is none today, which is exactly why this migration is cheap now
and would not be once an admin UI exists.

Follow-ups worth doing at the same time: add a self-delete guard; expose
`disabled` as the reversible action operators actually want; decide what user
deletion should do with revisions authored on _other people's_ documents rather
than cascading them away; delete the dead `createUser`.

---

## 13. Two AI routes take unvalidated bodies — and there is no rate limit anywhere

**Was §5a — CONFIRMED as fact, CORRECTED as impact.**

`api/completion/route.ts:19-20` and `api/copilot/route.ts:72-85` still do a bare
`await req.json()`. Both are `userRoute`, and neither was touched by the
validation refactor.

**The stated impact was wrong in the safe direction.** `model` is _already_
allowlisted — both routes call `getModelById` against a fixed 7-element
`AI_MODELS` and 404 on a miss, then pass the _looked-up_ value, never the raw
string. `provider` is a closed 4-arm switch whose every key and base URL comes
from `process.env`. A caller cannot name an arbitrary model, reach an arbitrary
endpoint, or steer a credential. (This also closes the Azure path-injection
angle — the model is interpolated into a URL path, but only ever one of seven
constants.)

**The real exposure is different, and Zod alone does not fix it:**

1. `tone` is interpolated **raw into the system prompt** (`prompts.ts:28-30`),
   so with `option: "tone"` a caller supplies an arbitrary, unbounded system
   message. `documentTitle` and `currentPath` are the same shape in the copilot
   agent prompt.
2. **No rate limit exists anywhere in the codebase.** The only `throttle` is a
   UI helper. `bodySizeLimit: "2mb"` is Server-Actions-only.
3. `copilot:111` sets `stopWhen: stepCountIs(40)` — up to 40 model round-trips
   per HTTP request.
4. Registration is open, so "authenticated" is one OAuth sign-in away from
   anonymous.

Composed: **any person who signs in has an unmetered general-purpose LLM proxy
with an attacker-authored system prompt, billed to the deployment's credits.**

**A hole in the ESLint scheme, worth its own line.** `eslint.config.mjs:117-118`
pins the selector to `[callee.object.name='request']`. Both AI routes name their
parameter `req`, so the rule does not fire — and they are not in the `ignores`
list. They are exempt **by naming**, not by design. That defeats the stated
purpose of the block, which is to make the mistake unavailable rather than
discouraged.

Minor real bug: both routes call `createProvider(provider)(model.id)` using the
caller's `provider` with an independently resolved model, so
`{provider: "ollama", model: "claude-opus-4-8"}` is accepted and dispatches an
Anthropic id at the Ollama endpoint. `providers.ts:157-160` already exports the
correct `getModelInstance`, unused by either route.

**Corrected inventory.** The "21 routes" figure is exact — 21 files, 22 call
sites. Five body-reading routes remain uncovered: the two AI routes, plus three
`formData()` routes (`attachments` has a 10MB cap but no MIME check;
`background` has a client-supplied MIME check, no size cap, and is **dead code
behind an unconditional 400**; `import` is properly guarded).

### How to address

A shared `src/app/api/ai/schemas.ts` with `model` as a `z.enum` over
`AI_MODELS`, `tone` as an enum (**this is the load-bearing part** — it is a
system-prompt segment, not user content), caps on every free-text field, and
`provider` **dropped rather than validated**, since the model already names its
provider:

```ts
const modelId = z.enum(AI_MODELS.map((m) => m.id) as [string, ...string[]]);
const promptText = z.string().max(20_000);

export const completionSchema = z.object({
  model: modelId,
  option: z.enum([
    "improve",
    "continue",
    "shorter",
    "longer",
    "zap",
    "summarize",
    "tone",
  ]),
  prompt: promptText,
  command: promptText.optional(),
  tone: z.enum([
    "professional",
    "casual",
    "straightforward",
    "confident",
    "friendly",
  ]).optional(),
}).strict();
```

Switch both routes to `parseBody` and `getModelInstance`, and **rename the
parameter `req` → `request`** — not cosmetic, it is what brings the files under
the lint rule. Then fix the selector so the guarantee does not depend on a name:

```diff
-  "AwaitExpression > CallExpression[callee.property.name='json'][callee.object.name='request']",
+  "AwaitExpression > CallExpression[callee.property.name='json']",
```

(`parseBody`'s own `request.json()` is unaffected — `src/lib/**` is outside the
block's `files` glob.)

**None of that addresses the missing rate limit**, which is the actual exposure.
Minimum viable: a per-user token bucket in front of both routes. On an
open-registration deployment `/api/copilot` is the largest uncontrolled cost in
the application.

Also delete the dead `background` route, in the same spirit as §17.

---

## 14. Coauthors: any authenticated user can mint `User` rows

**Was §5b — CONFIRMED as a defect, but the premise and the recommendation were
both wrong.**

`documents/route.ts:104-133` feeds user-supplied emails to a nested
`connectOrCreate` on `User`. **A second copy the draft missed:**
`documents/[id]/route.ts:83-115` does the same inside an `upsert`. Any fix must
touch both. Two pieces of dead code sit in the POST block — a `as string[]` cast
and a hand-rolled email regex, both unreachable behind
`z.array(z.string().email())`.

**REFUTED — "a write path with no read".** `findDocument` really does hardcode
`coauthors: []`, but `series.ts:64-67` reads the real rows, and the **public**
series queries surface them at `:120-123`. Any post in a series has a live
coauthor read path, unauthenticated for a published series. The draft's basis
for "drop the block entirely" is false on the facts.

**REFUTED — "poisons the OAuth sign-in path".**
`allowDangerousEmailAccountLinking:
true` is set on both providers
(`auth.ts:42`, `:52`). In NextAuth v4 that flag governs exactly this case: the
new `Account` is **linked** to the existing `User` by verified email. No
`OAuthAccountNotLinked`, and no duplicate is possible since `email` is unique.
The lockout is _latent_ — it would materialise only if that flag were removed,
which is a plausible future hardening pass.

**No privilege escalation either.** `access.ts:41-47` consults coauthors for
`write`/`read`, but `requireDocument` fetches through `findDocument`, so
`doc.coauthors` is always `[]` there. A minted row grants access to nothing.

What the squat actually yields: silent account pre-registration (the victim's
first sign-in adopts the attacker's row, which `auth.ts:92-107` then backfills
into something indistinguishable from legitimate); an **email → profile oracle**
via the public series read, which converts an address into a name, handle and
image; and unbounded row creation with no rate limit and manual-only cleanup.
Low-to-moderate and mostly latent — but "any authenticated user can INSERT into
the user table" is worth removing on principle.

### How to address

**Harden, do not delete.** The feature is fully modelled, typed, gated
(`capabilities.ts:44`), surfaced in four UI components, and carries a deliberate
`access.ts` branch. The defect is one nested `connectOrCreate`, separable in
about six lines. Coauthoring is a link between _existing_ accounts:

```diff
     input.coauthors = {
       connectOrCreate: userEmails.map((userEmail) => ({
         where: { documentId_userEmail: { documentId, userEmail } },
-        create: { user: { connectOrCreate: {
-          where: { email: userEmail },
-          create: { name: userEmail.split("@")[0], email: userEmail } } } },
+        create: { user: { connect: { email: userEmail } } },
       })),
     };
```

with an existence pre-check above it that 400s on an unknown address —
**deliberately without naming which one**, or the response becomes an oracle for
"does this email have an account here?". Bound the array (`.max(20)`), delete
the dead regex and cast, and factor the two now-identical blocks into one
helper. Two copies of an authorization-adjacent write is the shape that produced
§9.

**Then, separately, close the read.** Since the feature stays, `findDocument`'s
hardcoded `coauthors: []` is the actual bug from a user's point of view — you
set coauthors and they vanish. Adding the include that `series.ts` already uses
makes the `access.ts` branch live. **Ordering matters: `connect`-only first, the
read second, never the reverse** — otherwise minting a `User` row and granting
it write access become the same request.

---

# Part 4 — Code quality

## 15. Redux rejection boilerplate

**Was §10 — the duplication is real, the proposed fix is NOT SAFE.**

23 `.rejected` cases in `src/store/app.ts:333-534` (not ~25), of which 21 are
the plain shape. `builder.addMatcher(isRejected, …)` would break three ways:

1. **Two cases do extra work.** `loadPosts.rejected:333` resets
   `ui.postsLoading` — dropping it strands the posts list in its loading
   skeleton forever. `alert.rejected:430` shifts `ui.alerts` — dropping it
   leaves the alert dialog permanently open. (No optimistic rollback exists
   anywhere; all three move thunks carry an explicit "no rollback by design"
   comment.)
2. **It over-matches 12 thunks.** Four are 404-is-normal (`getPost`,
   `getPostById`, `getPostChildren`, `getPostThumbnail`) — and
   `TabbedDocumentEditor.tsx:87-88` already normalises those to `undefined`/`[]`
   by hand, so a matcher would toast on a path whose author went out of their
   way to silence it. Four more (export/import) are already rendered inline by
   `useExportImportActions`, so a matcher double-reports.
3. **The decisive one.** `isRejected` also matches payload-less rejections,
   pushing `{ message: undefined }`. `Announcer.tsx:38` early-returns `null` on
   that, so no `<Snackbar>` mounts, so `onClose` never fires — and
   `clearAnnouncement` is dispatched from nowhere else. **One payload-less
   rejection parks a non-renderable entry at the head of the queue permanently
   and silently suppresses every error toast for the rest of the session.** The
   error channel dies quietly, with the symptom far from the cause.

### How to address

`isRejectedWithValue` with an **explicit thunk list** — a behaviour-preserving
refactor: exactly the 21 plain cases keep announcing, the two special cases keep
their cleanup, nothing new starts announcing. `createApiThunk` always goes
through `rejectWithValue`, so no coverage is lost, and `action.payload` types as
`Failure` with no cast, removing the `payload as Failure` assertion that
currently hides the `undefined` case.

Delete the 21 plain cases, reduce the two special ones to cleanup-only, and
append the matcher **last in the chain** — RTK runs the matching `addCase` first
and then every matching matcher (both execute), which is exactly what lets the
two keep their cleanup, and the builder's types require all `addCase` calls to
precede the first `addMatcher`.

Document the omissions in the comment, since the list is now load-bearing: the
four 404-is-normal lookups and the four export/import thunks are left out on
purpose.

One honest weakness, worth noting against this codebase's own philosophy: an
allow-list means **a newly added thunk silently gets no alert**. The fail-loud
inversion is a `SILENT_REJECTIONS` deny-set. That variant newly announces
`load`, `loadSession`, `getStorageUsage` and `mergePostsIntoTabs` — three are
improvements (`mergePostsIntoTabs` is a destructive user-initiated operation
that currently fails with no feedback at all), and `loadSession` should probably
join the silent set. Treat it as a follow-up, not part of the mechanical
refactor.

---

## 16. Swallowed exceptions

**Was §11 — CORRECTED. Thirteen, not thirty-nine.**

The "39" summed three different classes. The actual counts: **13 comment-only
`catch` blocks** (zero are literally `catch {}` — every one carries an
explanation), ~10 `.catch(() => {})`, and ~16 return-only bodies that are mostly
intentional predicates.

Two flagged areas came back **clean**: `src/indexeddb/` has no swallowed errors
at all, and `useSave.ts:152` is a model of correct handling — transient errors
to a backoff retry, everything else to an error status plus an announcement.

**The structural insight: §15 and §16 intersect.** Most swallowed catches sit on
`.unwrap()` of a thunk that _already has_ a `.rejected` case, so the reducer
announced a generic snackbar before `.unwrap()` rethrew into the empty catch —
noisy, not silent. The genuinely dangerous ones are precisely those on the four
thunks with **no** `.rejected` case, plus raw fetch and IndexedDB paths that
never touch Redux. Nothing announces there, so the swallow is total.

**Eight real bugs, worst first:**

- **`useAttachmentContent.ts:178`** — save succeeds, IndexedDB cache
  invalidation fails and is discarded, reopening renders the **pre-edit
  content**. The user sees a confirmed save and then their edit gone, which
  reads as server-side data loss. It is not: only the local cache is stale. The
  most expensive kind of bug, because the user re-does work that was never lost.
- **`TabbedDocumentEditor.tsx:87-88`** — a 5-tab post opens titled `"Document"`
  with every tab but the first missing and no error at all. Verified as display
  only — nothing here writes — but indistinguishable from deletion.
- **`usePostLoader.ts:63`** — a transient failure collapses into "not found" and
  flows into a branch that **writes**, attempting to create a new notes post.
  `Document.handle` is unique, so the database rejects it and the user gets
  "Failed to Create Notes" for what was a read failure. (Unsettled: whether the
  IndexedDB backend enforces the same uniqueness — if not, a guest gets a second
  notes document shadowing the real one.)
- **`Download.tsx:38`** — a backup silently omits unreadable revisions;
  discovered only on restore.
- `ViewDocument.tsx:88` (same as the second, on the **public** reader page),
  `BacklinksSection.tsx:32` (failed request renders as "no backlinks"),
  `localImporter.ts:63` (import reports zero warnings while dropping series),
  `api/utils.ts:98` (runtime embed outage indistinguishable from the expected
  build-time one; the _outer_ catch logs, this one does not).

`src/api/client.ts:85/121` — the one the draft called legitimate — is indeed
safe: it still throws, losing only the server's specific message. A
`console.warn` is still warranted.

### How to address

For each of the eight, the fix is the same shape: distinguish the failure from
the benign outcome it currently impersonates. Use `Promise.allSettled` where two
outcomes were collapsed, render an error state rather than an empty one, record
what was omitted rather than dropping it silently, and never let a read failure
reach a write branch.

`usePostLoader.ts:63` is the one worth doing carefully: `getPost` already
distinguishes a true miss (`fail("post not found")`) from a transport error, so
match on the rejected action instead of catching. Comparing on the literal
string is fragile — better is a `code` discriminator on `Failure`, a small
change to `createApiThunk` that pays off anywhere else this distinction is
needed.

**On preventing recurrence.** Every one of the 13 carries an explanation, so the
authors were deliberate. The failure mode is that a _correct_ judgement ("the
thunk announces this") silently decays when the reducer changes — and §15's
allow-list makes that decay easier, since dropping a thunk from the list
falsifies comments 500 lines away. Two cheap guards, in the spirit of the
`publicRoute` convention: a `no-empty` rule with `allowEmptyCatch: false`
forcing every catch to log or carry an explicit marker, and a
`no-restricted-syntax` ban on the bare `.catch(() => {})` shape.

---

## 17. A dead public stub weakens the security inventory

**Was §7 — CONFIRMED, and the recommendation is stronger than stated.**

`GET /api/documents/[id]/status` is `publicRoute` and returns
`{ message: "Status endpoint reached", id }`. It reads nothing, so it is not a
leak — but the codebase stakes its review process on
`grep -rn "publicRoute" src/app/api` being the complete and _meaningful_ list of
unauthenticated surfaces, and a stub in that list costs a reviewer time on every
audit.

**Definitively dead.** No `/status` URL string anywhere; `src/api/client.ts` has
no `status` method; nothing in `mcp/` or `scripts/`; no rewrites or route
manifest; and a history-wide pickaxe (`git log --all -S'/status'`) returns
**zero commits** — with a control search for `}/move` correctly returning three,
so the search works. It was born as a placeholder in `ec70ddbf` (2025-09-09) and
has been _maintained_ for ten months and _called_ never. The two most recent
commits touching it added auth declarations and a Zod schema to unreachable
code.

**Correction:** the file's `PATCH` is dead too. It is a complete, correctly
authorized, now Zod-validated duplicate of what `PATCH /api/documents/[id]`
already does — and it has already drifted, silently dropping the `updatedAt` the
original set.

### How to address

```bash
git rm -r "src/app/api/documents/[id]/status"
```

Nothing imports it; no client method, doc or test references it. That removes
one entry from the `publicRoute` inventory _and_ deletes a divergent second
write path for `status` before someone finds it and wires it up. Afterwards,
re-read `grep -rn "publicRoute" src/app/api` and confirm the remaining five are
all genuine — that is the invariant this finding protects, and it is worth two
minutes to bank.

---

# Cross-cutting: the app sets no security headers at all

Noted in passing by three of the findings above, and worth stating once.
`next.config.ts:214-227` has a single `headers()` entry, a woff2 CORS rule.
There is **no CSP, no `X-Content-Type-Options`, no `X-Frame-Options`, no
`Referrer-Policy`, no HSTS.** `src/middleware.ts` is a no-op whose matcher
excludes `/api` anyway. And there is **no rate limiting anywhere in the
codebase** — which §13 (LLM proxy), §3 (JSDOM-per-request compute sink) and §14
(unbounded row creation) each independently depend on.

---

# Suggested order

**Now — under a day, and nearly all the risk reduction:**

1. **§2** — move `ATTACHMENTS_DIR` out of `public/`. One constant; closes a live
   unauthenticated read and a stored-XSS bypass.
2. **§1** — the `published` check on `/view`, `/embed`, `/pdf`, `/docx`. Confirm
   the draft-sharing question first.
3. **§7** — `"Post"` → `"Document"`. One word; `GET /api/usage` is broken today.
4. **§3 Tier 0** — `KanbanNode.exportDOM` via `createElement`/`textContent`, and
   sanitize the Graph/Sketch SVG. Then Tier 1's four response headers.
5. **§17** — `git rm` the status route. One command, zero risk.

**Next:**

6. **§8** — make `deleteRevision` repoint `head`. The root cause behind §10, and
   it fixes the undeletable-post case.
7. **§4**, **§5** — the profile and listing leaks. §5's email split is the one
   change in this review with no visible output change at all.
8. **§9** — `src/lib/visibility.ts`, three exports. Retroactively closes §1 and
   §4 and prevents the next instance; honour the four do-not-touch queries.
9. **§6** — the `findSeriesById` read on `/posts`.

**Then, in rough order of value:**

10. **§13** — the AI schemas _and_ the ESLint selector fix; separately, a rate
    limit, which is the actual exposure.
11. **§12** — `requireAdmin` in `access.ts` plus the `UserRole` enum, migration
    one deploy ahead.
12. **§10** — make both finders pure (safe once §8 lands), keep the fallback,
    add `documentExists`.
13. **§14** — `connect`-only coauthors, then the read, in that order.
14. **§11 Tier 2** — the `Attachment` table, before any object-storage move.
15. **§15**, **§16** — the matcher refactor and the eight swallowed catches.
16. The cross-cutting header and rate-limit work.
