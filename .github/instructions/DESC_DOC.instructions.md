---
applyTo: '**'
---

# Document Description Support - Implementation Instructions

## Overview
Add support for document descriptions to enhance content discovery, SEO, and user experience. This feature allows users to add brief descriptions to their blog posts that will be displayed in post cards, view pages, and used for content previews.

## Database Schema Changes

### 1. **Update Prisma Schema**
**File**: `/prisma/schema.prisma`

Add the `description` field to the Document model:

```prisma
model Document {
  id        String   @id @default(uuid()) @db.Uuid
  handle    String?  @unique
  name      String
  description String? // ADD THIS LINE
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())
  // ... rest of existing fields remain unchanged
}
```

### 2. **Generate Migration**
Run the following commands to create and apply the database migration:

```bash
source .env
source ~/.nvm/nvm.sh
npx prisma migrate dev --name add_document_description
```

## Type Definition Updates

### 3. **Update TypeScript Types**
**File**: `/src/types.ts`

Add `description` field to the following interfaces:

#### EditorDocument Interface (around line 42)
```typescript
export type EditorDocument = {
  id: string;
  name: string;
  description?: string | null; // ADD THIS LINE
  head: string;
  data: SerializedEditorState;
  // ... rest of existing fields
};
```

#### Document Interface (around line 67)
```typescript
export type Document = Omit<EditorDocument, "data"> & {
  author: User;
  coauthors: User[];
  revisions: DocumentRevision[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  description?: string | null; // ADD THIS LINE (if not inherited from EditorDocument)
  // ... rest of existing fields
};
```

#### DocumentCreateInput Interface (around line 140)
```typescript
export type DocumentCreateInput = EditorDocument & {
  coauthors?: string[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  description?: string | null; // ADD THIS LINE (if not inherited from EditorDocument)
  // ... rest of existing fields
};
```

#### DocumentUpdateInput Interface (around line 150)
```typescript
export type DocumentUpdateInput = Partial<EditorDocument> & {
  coauthors?: string[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  description?: string | null; // ADD THIS LINE (if not inherited from EditorDocument)
  // ... rest of existing fields
};
```

## UI Implementation

### 4. **Edit Dialog - Add Description Field**
**File**: `/src/components/DocumentActions/Edit.tsx`

Add description input field after the title field (around line 290):

```tsx
            <TextField
              margin="normal"
              size="small"
              fullWidth
              autoFocus
              label="Post Title"
              value={input.name || ""}
              onChange={(e) => updateInput({ name: e.target.value })}
              sx={{ "& .MuiInputBase-root": { height: 40 } }}
            />
            {/* ADD THIS DESCRIPTION FIELD */}
            <TextField
              margin="normal"
              size="small"
              fullWidth
              multiline
              rows={3}
              label="Description"
              placeholder="A brief description of your post (optional)"
              value={input.description || ""}
              onChange={(e) => updateInput({ description: e.target.value })}
              helperText="This description will appear in post previews and help with SEO"
              sx={{ 
                "& .MuiInputBase-root": { 
                  minHeight: 80,
                  alignItems: "flex-start",
                  padding: "8px 12px"
                },
                "& .MuiInputBase-input": {
                  resize: "vertical"
                }
              }}
            />
            <TextField
              margin="normal"
              size="small"
              fullWidth
              label="Post Handle"
              // ... rest of handle field
```

### 5. **Post Cards - Display Description**
**File**: `/src/components/DocumentCardNew/components/PostContent.tsx`

Replace the placeholder excerpt text with the actual description (around line 130):

```tsx
      {/* Excerpt/Description */}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "1rem",
          mt: "auto",
        }}
      >
        {/* REPLACE THIS LINE */}
        {document?.description || "Click to read this article and discover the insights shared within..."}
      </Typography>
```

### 6. **View Document Info - Display Description**
**File**: `/src/components/ViewDocumentInfo.tsx`

Add description display after the document title (around line 65):

```tsx
          <Typography component="h2" variant="h6">
            {cloudDocument.name}
          </Typography>
          {/* ADD DESCRIPTION DISPLAY */}
          {cloudDocument.description && (
            <Typography 
              variant="body1" 
              color="text.secondary"
              sx={{ 
                mb: 2, 
                fontStyle: 'italic',
                lineHeight: 1.6,
                padding: "8px 12px",
                backgroundColor: "action.hover",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider"
              }}
            >
              {cloudDocument.description}
            </Typography>
          )}
          <Typography variant="subtitle2" color="text.secondary">
            Created: {new Date(cloudDocument.createdAt).toLocaleString(
```

### 7. **Edit Document Info - Display Description**
**File**: `/src/components/EditDocument/EditDocumentInfo.tsx`

Add description display after the document title (around line 160):

```tsx
          {localDocument && (
            <>
              <Typography component="h2" variant="h6">
                {localDocument.name}
              </Typography>
              {/* ADD DESCRIPTION DISPLAY */}
              {localDocument.description && (
                <Typography 
                  variant="body2" 
                  color="text.secondary"
                  sx={{ 
                    mb: 1, 
                    fontStyle: 'italic',
                    lineHeight: 1.5,
                    padding: "6px 8px",
                    backgroundColor: "action.hover",
                    borderRadius: 0.5,
                    fontSize: "0.875rem"
                  }}
                >
                  {localDocument.description}
                </Typography>
              )}
              {localDocument.status && localDocument.status !== "NEUTRAL" && (
```

### 8. **New Document Form - Add Description Field**
**File**: `/src/components/NewDocument.tsx`

