---
applyTo: '**'
---

# Phase 2 Final Tasks - Blog Refactor

## Overview
Phase 2 is currently 85% complete. This document outlines the remaining 15% of tasks needed to fully complete the Component Layer transformation from document/domain structure to simple blog structure.

## Current Status Summary

### ✅ Already Completed (85%)
- **Backend Integration**: All main pages use post repository functions
- **Home Component**: Blog-focused UI with posts/series terminology
- **Dashboard**: Blog statistics instead of domain management  
- **Series Components**: Complete component set created
- **Series Routes**: All 4 series routes implemented (`/series/`, `/series/[id]/`, `/series/new/`, `/series/[id]/edit/`)
- **Series Actions**: Complete SeriesActions component set
- **Type System**: Proper Post/Series types working
- **Testing Issues**: Removed outdated test files - TypeScript compilation clean

### ❌ Remaining Tasks (15%)

---

## Task 1: Remove Domain Components (Priority: HIGH)

### 1.1 Delete Domain Component Directories

**Files to Remove:**
```bash
# Remove these component directories:
rm -rf src/components/Domain/
rm -rf src/components/DomainCard/
rm -rf src/components/DomainGrid/
```

**Specific Files:**
- `src/components/Domain/FetchDomains.tsx`
- `src/components/Domain/DomainView.tsx`
- `src/components/Domain/DomainEditForm.tsx`
- `src/components/DomainCard/index.tsx`
- `src/components/DomainGrid/index.tsx`

### 1.2 Remove Domain-Related Message Components

**Search and Remove:**
```bash
# Find domain-related message components:
grep -r "DomainNotInDomainMessage\|DocumentNotInDomainMessage\|DirectoryNotInDomainMessage" src/components/
```

**Files Likely to Remove:**
- `src/components/DirectoryView.tsx` (if exists)
- `src/components/NewDirectory.tsx` (if exists)
- `src/components/DirectoryNotInDomainMessage.tsx` (if exists)
- `src/components/DocumentNotInDomainMessage.tsx` (if exists)

---

## Task 2: Remove Domain Routes (Priority: HIGH)

### 2.1 Delete Domain Route Directory

**Command:**
```bash
rm -rf src/app/(appLayout)/domains/
```

**Routes to be Removed:**
- `/domains/[slug]/page.tsx`
- `/domains/new/page.tsx` 
- `/domains/edit/[id]/page.tsx`
- `/domains/[slug]/[id]/page.tsx`
- `/domains/[slug]/browse/[id]/page.tsx`
- `/domains/[slug]/view/[id]/page.tsx`
- `/domains/[slug]/edit/[id]/page.tsx`

### 2.2 Remove New Directory Route

**Command:**
```bash
rm -rf src/app/(appLayout)/new-directory/ # (if exists)
```

---

## Task 3: Update Browse Functionality (Priority: MEDIUM)

### 3.1 Update Browse Page

**File:** `src/app/(appLayout)/browse/page.tsx`

**Current State:**
```tsx
import DocumentBrowser from "@/components/DocumentBrowser";

export const metadata: Metadata = {
  title: "Personal Documents | Editor",
  description: "Browse, organize, and manage your personal documents and folders outside of domains",
};

export default async function BrowsePage() {
  return <DocumentBrowser />;
}
```

**Required Changes:**
1. Update metadata to reflect blog posts
2. Change description to mention posts instead of documents/domains
3. Update component to browse posts instead of documents

**Updated Implementation:**
```tsx
import PostBrowser from "@/components/PostBrowser"; // or update DocumentBrowser to handle posts

export const metadata: Metadata = {
  title: "Browse Posts | Blog",
  description: "Browse and search through all your blog posts and content",
};

export default async function BrowsePage() {
  return <PostBrowser />;
}
```

### 3.2 Update DocumentBrowser Component

**File:** `src/components/DocumentBrowser/index.tsx`

