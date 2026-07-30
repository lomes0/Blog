# Documentation

Reference guides for developing and maintaining this blog platform.

---

## Guides

| File                                                     | Description                                               |
| -------------------------------------------------------- | --------------------------------------------------------- |
| [guides/hydration.md](./guides/hydration.md)             | Diagnosing and fixing React hydration errors              |
| [guides/date-formatting.md](./guides/date-formatting.md) | Consistent date rendering to prevent hydration mismatches |
| [guides/nextauth-ssr.md](./guides/nextauth-ssr.md)       | Session handling in server components with NextAuth       |
| [guides/const-tdz.md](./guides/const-tdz.md)             | `const` TDZ ReferenceError: cause, diagnosis, and fix     |
| [guides/notes-indexeddb-origins.md](./guides/notes-indexeddb-origins.md) | Why notes "vanish" between `dev` and `start`: IndexedDB is per-origin |

## Architecture

| File                                                       | Description                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [architecture/overview.md](./architecture/overview.md)     | Layered architecture, rules per layer, naming conventions, and new-feature checklist |
| [architecture/api-client.md](./architecture/api-client.md) | `apiClient` contract, error handling, and how to add new API routes                  |
