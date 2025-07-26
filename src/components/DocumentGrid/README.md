# DocumentGrid Component

A highly optimized, responsive grid component for displaying documents and
directories with comprehensive features for modern web applications.

## Features ✨

- **🎯 Performance Optimized**: Comprehensive memoization and efficient
  re-rendering
- **📱 Responsive Design**: Adaptive layout for all screen sizes
- **♿ Accessibility**: Full ARIA support and keyboard navigation
- **🔄 Error Handling**: Graceful error states with retry functionality
- **📭 Empty States**: Customizable empty state with action buttons
- **⏳ Loading States**: Skeleton placeholders during data fetching
- **🎨 Motion Aware**: Respects user's motion preferences
- **🔧 Developer Tools**: Performance monitoring in development mode

## Basic Usage

```tsx
import DocumentGrid from "@/components/DocumentGrid";

function MyComponent() {
  return (
    <DocumentGrid
      items={documents}
      user={currentUser}
      title="My Documents"
      titleIcon={<Folder />}
      isLoading={loading}
    />
  );
}
```

## Advanced Usage

```tsx
import DocumentGrid from "@/components/DocumentGrid";
import { Add, Folder } from "@mui/icons-material";

function AdvancedExample() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleRetry = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchDocuments();
      setDocuments(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = () => {
    // Navigate to document creation
    router.push("/create");
  };

  return (
    <DocumentGrid
      items={documents}
      user={currentUser}
      currentDirectoryId={directoryId}
      title="Project Documents"
      titleIcon={<Folder />}
      isLoading={loading}
      error={error}
      onRetry={handleRetry}
      onMoveComplete={() => refetch()}
      showEmptyState={true}
      emptyMessage="No documents in this folder"
      emptyActionLabel="Create New Document"
      onEmptyAction={handleCreateDocument}
      skeletonCount={6}
    />
  );
}
```

## Props

| Prop                 | Type                      | Default      | Description                   |
| -------------------- | ------------------------- | ------------ | ----------------------------- |
| `items`              | `UserDocument[]`          | **Required** | Array of documents to display |
| `user`               | `User?`                   | `undefined`  | Current user for permissions  |
| `currentDirectoryId` | `string?`                 | `undefined`  | Current directory context     |
| `title`              | `string?`                 | `undefined`  | Grid title to display         |
| `titleIcon`          | `ReactNode?`              | `undefined`  | Icon next to title            |
| `sx`                 | `SxProps<Theme>?`         | `undefined`  | Additional styles             |
| `onMoveComplete`     | `() => void?`             | `undefined`  | Callback after item move      |
| `isLoading`          | `boolean`                 | `false`      | Loading state                 |
| `skeletonCount`      | `number`                  | `4`          | Number of skeleton items      |
| `error`              | `Error \| string \| null` | `null`       | Error state                   |
| `onRetry`            | `() => void?`             | `undefined`  | Error retry callback          |
| `showEmptyState`     | `boolean`                 | `true`       | Show empty state component    |
| `emptyMessage`       | `string?`                 | `undefined`  | Custom empty message          |
| `emptyActionLabel`   | `string?`                 | `undefined`  | Empty state button label      |
| `onEmptyAction`      | `() => void?`             | `undefined`  | Empty state action            |

## Grid Layout

The component automatically adapts to different screen sizes:

| Breakpoint         | Columns | Grid Size |
| ------------------ | ------- | --------- |
| XS (mobile)        | 1       | 12/12     |
| SM (tablet)        | 2       | 6/12      |
| MD (small desktop) | 3       | 4/12      |
| LG (desktop)       | 4       | 3/12      |
| XL (large desktop) | 5       | 2.4/12    |

## Sub-components

### DocumentGridHeader

Header component with title, icon, and item count.

```tsx
import { DocumentGridHeader } from "@/components/DocumentGrid";

<DocumentGridHeader
  title="Documents"
  titleIcon={<Folder />}
  isLoading={false}
  itemCount={documents.length}
/>;
```

### DocumentGridError

Error state component with retry functionality.

```tsx
import { DocumentGridError } from "@/components/DocumentGrid";

<DocumentGridError
  error={error}
  onRetry={handleRetry}
  message="Custom error message"
/>;
```

### DocumentGridEmpty

Empty state component with action button.

```tsx
import { DocumentGridEmpty } from "@/components/DocumentGrid";

<DocumentGridEmpty
  message="No documents found"
  actionLabel="Create Document"
  onAction={handleCreate}
  icon={<CreateIcon />}
/>;
```

## Custom Hook

### useResponsiveDocumentGrid

Hook for responsive grid calculations.

```tsx
import { useResponsiveDocumentGrid } from "@/components/DocumentGrid";

function CustomGrid() {
  const { gridSizing, breakpointInfo } = useResponsiveDocumentGrid();

  return (
    <Grid container>
      {items.map((item) => (
        <Grid key={item.id} size={gridSizing}>
          <CustomCard item={item} />
        </Grid>
      ))}
    </Grid>
  );
}
```

## Performance

The component is optimized for performance:

- **Memoization**: All expensive operations are memoized
- **Responsive Calculations**: Cached breakpoint calculations
- **Development Monitoring**: Performance metrics in dev mode
- **Efficient Re-renders**: Optimized dependency arrays

### Performance Monitoring

In development mode, the component automatically monitors performance:

```javascript
// Console warnings for slow renders (>16ms)
DocumentGrid: Slow render detected {
  renderTime: "23.45ms",
  itemCount: 50,
  renderCount: 15,
  averageRenderTime: "18.20ms"
}
```

## Accessibility

- **Semantic HTML**: Uses `<section>` with proper roles
- **ARIA Labels**: Descriptive labels for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Motion Preferences**: Respects `prefers-reduced-motion`
- **Focus Management**: Proper focus indicators

## Error Handling

The component provides comprehensive error handling:

1. **Error State**: Displays error message with retry option
2. **Graceful Degradation**: Falls back to safe states
3. **User Feedback**: Clear error messages and actions
4. **Recovery**: Retry functionality for transient errors

## Best Practices

1. **Always provide a retry function** for error states
2. **Use meaningful titles and icons** for better UX
3. **Implement empty state actions** to guide users
4. **Monitor performance** in development
5. **Test with various data sizes** for responsive behavior

## Migration from Previous Version

If migrating from the old DocumentGrid:

```tsx
// Before
<DocumentGrid
  items={documents}
  user={user}
  title="Documents"
/>

// After (same API, enhanced features)
<DocumentGrid
  items={documents}
  user={user}
  title="Documents"
  error={error}           // New: error handling
  onRetry={handleRetry}   // New: retry functionality
  onEmptyAction={onCreate} // New: empty state action
/>
```

## Contributing

When contributing to this component:

1. Maintain performance optimizations
2. Add comprehensive tests for new features
3. Follow accessibility guidelines
4. Update documentation for API changes
5. Test across different screen sizes
