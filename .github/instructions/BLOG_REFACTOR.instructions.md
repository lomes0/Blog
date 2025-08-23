---
applyTo: '**'
---
# BETTER_REFACTOR

## Overview
This document outlines a comprehensive yet conservative refactor plan to transform the project from a complex document/domain-based structure into a simple blog website. The approach prioritizes **minimal disruption** while achieving the goal of simplification.

## Core Principles

1. ✅ **Keep Main Components**: Preserve Lexical editor and revision system
2. ✅ **Maintain UI Patterns**: Keep cards, grids, sidebar, and navigation structure  
3. ✅ **Preserve Routes**: Keep existing URL patterns, change underlying data
4. ✅ **Gradual Migration**: Implement in phases to minimize risk
5. ✅ **User Experience**: Maintain familiar interface during transition

## Current State Analysis

### What We Have
- **Sophisticated Lexical Editor**: Rich text with tables, math, graphs, images
- **Complex Data Model**: Documents → Domains → Directories hierarchy
- **Revision System**: Full history with diff capabilities
- **Component Architecture**: Well-structured cards, grids, actions
- **Route Structure**: `/edit/`, `/view/`, `/new/`, `/domains/`, `/dashboard/`

### What We Want
- **Simple Blog Structure**: Posts + Series (for multi-part content)
- **Clean Data Model**: Remove domains/directories complexity
- **Same UI Experience**: Keep familiar interface patterns
- **Enhanced Content**: Focus on blog posts and series

---

## Phase 1: Backend Foundation (Week 1)

### 1.1 Repository Layer Transformation (Days 1-2)

#### Create Post Repository
```bash
# Copy and transform document repository
cp src/repositories/document.ts src/repositories/post.ts
```

#### Update `src/repositories/post.ts`
```typescript
// Transform all functions:
findUserDocument → findUserPost
findDocumentsByAuthorId → findPostsByAuthorId  
findPublishedDocuments → findPublishedPosts
createDocument → createPost
updateDocument → updatePost
deleteDocument → deletePost

// Remove domain/directory logic:
- Remove all domain filtering
- Remove directory hierarchy logic
- Remove coauthor complexity
- Simplify to author + published posts only
```

#### Create Series Repository  
```typescript
// New file: src/repositories/series.ts
export async function findAllSeries()
export async function findSeriesById(id: string)
export async function findSeriesByAuthorId(authorId: string)
export async function createSeries(data: SeriesCreateInput)
export async function updateSeries(id: string, data: SeriesUpdateInput)
export async function deleteSeries(id: string)
export async function addPostToSeries(seriesId: string, postId: string, order: number)
export async function removePostFromSeries(postId: string)
```

#### Keep Revision Repository
```typescript
// src/repositories/revision.ts - Minor updates only:
- Change documentId references to postId
- Keep all existing functionality intact
```

### 1.2 API Endpoints Transformation (Days 3-4)

#### Update Document APIs (Keep URLs)
```typescript
// src/app/api/documents/route.ts
// Keep same endpoint URLs, change internal logic:
GET /api/documents → returns posts (not documents)
POST /api/documents → creates posts (not documents)

// src/app/api/documents/[id]/route.ts  
GET /api/documents/[id] → returns post data
PATCH /api/documents/[id] → updates post
DELETE /api/documents/[id] → deletes post
```

#### Create Series APIs
```typescript
// New files:
src/app/api/series/route.ts
src/app/api/series/[id]/route.ts
src/app/api/series/[id]/posts/route.ts

// Endpoints:
GET /api/series → list all series
POST /api/series → create series
GET /api/series/[id] → get series details
PATCH /api/series/[id] → update series
DELETE /api/series/[id] → delete series
GET /api/series/[id]/posts → get posts in series
POST /api/series/[id]/posts → add post to series
```

#### Remove Domain APIs
```bash
# Delete these files:
rm -rf src/app/api/domains/
```

### 1.3 Type System Updates (Day 5)

