---
applyTo: '**'
---
# Posts List UI Component - Development Instructions

## Overview
Create a modern, chronologically organized posts listing component to replace the simple h1 title in `/src/app/(appLayout)/posts/page.tsx`. This component should provide an engaging blog reading experience with posts organized by publication months.

## Component Requirements

### 1. **Core Functionality**
- **Data Source**: Use the same logic as `./browse` route to fetch posts
- **Fetching Logic**: Reuse `DocumentBrowser` component patterns and `useDocumentFiltering` hook
- **Posts Access**: Utilize Redux store `state.documents` filtered for published posts
- **URL Pattern**: Posts should link to `/view/{id}` (same as browse route)

### 2. **Month-Based Partitioning**
- **Grouping**: Partition posts by publication month/year (using `createdAt` field)
- **Format**: Display months as "January 2024", "December 2023", etc.
- **Chronological Order**: Most recent months first, posts within months in reverse chronological order
- **Month Headers**: Clear section headers for each month with post count

### 3. **Modern Blog UI Practices**

#### **Layout Structure**
```
Header Section
├── Page Title: "All Posts"
├── Posts Count: "24 posts"
├── Sort Controls (optional)
└── Search/Filter (future enhancement)

Monthly Sections
├── Month Header: "January 2024 (5 posts)"
├── Posts Grid/List
│   ├── Post Card 1
│   ├── Post Card 2
│   └── ...
├── Month Header: "December 2023 (3 posts)"
└── Posts Grid/List
    └── ...
```

#### **Visual Design**
- **Typography**: Clean, readable fonts with proper hierarchy
- **Spacing**: Generous whitespace between sections and cards
- **Cards**: Modern post cards with:
  - Thumbnail/featured image (if available)
  - Post title (prominent)
  - Publication date
  - Author information
  - Brief excerpt/description (if available)
  - Read time estimate (optional)
- **Responsive**: Mobile-first design with grid adaptation:
  - Mobile: 1 column
  - Tablet: 2 columns
  - Desktop: 3-4 columns
- **Hover Effects**: Subtle animations and elevation changes
- **Loading States**: Skeleton cards while loading

### 4. **Technical Implementation**

#### **Component Architecture**
```
PostsList/
├── index.tsx                 # Main container component
├── components/
│   ├── PostsHeader.tsx      # Header with title and controls
│   ├── MonthSection.tsx     # Monthly grouping container
│   ├── MonthHeader.tsx      # Month title and post count
│   ├── PostCard.tsx         # Individual post card (reuse existing)
│   └── PostsGrid.tsx        # Responsive grid layout
├── hooks/
│   ├── usePostsGrouping.ts  # Month-based grouping logic
│   └── usePostsData.ts      # Data fetching and filtering
└── utils/
    └── dateHelpers.ts       # Date formatting utilities
```

#### **Data Flow**
1. **Fetch Posts**: Use Redux `state.documents` with filtering for published posts
2. **Filter Logic**: Reuse `useDocumentFiltering` pattern from DocumentBrowser
3. **Group by Month**: Transform flat posts array into month-grouped structure
4. **Sort**: Most recent months first, posts within months by `createdAt` desc
5. **Render**: Map through month groups, render MonthSection for each

#### **Key Functions to Implement**
```typescript
// Group posts by month/year
const groupPostsByMonth = (posts: UserDocument[]): MonthGroup[] => {
  // Implementation details in instructions below
}

// Format month for display
const formatMonthHeader = (date: Date): string => {
  // "January 2024" format
}

// Custom hook for posts data
const usePostsData = () => {
  // Reuse DocumentBrowser logic
  // Return grouped posts by month
}
```

## Implementation Steps

### **Step 1: Setup Component Structure**
1. Create `src/components/PostsList/` directory
2. Create main `index.tsx` component
3. Setup basic layout with Material-UI components
4. Create placeholder components for sub-components

### **Step 2: Data Integration**
1. Copy data fetching logic from `DocumentBrowser`
2. Use `useSelector((state) => state.documents)` for posts data
3. Filter for published posts only (`published: true`)
4. Implement `usePostsData` hook

### **Step 3: Month Grouping Logic**
1. Create `groupPostsByMonth` utility function
2. Group posts by `createdAt` month/year
3. Sort months in reverse chronological order
4. Sort posts within each month by `createdAt` desc

### **Step 4: UI Components**
1. Implement `PostsHeader` with title and post count
2. Create `MonthSection` component for each month group
3. Implement `MonthHeader` with month name and post count
4. Create responsive `PostsGrid` layout
5. Reuse existing `DocumentCard` for individual posts

### **Step 5: Styling and Responsiveness**
1. Implement Material-UI responsive grid system
2. Add modern card styling with hover effects
3. Ensure mobile-first responsive design
4. Add loading states and empty states

### **Step 6: Integration**
1. Import `PostsList` component in `posts/page.tsx`
2. Replace the h1 title with `<PostsList />`
3. Test with existing posts data
4. Verify responsive behavior

## Code Examples

### **Month Grouping Logic**
```typescript
interface MonthGroup {
  monthKey: string;          // "2024-01"
  monthLabel: string;        // "January 2024"
  posts: UserDocument[];
  count: number;
}

const groupPostsByMonth = (posts: UserDocument[]): MonthGroup[] => {
  const groups = new Map<string, UserDocument[]>();
  
  posts.forEach(post => {
    const date = new Date(post.cloud?.createdAt || post.local?.createdAt || '');
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey)!.push(post);
  });
  
  return Array.from(groups.entries())
    .map(([monthKey, posts]) => ({
      monthKey,
      monthLabel: formatMonthHeader(new Date(monthKey + '-01')),
      posts: posts.sort((a, b) => 
        new Date(b.cloud?.createdAt || b.local?.createdAt || '').getTime() - 
        new Date(a.cloud?.createdAt || a.local?.createdAt || '').getTime()
      ),
      count: posts.length
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
};
```

### **Component Usage**
```typescript
// In posts/page.tsx
import PostsList from '@/components/PostsList';

const PostsPage = () => {
  return (
    <Container maxWidth="lg">
      <PostsList />
    </Container>
  );
};
```

## Design Considerations

### **Performance**
- Use React.memo for PostCard components
- Implement virtual scrolling for large post lists (future enhancement)
- Optimize image loading with lazy loading

### **Accessibility**
- Proper heading hierarchy (h1 for page, h2 for months, h3 for posts)
- ARIA labels for interactive elements
- Keyboard navigation support
- Screen reader friendly structure

### **SEO**
- Semantic HTML structure
- Proper heading hierarchy
- Meta descriptions for post cards
- Structured data (future enhancement)

### **User Experience**
- Smooth transitions and animations
- Clear visual hierarchy
- Intuitive navigation
- Loading states that don't feel jarring
- Empty state handling

## Future Enhancements
- Search functionality
- Filter by tags/categories
- Pagination or infinite scroll
- Featured posts section
- Reading progress indicators
- Social sharing buttons

## References
- Existing DocumentBrowser component: `/src/components/DocumentBrowser/`
- DocumentCard component: `/src/components/DocumentCardNew/`
- Posts data structure: `/src/repositories/post.ts`
- Redux store: `/src/store/app.ts`
- Material-UI Grid system: [MUI Grid v2](https://mui.com/material-ui/react-grid2/)

## Success Criteria
- Posts are displayed in chronological groups by month
- Modern, responsive design that works on all devices
- Reuses existing data fetching patterns from browse route
- Maintains performance with large numbers of posts
- Provides excellent user experience for blog readers
- Easy to maintain and extend for future features
