---
applyTo: '**'
---
# Phase 1 Remaining Tasks - Blog Refactor

## Overview

This document outlines the remaining tasks to complete Phase 1 of the blog refactor. Based on current analysis, Phase 1 is approximately 70% complete. The following tasks need to be finished before proceeding to Phase 2.

## Current Status Summary

### ✅ Completed
- **Phase 1.1**: Repository Layer Transformation (Complete)
- **Phase 1.2**: State Management Updates (Complete)  
- **Partial Phase 1.2**: Basic Posts and Series APIs created

### ❌ Remaining Tasks
- **Phase 1.2**: Complete API Endpoints Transformation
- **Phase 1.3**: Type System Updates (Not Started)
- **Phase 1.4**: Domain API Removal
- **Phase 1.5**: Testing and Validation

---

## Task 1: Complete API Endpoints Transformation

### 1.1 Update Document APIs to Return Posts (Priority: HIGH)

**Files to Update:**
- `/src/app/api/documents/route.ts`
- `/src/app/api/documents/[id]/route.ts`

**Current Issue:** Document APIs still return documents with domain filtering. Need to change internal logic to return posts only (DocumentType.DOCUMENT).

#### Update `/src/app/api/documents/route.ts`

**Changes Required:**
1. Import post repository functions instead of document functions
2. Change `findDocumentsByAuthorId` → `findPostsByAuthorId`
3. Change `findPublishedDocuments` → `findPublishedPosts`
4. Update response types to reflect post data
5. Remove domain filtering logic

**Implementation:**
```typescript
// Replace imports:
import {
  findPostsByAuthorId,     // was findDocumentsByAuthorId
  findPublishedPosts,      // was findPublishedDocuments
  createPost,              // was createDocument
} from "@/repositories/post";

// Update GET handler logic:
- Remove domain parameter filtering
- Use findPostsByAuthorId instead of findDocumentsByAuthorId
- Use findPublishedPosts instead of findPublishedDocuments

// Update POST handler logic:
- Use createPost instead of createDocument
- Remove domain/directory logic
- Ensure DocumentType.DOCUMENT is set
```

#### Update `/src/app/api/documents/[id]/route.ts`

**Changes Required:**
1. Import post repository functions
2. Change `findUserDocument` → `findUserPost`
3. Change `updateDocument` → `updatePost`
4. Change `deleteDocument` → `deletePost`
5. Remove domain/directory logic

**Implementation:**
```typescript
// Replace imports:
import {
  findUserPost,      // was findUserDocument
  updatePost,        // was updateDocument
  deletePost,        // was deleteDocument
} from "@/repositories/post";

// Update handlers:
- Use findUserPost instead of findUserDocument
- Use updatePost instead of updateDocument  
- Use deletePost instead of deleteDocument
- Remove domain validation logic
```

### 1.2 Complete Series APIs (Priority: MEDIUM)

**Missing Endpoint:** `/src/app/api/series/[id]/posts/route.ts`

**Create New File:** `/src/app/api/series/[id]/posts/route.ts`
```typescript
// Endpoints needed:
// GET /api/series/[id]/posts → get posts in series (ordered by seriesOrder)
// POST /api/series/[id]/posts → add post to series

import { authOptions } from "@/lib/auth";
import { addPostToSeries, findSeriesById } from "@/repositories/series";
import { findUserPost } from "@/repositories/post";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Return posts in series ordered by seriesOrder
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Add post to series with order
}
```

---

## Task 2: Type System Updates (Priority: HIGH)

### 2.1 Update Core Types in `/src/types.ts`

**Current Issue:** Post and Series types exist but need to replace Document types properly.

#### Add Missing Types
```typescript
// Add these new types to /src/types.ts:

export interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  published: boolean;
  authorId: string;
  author: User;
  seriesId?: string | null;
  series?: Series | null;
  seriesOrder?: number | null;
  revisions: PostRevision[];
}

export interface Series {
  id: string;
  title: string;
  description?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorId: string;
  author: User;
  posts: Post[];
}

// Transform existing types:
export type PostRevision = DocumentRevision; // Rename
export type EditorPost = EditorDocument;     // Rename
export type UserPost = UserDocument;         // Rename
```

#### Add Compatibility Aliases (Temporary)
```typescript
// Add these temporary aliases for backward compatibility:
export type Document = Post; // TODO: Remove after migration
export type UserDocument = UserPost; // TODO: Remove after migration

// Mark deprecated types for removal:
/** @deprecated Use Post instead */
export type DocumentType = {
  DOCUMENT: 'DOCUMENT';
  DIRECTORY: 'DIRECTORY';
};
```

### 2.2 Update API Response Types

**Add New Response Types:**
```typescript
// Replace existing document response types:
export interface GetPostsResponse {
  data?: UserPost[];
  error?: { title: string; subtitle?: string };
}

export interface PostPostsResponse {
  data?: UserPost;
  error?: { title: string; subtitle?: string };
}

export interface GetPostResponse {
  data?: UserPost;
  error?: { title: string; subtitle?: string };
}

// Add series response types:
export interface GetSeriesResponse {
  data?: Series[];
  error?: { title: string; subtitle?: string };
}

export interface PostSeriesResponse {
  data?: Series;
  error?: { title: string; subtitle?: string };
}

// Update input types:
export interface PostCreateInput {
  title: string;
  content?: string;
  published?: boolean;
  seriesId?: string;
  seriesOrder?: number;
}

export interface PostUpdateInput {
  title?: string;
  content?: string;
  published?: boolean;
  seriesId?: string;
  seriesOrder?: number;
}
```