Add description field in the new document form (around line 350, after the name field):

```tsx
            <TextField
              fullWidth
              autoFocus
              margin="normal"
              label="Document Title"
              value={input.name || ""}
              onChange={(e) => updateInput({ name: e.target.value })}
            />
            {/* ADD DESCRIPTION FIELD */}
            <TextField
              fullWidth
              multiline
              rows={3}
              margin="normal"
              label="Description"
              placeholder="A brief description of your document (optional)"
              value={input.description || ""}
              onChange={(e) => updateInput({ description: e.target.value })}
              helperText="This description will help others understand what your document is about"
            />
            <TextField
              fullWidth
              margin="normal"
              label="Document Handle"
              // ... rest of existing fields
```

## Backend Updates

### 9. **Repository Functions**
**File**: `/src/repositories/document.ts`

Ensure that description fields are included in database queries. The existing `findUserDocument`, `createDocument`, and `updateDocument` functions should automatically include the new description field since they use Prisma's auto-generated types.

Verify that the following functions handle the description field properly:
- `findUserDocument` - should return description in the response
- `createDocument` - should save description when creating
- `updateDocument` - should update description when provided

### 10. **API Routes**
**Files**: Various API route files in `/src/app/api/`

Check that API routes properly handle the description field:
- Document creation endpoints
- Document update endpoints
- Document retrieval endpoints

No explicit changes should be needed if using Prisma types correctly, but verify that description is included in request/response handling.

## Redux Store Updates

### 11. **Redux Actions**
**File**: `/src/store/app.ts`

Verify that Redux actions handle the description field:
- `createLocalDocument` - should include description
- `updateLocalDocument` - should update description
- `createCloudDocument` - should sync description to cloud
- `updateCloudDocument` - should update description in cloud

The existing actions should automatically handle the new field since they're based on the TypeScript interfaces.

## PostsList Component Integration

### 12. **Posts List Component**
**File**: `/src/components/PostsList/components/PostCard.tsx` (if exists)

If using a separate PostCard component in the PostsList, ensure it also displays descriptions:

```tsx
// Follow the same pattern as step 5 above
{document?.description && (
  <Typography variant="body2" color="text.secondary">
    {document.description}
  </Typography>
)}
```

## Testing and Validation

### 13. **Manual Testing Checklist**

After implementing all changes:

1. **Database Migration**
   - [ ] Migration runs without errors
   - [ ] Description field exists in database
   - [ ] Existing documents have null description (no errors)

2. **Create New Document**
   - [ ] Description field appears in new document form
   - [ ] Description saves correctly
   - [ ] Document appears in lists with description

3. **Edit Existing Document**
   - [ ] Edit dialog shows description field
   - [ ] Can add description to existing document
   - [ ] Can update existing description
   - [ ] Can clear description (set to empty)

4. **View Document**
   - [ ] Description appears in document info panel
   - [ ] Description styling looks good
   - [ ] No description shows nothing (no empty space)

5. **Post Cards**
   - [ ] Description appears as excerpt text
   - [ ] Fallback text shows when no description
   - [ ] Text truncation works properly (3 lines max)

6. **Posts List**
   - [ ] Descriptions appear in post cards
   - [ ] Month grouping still works
   - [ ] Responsive layout maintained

## SEO and Accessibility

### 14. **SEO Improvements**

Consider adding meta description tags based on document description:

**File**: `/src/app/(appLayout)/view/[id]/page.tsx`

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const document = await getCachedUserDocument(params.id, "all");
  
  return {
    title: document?.name || "Blog Post",
    description: document?.description || "Read this blog post on MathEditor",
    // ... other meta tags
  };
}
```

### 15. **Accessibility**

Ensure description fields have proper ARIA labels and help text:
- Screen readers can understand the purpose
- Form validation messages are clear
- Proper heading hierarchy maintained

## Future Enhancements

### 16. **Potential Improvements**

Consider these enhancements for future iterations:

1. **Character Limits**: Add character count and limits for descriptions
2. **Rich Text**: Allow basic formatting in descriptions
3. **Auto-generation**: Generate descriptions from document content
4. **Search Integration**: Use descriptions in search functionality
5. **Social Sharing**: Use descriptions for social media previews

## Migration Strategy

### 17. **Deployment Considerations**

1. **Backwards Compatibility**: Ensure existing documents work without descriptions
2. **Default Values**: Consider if any documents need default descriptions
3. **Performance**: Monitor query performance with new field
4. **Indexing**: Consider adding database index if descriptions are searchable

## Success Criteria

### 18. **Definition of Done**

- [ ] Database schema updated with description field
- [ ] All TypeScript types include description
- [ ] Edit dialog allows description input
- [ ] View page displays descriptions
- [ ] Post cards show descriptions as excerpts
- [ ] New document form includes description field
- [ ] No breaking changes to existing functionality
- [ ] Manual testing checklist completed
- [ ] SEO meta descriptions implemented
- [ ] Documentation updated

## Notes

- Description field is optional (nullable) to maintain backwards compatibility
- Maximum length should be reasonable for UI display (suggest 500 characters)
- Consider adding client-side validation for description length
- Ensure proper escaping/sanitization of description content
- Test with various description lengths (empty, short, long, very long)

---

**Implementation Order Recommendation:**
1. Database schema + migration
2. TypeScript types
3. Edit dialog description field
4. View page description display  
5. Post card description display
6. New document form
7. SEO meta descriptions
8. Testing and validation
