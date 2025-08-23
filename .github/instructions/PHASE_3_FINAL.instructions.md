---
applyTo: '**'
---

# Phase 3 Final Tasks - Blog Refactor Cleanup

## Overview
Phase 3 represents the final cleanup phase of the blog refactor. While the core functionality has been successfully transformed from a complex document/domain structure to a simple blog with posts and series, there are remaining cleanup tasks to complete the migration.

## Current Status Summary

### ✅ Already Completed (85%)
- **Navigation & Routes**: Domain routes removed, series routes implemented
- **Component Layer**: Main components updated to use post/series structure
- **Backend Integration**: All repositories and APIs working with post/series model
- **Core Functionality**: Blog post creation, series management, editing, viewing all functional

### ❌ Remaining Tasks (15%)

---

## Task 1: Clean Up Legacy Types and Code (Priority: HIGH)

### 1.1 Remove Directory/Domain Types from `/src/types.ts`

**Current Issue:** Legacy DocumentType.DIRECTORY and domain-related types still exist

**Files to Update:**
- `/src/types.ts`

#### Remove Legacy Types
```typescript
// Remove these from /src/types.ts:

export enum DocumentType {
  DOCUMENT = "DOCUMENT",
  DIRECTORY = "DIRECTORY", // ← Remove this
}

// Remove these helper functions:
export const isDirectory = (
  document: EditorDocument | Document | null | undefined,
): boolean => {
  return document?.type === DocumentType.DIRECTORY;
};

// Remove this interface:
export interface Directory {
  id: string;
  documentId: string;
  sort_order?: number | null;
}

// Remove directory field from Document type:
export type Document = Omit<EditorDocument, "data"> & {
  // ... other fields
  directory?: { id: string; documentId: string; sort_order?: number | null }; // ← Remove this
};
```

#### Update DocumentType to be Post-Only
```typescript
// Simplify DocumentType enum:
export enum DocumentType {
  DOCUMENT = "DOCUMENT", // Only posts now
}

// Or remove enum entirely and use string literal:
export type DocumentType = "DOCUMENT";
```

### 1.2 Remove Directory References from Components

**Components with Directory References:**
- `src/components/DocumentGrid.tsx`
- `src/components/DocumentURLContext.tsx`
- `src/components/DocumentBrowser/hooks/useBreadcrumbs.ts`
- `src/components/DocumentControls/FilterControl.tsx`
- `src/components/BackgroundImageUploader.tsx`

#### Update DocumentGrid.tsx
```typescript
// Remove directory-related props and logic:
interface DocumentGridProps {
  // Remove:
  currentDirectoryId?: string; // ← Remove this prop
}

// Remove directory-related filtering logic
// Update to only handle DOCUMENT type posts
```

#### Update DocumentURLContext.tsx
```typescript
// Remove directory URL logic:
const generateURL = (docId: string, doc: UserDocument) => {
  // Remove:
  const isDirectory = (doc.local?.type === "DIRECTORY") || 
    (doc.cloud?.type === "DIRECTORY");
  return isDirectory ? `/browse/${docId}` : `/view/${docId}`;
  
  // Replace with:
  return `/view/${docId}`; // All documents are posts now
};
```

#### Update FilterControl.tsx
```typescript
// Remove directory filtering:
const isDirectory = document?.type === DocumentType.DIRECTORY; // ← Remove
const showDirectories = !!(value & (1 << 11)) && !!isDirectory; // ← Remove

// Update to only handle posts
```

---

## Task 2: Database Schema Cleanup (Priority: MEDIUM)

### 2.1 Mark Domain Model for Removal

**File:** `/prisma/schema.prisma`

**Current State:** Domain model still exists with "TODO: Remove" comment

#### Update Domain Model Comment
```prisma
// Simple Domain model for grouping documents by subject
// TODO: Remove after blog migration is complete
model Domain {
  // ... existing model
}
```

#### Update to:
```prisma
// DEPRECATED: Domain model - will be removed in next major version
// Use Series model for organizing blog posts instead
model Domain {
  // ... existing model (keep for data migration safety)
}
```

### 2.2 Clean Up Document Model

**Current Issue:** Document model still has directory-related fields

#### Remove Directory Fields (Future Task)
```prisma
model Document {
  // Remove these fields in future migration:
  // parentId    String?      @db.Uuid // Legacy directory hierarchy
  // type        DocumentType @default(DOCUMENT) // Will always be DOCUMENT
  
  // Keep current fields for backward compatibility during transition
}
```

### 2.3 Remove DocumentType.DIRECTORY

**File:** `/prisma/schema.prisma`

#### Update Enum
```prisma
enum DocumentType {
  DOCUMENT
  DIRECTORY // ← Mark for removal in future migration
}
```

#### Future State (After Data Migration):
```prisma
// Remove enum entirely or simplify to:
enum DocumentType {
  DOCUMENT // Only posts
}
```

---

## Task 3: Store and State Management Cleanup (Priority: MEDIUM)

### 3.1 Update Redux Store State Shape

**File:** `/src/store/app.ts`

**Current Issue:** Store still references document terminology

#### Update State Interface
```typescript
// Update AppState interface:
interface AppState {
  user?: User;
  posts: UserPost[]; // ← Rename from documents
  series: Series[]; // ← Add series state
  ui: {
    // ... existing UI state
  };
}
```