**Required Changes:**
1. Change to load posts instead of documents with domain filtering
2. Remove domain-related filtering options
3. Update UI text to reflect blog terminology
4. Keep same visual structure and functionality

**Key Updates:**
- Replace `findDocumentsByAuthorId` with `findPostsByAuthorId`
- Remove domain dropdown/filtering
- Change "Documents" → "Posts" in UI text
- Update search to work with posts only

---

## Task 4: Update Navigation Components (Priority: LOW)

### 4.1 Remove Domain Links from Navigation

**Files to Check and Update:**
- `src/components/Navigation/` (main navigation)
- `src/components/Sidebar/` (sidebar navigation)
- `src/components/Dashboard/` (dashboard links)

**Changes Required:**
1. Remove links to `/domains/`
2. Remove "New Directory" options
3. Add links to `/series/` if not already present
4. Update navigation text to reflect blog focus

### 4.2 Update Footer and Other UI Elements

**Search for Domain References:**
```bash
grep -r "domain\|Domain\|directory\|Directory" src/components/ --include="*.tsx" --include="*.ts"
```

**Update Text References:**
- "Documents" → "Posts"
- "Directories" → "Series" (where appropriate)
- "Domain" → remove or replace with "Blog"

---

## Task 5: Final Validation and Testing (Priority: LOW)

### 5.1 TypeScript Validation

**Command:**
```bash
npx tsc --noEmit
```

**Expected Result:** No compilation errors

### 5.2 Route Testing

**Test All Routes Work:**
- `/` - Home page shows posts
- `/dashboard/` - Shows blog statistics
- `/browse/` - Browse posts functionality
- `/series/` - List all series
- `/series/new/` - Create new series
- `/series/[id]/` - View series
- `/series/[id]/edit/` - Edit series
- `/new/` - Create new post
- `/edit/[id]/` - Edit existing post
- `/view/[id]/` - View published post

### 5.3 User Workflow Testing

**Test Complete User Journey:**
1. Create a new post
2. Publish the post
3. Create a new series
4. Add post to series
5. Browse posts
6. View series
7. Edit series and posts

### 5.4 Cleanup Validation

**Verify Removal:**
```bash
# Ensure no domain references remain:
grep -r "api/domains\|/domains/\|DomainCard\|DomainGrid" src/ || echo "Clean!"

# Ensure no directory creation references:
grep -r "new-directory\|NewDirectory" src/ || echo "Clean!"
```

---

## Implementation Timeline

### Day 1: Component and Route Cleanup (2-3 hours)
- **Morning**: Remove domain components and routes
- **Afternoon**: Update browse functionality

### Day 2: Navigation and Final Testing (1-2 hours)  
- **Morning**: Update navigation components
- **Afternoon**: Final validation and testing

---

## Success Criteria

### Phase 2 Complete When:
- ✅ All domain components removed
- ✅ All domain routes removed  
- ✅ Browse functionality works with posts
- ✅ Navigation updated to blog-focused
- ✅ TypeScript compiles without errors
- ✅ All routes functional
- ✅ User workflows tested and working

### Ready for Phase 3 When:
- No domain-related code remains
- All functionality works with posts/series model
- User experience is clean and blog-focused
- Performance maintained
- No broken links or references

---

## Risk Mitigation

### Backup Strategy
- Git commit before each major deletion
- Test after each component removal
- Keep domain API endpoints until Phase 3 (if needed)

### Rollback Plan
- Each task can be rolled back independently
- Domain components can be restored from git history
- Database remains unchanged during this phase

---

## Post-Phase 2 Notes

### For Phase 3 (Future)
- Domain database tables can be removed
- Domain-related types can be fully removed
- API endpoints can be cleaned up
- Performance optimizations can be implemented

### Documentation Updates Needed
- Update README to reflect blog structure
- Update API documentation
- Update deployment guides
- Update user documentation

---

This completes the roadmap for finishing Phase 2 of the blog refactor. After completion, the application will be fully transformed from a complex document/domain system to a clean, simple blog with posts and series.