#### Update Core Types (`src/types.ts`)
```typescript
// Add new types:
export interface Series {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  posts: Post[];
}

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

// Transform existing types:
Document → Post (rename and simplify)
DocumentRevision → PostRevision
EditorDocument → EditorPost
UserDocument → UserPost

// Keep compatibility aliases temporarily:
export type Document = Post; // TODO: Remove after migration
export type UserDocument = UserPost; // TODO: Remove after migration

// Remove these types:
- Domain
- Directory  
- DocumentType enum (no more directories)
- All domain/directory related interfaces
```

#### Update API Response Types
```typescript
// Update all API response types:
GetDocumentsResponse → GetPostsResponse
PostDocumentsResponse → PostPostsResponse
GetDocumentResponse → GetPostResponse
// etc.

// Add new series response types:
GetSeriesResponse, PostSeriesResponse, etc.
```

---

## Phase 2: Component Layer (Week 2, Days 1-2)

### 2.1 Component Updates (Minimal Changes)

#### Update Existing Components
```typescript
// src/components/DocumentCard/ → keep name, update internally
// Changes: Use Post types instead of Document types
// UI: Same appearance, different data source

// src/components/Home/Documents.tsx → keep same UI
// Changes: Load posts instead of documents
// UI: Same grid layout, same cards

// src/components/Dashboard.tsx → keep same layout  
// Changes: Show user posts instead of user documents
```

#### Remove Domain Components
```bash
# Delete these directories:
rm -rf src/components/Domain/
rm -rf src/components/DomainCard/
rm -rf src/components/DomainGrid/
rm -rf src/components/DirectoryView.tsx
rm -rf src/components/NewDirectory.tsx
rm -rf src/components/DirectoryNotInDomainMessage.tsx
rm -rf src/components/DocumentNotInDomainMessage.tsx
```

#### Create Series Components
```typescript
// New components:
src/components/SeriesCard/index.tsx
src/components/SeriesGrid/index.tsx  
src/components/SeriesList/index.tsx
src/components/SeriesView/index.tsx

// Similar patterns to existing DocumentCard/DocumentGrid
// Show series title, post count, creation date
// Link to series detail pages
```

### 2.2 Component Props Updates
```typescript
// Update component interfaces:
interface DocumentCardProps → interface PostCardProps
interface DocumentGridProps → interface PostGridProps

// Keep same visual structure:
- Same card layouts
- Same grid arrangements  
- Same action buttons
- Same loading states
```

---

## Phase 3: Navigation & Routes (Week 2, Days 3-4)

### 3.1 Keep Existing Routes (Change Backend Only)

#### Home & Dashboard Routes
```typescript
// src/app/(appLayout)/page.tsx
// Keep same UI, load posts instead of documents
const publishedPosts = await findPublishedPosts(12);

// src/app/(appLayout)/dashboard/page.tsx  
// Keep same UI, load user posts instead of user documents
const userPosts = await findPostsByAuthorId(user.id);
```

#### Editor Routes (No Changes)
```typescript
// src/app/(appLayout)/new/[[...id]]/page.tsx
// Keep exact same UI and functionality
// Backend: Save as posts instead of documents

// src/app/(appLayout)/edit/[id]/page.tsx
// Keep exact same editor interface
// Backend: Load posts instead of documents

// src/app/(appLayout)/view/[id]/page.tsx  
// Keep exact same viewer interface
// Backend: Load posts instead of documents
```

#### Browse Route
```typescript
// src/app/(appLayout)/browse/page.tsx
// Keep same filtering/sorting UI
// Backend: Browse posts instead of documents
```

### 3.2 Remove Domain Routes
```bash
# Delete these directories:
rm -rf src/app/(appLayout)/domains/
rm -rf src/app/(appLayout)/new-directory/
```

### 3.3 Add Series Routes
```typescript
// New routes:
src/app/(appLayout)/series/page.tsx → list all series
src/app/(appLayout)/series/[id]/page.tsx → view series details
src/app/(appLayout)/series/new/page.tsx → create new series
src/app/(appLayout)/series/[id]/edit/page.tsx → edit series
```

---

## Phase 4: Editor Integration (No Changes)

