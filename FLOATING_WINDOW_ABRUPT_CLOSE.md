# Floating Window Abrupt Close Bug Report

## Summary
A critical UI bug was identified and resolved where the Share dialog window would appear for approximately 1 second and then close abruptly when accessed through the three-dots action menu in DocumentCard components.

## Bug Description

### Symptoms
- User clicks "Share" option in the three-dots dropdown menu
- Share dialog window opens successfully
- After ~1 second, the dialog closes automatically without user interaction
- Expected behavior: Dialog should remain open until user explicitly closes it

### Affected Components
- `src/components/DocumentActions/Share.tsx` - Share dialog component
- `src/components/DocumentActions/ActionMenu.tsx` - Three-dots dropdown menu
- Impact: All document cards when Share was moved from external button to dropdown menu

## Root Cause Analysis

### Technical Cause
The bug was caused by conflicting UI state management between the dropdown menu and the dialog window:

1. **Initial Event Sequence (Buggy)**:
   ```
   User clicks "Share" → openShareDialog() called → closeMenu() called immediately
   → setShareDialogOpen(true) → Dialog renders → Menu closing affects dialog state
   → Dialog closes prematurely
   ```

2. **State Interference**: The immediate closing of the dropdown menu was interfering with the dialog's ability to establish its DOM presence and maintain focus.

3. **Timing Issues**: Various timing-based solutions (setTimeout, requestAnimationFrame, useEffect) were attempted but failed because the fundamental issue was the order of operations between menu closing and dialog opening.

### Context
This bug emerged when the Share functionality was moved from an external icon button to inside the three-dots dropdown menu as part of UI consolidation efforts. When the Share component was used as a standalone icon button, it worked perfectly because there was no parent menu to close.

## Solutions Attempted

### 1. Timeout-Based Approach (Failed)
```typescript
// Added delay between menu close and dialog open
setTimeout(() => {
  setShareDialogOpen(true);
}, 100);
```
**Result**: Dialog still closed prematurely due to underlying state conflicts.

### 2. RequestAnimationFrame Approach (Failed)
```typescript
// Deferred menu closing to next animation frame
requestAnimationFrame(() => closeMenu());
```
**Result**: Timing still caused conflicts between menu and dialog states.

### 3. UseEffect State Management (Failed)
```typescript
// Complex state management with flags and effects
const [shouldCloseMenu, setShouldCloseMenu] = useState(false);
useEffect(() => {
  if (shareDialogOpen && shouldCloseMenu && closeMenu) {
    closeMenu();
    setShouldCloseMenu(false);
  }
}, [shareDialogOpen, shouldCloseMenu, closeMenu]);
```
**Result**: Still experienced state interference issues.

### 4. Event Propagation Control (Failed)
```typescript
// Attempted to prevent event bubbling
onClick={(e) => {
  e.stopPropagation();
  openShareDialog();
}}
```
**Result**: Did not address the core timing issue.

## Final Solution

### Approach: Deferred Menu Closing
Instead of closing the menu immediately when opening the dialog, the menu remains open until the dialog operation is complete.

### Implementation
```typescript
const openShareDialog = () => {
  setFormat(cloudDocument?.collab ? "edit" : "view");
  const v = searchParams.get("v");
  setRevision(v || (cloudDocument?.head ?? null));
  setShareDialogOpen(true);
  // Don't close menu - let it stay open
};

const closeShareDialog = () => {
  setShareDialogOpen(false);
  // Close menu when dialog closes
  if (closeMenu) closeMenu();
};
```

### Key Changes
1. **Removed immediate menu closing** from `openShareDialog()`
2. **Added menu closing** to `closeShareDialog()`
3. **Maintained clean separation** between dialog and menu state management

## Benefits of the Solution

### Technical Benefits
- **Eliminates state conflicts**: No simultaneous state changes between menu and dialog
- **Predictable event sequence**: Dialog opens → User interacts → Dialog closes → Menu closes
- **No timing dependencies**: Solution doesn't rely on arbitrary delays or animation frames
- **Simple and maintainable**: Clean, straightforward logic flow

### User Experience Benefits
- **Reliable dialog behavior**: Share dialog consistently stays open until user action
- **Intuitive interaction**: Menu provides visual context while dialog is open
- **Consistent with other dialogs**: Matches behavior patterns of other modal dialogs in the application

## Testing and Validation

### Test Cases Verified
1. ✅ Share dialog opens and remains open when clicked from dropdown menu
2. ✅ Dialog closes properly when user clicks "Cancel" or outside dialog
3. ✅ Menu closes after dialog is dismissed
4. ✅ Share functionality works correctly (copy link, share via Web Share API)
5. ✅ No regression in icon button variant of Share component
6. ✅ Consistent behavior across different document types

### Edge Cases Tested
- Multiple rapid clicks on Share button
- Keyboard navigation (Tab, Escape, Enter)
- Mobile/touch interactions
- Dialog interaction while menu is visible

## Prevention Measures

### Best Practices Established
1. **Avoid immediate state cleanup** when opening modal dialogs from dropdown menus
2. **Defer parent component state changes** until child dialog operations complete
3. **Test dialog components** in both standalone and menu contexts
4. **Document state management patterns** for modal dialogs within dropdown menus

### Code Review Guidelines
- When moving components from standalone to menu items, verify modal dialog behavior
- Check for immediate `closeMenu()` calls in dialog opening functions
- Test dialog persistence and closing behavior thoroughly
- Consider deferred cleanup patterns for nested UI components

## Lessons Learned

1. **UI State Timing Matters**: The order and timing of state changes in nested UI components can cause unexpected behaviors
2. **Context-Dependent Components**: Components behave differently when their context changes (standalone vs. within menus)
3. **Simple Solutions Often Work Best**: Complex timing-based solutions often mask rather than solve underlying architectural issues
4. **User Experience First**: Technical solutions should prioritize predictable user interactions over code elegance

## Related Documentation
- See `docs/COMPONENTS.md` for general component interaction patterns
- See `src/components/DocumentCard/README.md` for DocumentCard architecture
- See Material-UI Dialog documentation for modal dialog best practices

---
**Date**: August 24, 2025  
**Fixed In**: Share.tsx, ActionMenu.tsx  
**Severity**: High (Affected core user functionality)  
**Status**: Resolved ✅