---

## Task 3: Remove Domain APIs (Priority: MEDIUM)

### 3.1 Delete Domain API Directory

**Command to Run:**
```bash
rm -rf /src/app/api/domains/
```

**Files to be Removed:**
- `/src/app/api/domains/route.ts`
- `/src/app/api/domains/[id]/route.ts`
- `/src/app/api/domains/[id]/reorder/route.ts`
- `/src/app/api/domains/check-slug/route.ts`

### 3.2 Update References

**Search and Remove Domain References:**
```bash
# Search for remaining domain API calls:
grep -r "api/domains" src/
grep -r "fetchUserDomains" src/
grep -r "Domain" src/types.ts
```

**Files Likely to Need Updates:**
- Components that might call domain APIs
- Store actions that reference domains
- Any remaining imports of domain types

---

## Task 4: Update Repository Functions (Priority: MEDIUM)

### 4.1 Complete Series Repository Implementation

**File:** `/src/repositories/series.ts`

**Current Issue:** Functions are placeholder stubs. Need full implementation.

**Functions to Implement:**
```typescript
// Replace stub implementations with actual database queries:

export async function findAllSeries(): Promise<Series[]> {
  // Implement: return all series with post counts
}

export async function findSeriesById(id: string): Promise<Series | null> {
  // Implement: return series with ordered posts
}

export async function findSeriesByAuthorId(authorId: string): Promise<Series[]> {
  // Implement: return user's series
}

export async function createSeries(data: SeriesCreateInput): Promise<Series> {
  // Implement: create new series
}

export async function updateSeries(id: string, data: SeriesUpdateInput): Promise<Series> {
  // Implement: update series
}

export async function deleteSeries(id: string): Promise<void> {
  // Implement: delete series (remove posts from series first)
}

export async function addPostToSeries(seriesId: string, postId: string, order: number): Promise<void> {
  // Implement: add post to series with order
}

export async function removePostFromSeries(postId: string): Promise<void> {
  // Implement: remove post from series
}
```

### 4.2 Update Revision Repository

**File:** `/src/repositories/revision.ts`

**Changes Required:**
1. Change `documentId` references to `postId`
2. Update function parameters and return types
3. Keep all existing functionality intact

**Functions to Update:**
- `createRevision()` - change documentId to postId
- `findRevisionsByDocumentId()` → `findRevisionsByPostId()`
- Update all Prisma queries to use postId instead of documentId

---

## Task 5: Testing and Validation (Priority: LOW)

### 5.1 API Testing

**Test All Endpoints:**
```bash
# Test posts endpoints:
curl -X GET "http://localhost:3000/api/posts"
curl -X POST "http://localhost:3000/api/posts" -H "Content-Type: application/json" -d '{"title":"Test Post"}'

# Test series endpoints:
curl -X GET "http://localhost:3000/api/series"
curl -X POST "http://localhost:3000/api/series" -H "Content-Type: application/json" -d '{"title":"Test Series"}'

# Test document endpoints (should return posts):
curl -X GET "http://localhost:3000/api/documents"
```

### 5.2 Type Checking

**Run TypeScript Validation:**
```bash
npx tsc --noEmit
```

**Check for Type Errors:**
- Ensure all imports resolve correctly
- Verify no broken type references
- Confirm compatibility aliases work

### 5.3 Database Validation

**Verify Database Operations:**
```bash
# Check that posts are created with correct DocumentType:
# Query: SELECT * FROM Document WHERE type = 'DOCUMENT';

# Verify series operations work:
# Query: SELECT * FROM Series;
```

---

## Task Priority Order

### Day 1: Critical API Updates
1. **Update Document APIs** (Task 1.1) - HIGH PRIORITY
2. **Update Core Types** (Task 2.1) - HIGH PRIORITY

### Day 2: Complete Implementation  
3. **Complete Series Repository** (Task 4.1) - MEDIUM PRIORITY
4. **Create Series Posts API** (Task 1.2) - MEDIUM PRIORITY
5. **Update API Response Types** (Task 2.2) - MEDIUM PRIORITY

### Day 3: Cleanup and Testing
6. **Remove Domain APIs** (Task 3) - MEDIUM PRIORITY
7. **Update Revision Repository** (Task 4.2) - MEDIUM PRIORITY
8. **Testing and Validation** (Task 5) - LOW PRIORITY

---

## Success Criteria

### Phase 1 Complete When:
- ✅ All Document APIs return posts (not documents with domains)
- ✅ Series APIs fully functional with all endpoints
- ✅ Domain APIs completely removed
- ✅ Type system updated with Post/Series types
- ✅ Repository functions fully implemented
- ✅ All tests pass and TypeScript compiles without errors
- ✅ Backward compatibility maintained through aliases

### Ready for Phase 2 When:
- Backend foundation is solid and tested
- All API endpoints work correctly
- Type system is consistent
- No domain-related code remains
- Series functionality is complete

---

## Notes

- **Backward Compatibility**: Use type aliases during transition
- **Database Schema**: No changes needed - using existing Document table with type filtering
- **Testing**: Test each component as implemented
- **Rollback Plan**: Keep domain APIs until Phase 1 is fully validated

This completes the roadmap for finishing Phase 1 of the blog refactor.