### 4.1 Lexical Editor (✅ Keep Unchanged)
```typescript
// src/editor/ → NO CHANGES REQUIRED
// All editor plugins remain exactly the same
// All formatting tools remain the same
// All node types remain the same
```

### 4.2 Revision System (✅ Minimal Changes)
```typescript
// src/repositories/revision.ts
// Only change: documentId → postId references
// Keep all functionality:
- Full revision history
- Diff capabilities  
- Revision creation
- Revision comparison
```

### 4.3 Editor Commands (✅ No Changes)
```typescript
// src/editor/commands/
// All commands remain unchanged
// All editor functionality preserved
```

---

## Phase 5: Store & State Management (Week 2, Day 5)

### 5.1 Redux Store Updates
```typescript
// src/store/slices/
// Update state shape:
interface AppState {
  user?: User;
  posts: UserPost[]; // was documents
  series: Series[]; // new
  ui: { /* same */ };
}

// Update action names:
fetchDocuments → fetchPosts
createDocument → createPost
updateDocument → updatePost
// etc.
```

### 5.2 Hook Updates
```typescript
// Update hooks to use new action names
// Keep same functionality patterns
// Update type annotations
```

---

## Implementation Schedule

### Week 1: Backend Foundation
- **Monday**: Repository transformation (document.ts → post.ts)
- **Tuesday**: Create series repository and basic APIs
- **Wednesday**: Update document APIs to work with posts  
- **Thursday**: Create series APIs
- **Friday**: Update type system and test backend

### Week 2: Frontend Integration
- **Monday**: Update components to use new types
- **Tuesday**: Remove domain components, add series components
- **Wednesday**: Update routes and navigation
- **Thursday**: Update store and state management
- **Friday**: Testing, bug fixes, and refinement

---

## Testing Strategy

### Phase Testing
1. **Backend Testing**: Test all repositories and APIs independently
2. **Component Testing**: Test each updated component in isolation
3. **Integration Testing**: Test full user flows
4. **Regression Testing**: Ensure no existing functionality is broken

### User Acceptance Criteria
- ✅ All existing editor functionality works
- ✅ All revision history is preserved  
- ✅ UI looks and feels the same
- ✅ All user content is preserved
- ✅ New series functionality works
- ✅ Performance is maintained

---

## Rollback Plan

### If Issues Arise
1. **Database**: Keep old tables during migration period
2. **API**: Feature flags to switch between old/new endpoints
3. **Frontend**: Git branches for easy rollback
4. **Data**: Full backup before starting migration

### Risk Mitigation
- **Small Increments**: Each phase can be deployed independently
- **Feature Flags**: Toggle new functionality on/off
- **Monitoring**: Track errors and performance
- **User Feedback**: Gather feedback at each phase

---

## Success Metrics

### Technical Metrics
- [ ] Reduced codebase complexity (fewer files, simpler logic)
- [ ] Maintained performance (no regression in load times)
- [ ] Test coverage maintained or improved
- [ ] No data loss during migration

### User Experience Metrics  
- [ ] No disruption to daily workflows
- [ ] Same editor experience and capabilities
- [ ] Preserved revision history and diff functionality
- [ ] Intuitive series functionality

---

## Post-Migration Cleanup

### After Successful Migration
1. **Remove Compatibility Types**: Delete Document aliases
2. **Update Documentation**: Reflect new post/series model
3. **Optimize Database**: Remove unused domain/directory tables
4. **Clean Dependencies**: Remove domain-related packages
5. **Update Tests**: Ensure all tests use new terminology

---

## Future Enhancements (Post-Refactor)

### Potential Blog Features
- **Categories/Tags**: Add to posts for better organization
- **Featured Posts**: Highlight important content
- **Comments**: Add commenting system
- **SEO**: Optimize for search engines
- **RSS Feeds**: Generate feeds for series and posts
- **Social Sharing**: Add sharing capabilities

This plan ensures a smooth transition from complex document management to a clean, simple blog system while preserving all the sophisticated editor capabilities and user experience that make the application valuable.
