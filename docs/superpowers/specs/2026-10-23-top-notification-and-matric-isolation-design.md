# Top Notification Center & Dancer Matric Isolation Design Spec

**Date:** 2026-10-23  
**Status:** Approved  
**Author:** Pair Programming Session  

---

## 1. Overview & Context

This design spec addresses three targeted updates requested by the club admin:
1. **Floating Notification Button Placement**: Move the floating notification bell widget from bottom-right to top-right on both desktop and mobile screens.
2. **Dancer Identity Paradigm (1 Matric = 1 Dancer)**: Revert the identity logic so that matric number is the strict, sole identifier for each dancer. Different matric number = different dancer; identical matric number = same dancer (union of styles and attendance across submissions).
3. **Test Dancer Isolation**: Separate `Testing1` and `Testing2` from `Chan Da Hui`'s authentic matric number (`23005147`) by remapping them to distinct alphanumeric test matrics (`TEST9001` and `TEST9002`), ensuring `Chan Da Hui` exclusively owns `23005147` and can log into his dancer portal without interference.

---

## 2. Requirements & Constraints

### 2.1 Notification Floating Button Placement
- **Desktop**: Floats in top-right area (`top-5 right-6 z-40`), clearly visible and accessible without obstructing core canvas content.
- **Mobile**: Sits at `top-14 right-3 z-40`, just below the 48px sticky header bar (`--topbar-h`) so it never overlaps the clock, logo, or user info toggle button.
- **Drawer Interaction**: Clicking the bell opens the retro 3-tab drawer sliding in from the right edge with a clean z-index hierarchy (`z-50`).

### 2.2 Dancer Identity Model
- **Strict Matric Invariant**: Every distinct registered dancer has a unique `matricKey`.
- **Member ID Format**: `memberId` is strictly `M-${matricKey}` (e.g. `M-23005147`). Suffixes like `-testing1` are eliminated.
- **Multiple Submissions with Same Matric**:
  - Merge styles into a single set (union of `styleIds` and `styleNames`).
  - Merge flags and attendance records.
  - Authentic name is preserved (test dummy names like `Testing1` or `Testing2` never overwrite real dancer names).
- **Dancer Authentication (`auth.dancerLogin`)**:
  - Resolves dancer strictly by `m.matricKey === matricKey && m.active`.
  - When a dancer inputs their matric number, they log in directly to their dedicated profile.

### 2.3 Test Dancer Remapping (`Testing1` & `Testing2`)
- Rows where name is `Testing1` on matric `23005147` are remapped to matric `TEST9001`.
- Rows where name is `Testing2` on matric `23005147` are remapped to matric `TEST9002`.
- When event synchronization runs against Google Sheets, any such row has its matric cell in the source sheet updated to `TEST9001` or `TEST9002`.
- `ctx.db.memberIndex` purges any previously stored split IDs (`M-23005147-testing1`, `M-23005147-testing2`).
- As a result:
  - `Chan Da Hui` logs in with matric `23005147`.
  - `Testing1` logs in with matric `TEST9001`.
  - `Testing2` logs in with matric `TEST9002`.

---

## 3. Architecture & Interfaces

### 3.1 `web/src/components/ui/NotificationWidget.tsx`
- Change container position class from:
  `fixed bottom-6 right-6 z-40`
  to:
  `fixed top-14 right-3 sm:top-5 sm:right-6 z-40`
- Minimum touch target: 44px min-width and min-height maintained.

### 3.2 `api/src/logic/buildMembers.ts`
- Group rows by `matricKey`:
  `membersByMatric = new Map<string, { member: Member; timestampValue: number; rowNum: number }>()`
- For each row:
  - If `matricKey` already in map:
    - Add `duplicate` warning.
    - Compute style union.
    - If incoming row has test name (`Testing1`, `Testing2`) and existing has non-test name, retain existing name regardless of timestamp.
    - If incoming row is newer and not a test name, update contact, email, and name.
  - If `matricKey` not in map:
    - Insert member with `memberId: 'M-' + matricKey`.

### 3.3 `api/src/features/eventImport.ts`
- Add remap check during row parsing:
  - If row name matches `/^testing\s*1$/i` and matric is `23005147` &rarr; matric becomes `TEST9001`.
  - If row name matches `/^testing\s*2$/i` and matric is `23005147` &rarr; matric becomes `TEST9002`.
  - If sheet is writable, write updated matric back to the sheet cell.
- In `importEventMembers`:
  - When syncing `ctx.db.memberIndex`, delete any index entries with `memberId` matching `M-23005147-*`.

### 3.4 `api/src/features/auth.ts`
- In `auth.dancerLogin`:
  - Find dancer where `m.matricKey === matricKey && m.active`.
  - If found, authenticate dancer and issue token.

---

## 4. Verification & Testing Strategy
1. **Unit Tests (`buildMembers.test.ts`)**:
   - Verify multiple rows with same matric merge into single member `M-${matricKey}` with style union.
   - Verify `Testing1` on matric `TEST9001` and `Chan Da Hui` on `23005147` form two independent members.
2. **Auth Tests (`auth.test.ts`)**:
   - Verify `Chan Da Hui` logs in cleanly with matric `23005147`.
   - Verify `Testing1` logs in with matric `TEST9001`.
3. **Import Tests (`eventImport.test.ts`)**:
   - Verify rows with `Testing1` on `23005147` are remapped to `TEST9001` and update the sheet.
4. **Widget Tests (`NotificationWidget.test.tsx`)**:
   - Verify floating bell button renders with top-right positioning classes.
5. **Full Suites**:
   - Run complete Vitest suites across `api` and `web`.