#### Update Action Names
```typescript
// Rename actions:
// fetchDocuments → fetchPosts
// createDocument → createPost
// updateDocument → updatePost
// deleteDocument → deletePost

// Add new actions:
// fetchSeries
// createSeries
// updateSeries
// deleteSeries
```

### 3.2 Clean Up Document-Related Actions

**File:** `/src/store/app/duplicateDocument.ts`

**Update to Post Terminology:**
```typescript
// Rename file to: duplicatePost.ts
// Update all internal references from document to post
```

---

## Task 4: API Cleanup and Optimization (Priority: LOW)

### 4.1 Remove Domain API References

**Search for Remaining References:**
```bash
# Find any remaining domain API calls:
grep -r "api/domains" src/
grep -r "/domains/" src/
```

### 4.2 Optimize Post APIs

**Files to Review:**
- `/src/app/api/documents/route.ts`
- `/src/app/api/documents/[id]/route.ts`

#### Add Post-Specific Optimizations
```typescript
// Add proper indexing for post queries
// Optimize series-related queries
// Remove unnecessary domain filtering logic
```

### 4.3 Complete Series API Implementation

**File:** `/src/app/api/series/[id]/posts/route.ts`

**Ensure Full Implementation:**
```typescript
// Verify all series post management endpoints work:
// - GET /api/series/[id]/posts (get ordered posts)
// - POST /api/series/[id]/posts (add post to series)
// - DELETE /api/series/[id]/posts/[postId] (remove from series)
```

---

## Task 5: Performance and Final Optimizations (Priority: LOW)

### 5.1 Database Query Optimization

#### Add Proper Indexes
```sql
-- Verify these indexes exist:
CREATE INDEX idx_document_type_published ON "Document"(type, published);
CREATE INDEX idx_document_author_type ON "Document"("authorId", type);
CREATE INDEX idx_series_posts_order ON "Document"("seriesId", "seriesOrder");
```

### 5.2 Component Performance

#### Optimize Post Loading
- Implement proper pagination for post lists
- Add lazy loading for series content
- Optimize DocumentGrid for post-only display

### 5.3 Code Splitting

#### Remove Unused Components
```bash
# Verify these components are completely removed:
# - All Domain* components
# - Directory* components
# - Any domain management utilities
```

---

## Task 6: Documentation and Migration Guide (Priority: LOW)

### 6.1 Update README

**File:** `/README.md`

#### Update Project Description
```markdown
# Blog Editor

A modern blog platform with rich text editing capabilities, built with Next.js and Lexical editor.

## Features
- ✅ Rich text blog posts with Lexical editor
- ✅ Series organization for multi-part content
- ✅ Revision history and collaboration
- ✅ Responsive design and mobile support
```

### 6.2 Create Migration Documentation

**Create:** `/docs/MIGRATION_GUIDE.md`

#### Document the Transformation
```markdown
# Migration from Domain Structure to Blog Structure

This document outlines the transformation from the original document/domain 
structure to the simplified blog structure with posts and series.

## What Changed
- Documents → Blog Posts
- Domains → Removed (simplified structure)  
- Directories → Series (for organizing related posts)
```

---

## Implementation Timeline

### Week 1: Core Cleanup (3-4 hours)
- **Day 1**: Type system cleanup and component updates
- **Day 2**: Store/state management updates
- **Day 3**: Testing and validation

### Week 2: Optimization and Documentation (1-2 hours)
- **Day 1**: Performance optimizations and database cleanup
- **Day 2**: Documentation updates and final testing

---

## Success Criteria

### Phase 3 Complete When:
- ✅ All directory/domain types removed from codebase
- ✅ Components only reference post/series model
- ✅ Store state reflects blog structure (posts/series)
- ✅ No legacy domain-related code remains
- ✅ TypeScript compiles without warnings
- ✅ All functionality tested and working
- ✅ Documentation updated to reflect blog structure

### Ready for Production When:
- No legacy references remain
- Performance is optimized
- Database is clean
- User workflows are seamless
- Documentation is complete

---

## Risk Mitigation

### Backup Strategy
- Database backup before any schema changes
- Git branches for each cleanup task
- Staged rollout of changes

### Testing Strategy
- Test each component after cleanup
- Verify all user workflows still work
- Check performance impact of changes
- Validate data integrity

---

## Post-Phase 3 Future Enhancements

### Blog-Specific Features
- **Categories/Tags**: Add to posts for better organization
- **Featured Posts**: Highlight important content
- **Comments**: Add commenting system
- **SEO**: Optimize for search engines
- **RSS Feeds**: Generate feeds for series and posts
- **Social Sharing**: Add sharing capabilities
- **Search**: Full-text search across posts
- **Analytics**: Track post views and engagement

### Technical Improvements
- **Caching**: Implement Redis caching for post data
- **CDN**: Set up CDN for static assets
- **Image Optimization**: Automatic image compression and resizing
- **PWA**: Enhanced progressive web app features

---

## Notes

- **Backward Compatibility**: Some legacy fields maintained during transition
- **Data Safety**: No data deletion until migration is fully validated
- **Gradual Cleanup**: Remove legacy code incrementally to minimize risk
- **User Experience**: Ensure no disruption to daily workflows

This completes the roadmap for Phase 3 final cleanup tasks. After completion, the blog refactor will be 100% complete with a clean, optimized codebase focused on the blog structure.
