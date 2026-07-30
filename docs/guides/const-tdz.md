# const TDZ (Temporal Dead Zone) ReferenceError

## Summary

A `ReferenceError: Cannot access '...' before initialization` crash in the
editor was traced to a `const` function declared inside a React component body
that was referenced in an earlier `useMemo` within the same function scope.

---

## What is the Temporal Dead Zone?

In JavaScript, `let` and `const` bindings exist in a **Temporal Dead Zone**
(TDZ) from the start of their enclosing scope until the point where the
declaration is evaluated at runtime. Accessing the binding before that point
throws a `ReferenceError`.

```js
// ❌ TDZ error — const is not yet initialised when useMemo runs
const result = useMemo(() => compute(helper), [dep]); // line 10
// ... more code ...
const helper = (x) => x * 2; // line 50
```

This is different from `function` declarations, which are **fully hoisted**
(both name and body) before any code in the scope runs:

```js
// ✅ OK — function declaration is hoisted
const result = useMemo(() => compute(helper), [dep]);
// ...
function helper(x) {
  return x * 2;
}
```

---

## The Specific Bug

**File:** `src/components/EditDocument/Editor.tsx` — since moved to
[EditorTabPanel.tsx](../../src/components/EditDocument/EditorTabPanel.tsx),
where the fix still holds: `ensureValidDocumentData` is a hoisted `function`
declaration used from a `useMemo` above it.

Inside the `DocumentEditor` component, `ensureValidDocumentData` was declared as
a `const` arrow function near the bottom of the component body (~line 171), but
was called inside a `useMemo` near the top (~line 56):

```tsx
// ❌ Before fix — const used before its declaration
const DocumentEditor = () => {
  // ...
  const documentForEditor = useMemo(
    () => (document ? ensureValidDocumentData(document) : undefined),
    [document?.id],
  );

  // ~115 lines later...
  const ensureValidDocumentData = (doc: EditorDocument): EditorDocument => {
    // ...
  };
};
```

In development mode (un-minified), React runs hook callbacks eagerly during
render. When `useMemo` fires before `ensureValidDocumentData`'s declaration has
been evaluated, the TDZ throws:

```
Error: Cannot access 'ensureValidDocumentData' before initialization
    at DocumentEditor.useMemo[documentForEditor]
    src/components/EditDocument/Editor.tsx (56:23)
```

In the production bundle the same error appears as a minified
`ReferenceError: Cannot access 'j' before initialization` inside chunk
`9824.ebe3301a7080d85b.js`.

---

## Why it Wasn't Caught Earlier

- TypeScript does **not** flag TDZ violations — the binding is in scope from a
  type-system perspective, just not yet initialised at runtime.
- The Next.js build (`npm run build`) succeeded without errors because bundlers
  transform module-level code but do not guarantee safe ordering of `const`
  declarations inside function bodies.
- The error only surfaces at runtime when the component mounts.

---

## The Fix

Move `ensureValidDocumentData` **outside the component** as a module-level
`function` declaration. This is safe because the function has no dependencies on
component state, props, or closures.

```tsx
// ✅ After fix — module-level function declaration, fully hoisted
function ensureValidDocumentData(doc: EditorDocument): EditorDocument {
  // ...
}

const DocumentEditor = () => {
  const documentForEditor = useMemo(
    () => (document ? ensureValidDocumentData(document) : undefined),
    [document?.id],
  );
  // ...
};
```

Benefits beyond fixing the TDZ:

- The function is no longer re-created on every render.
- It is independently testable.

---

## General Rule

> Any `const` or `let` helper used in a hook (`useMemo`, `useCallback`,
> `useEffect`, etc.) must be declared **before** that hook call in the function
> body, or extracted to module/file scope as a plain function.

Prefer `function` declarations over `const` arrows for component-internal
helpers that don't close over state, so hoisting prevents accidental TDZ bugs
regardless of code ordering.
