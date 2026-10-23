# Admin UX & Dancer Identity Upgrades — Design Spec

**Date:** 2026-10-23  
**Status:** Approved via Brainstorming Interview  
**Branch:** `feat/admin-ux-and-identity-upgrades`

---

## 1. Overview & Goals

This specification covers seven interconnected enhancements to the UMDSC Dance Class System:
1. **Clock Icon Visibility**: Fix dark-on-dark invisible native clock icon in time inputs across all browsers.
2. **Single-Dance-Style Event Full House Gating**: Ensure single-style events (such as House Foundation) correctly auto-close the Google Form when capacity is reached, without requiring a style choice question on the form.
3. **Events Page Accordion & Year-Based Archive Grouping**: Convert the active events grid and archived events list into collapsible retro accordions, with archived events grouped by year and individual event cards collapsible to compact title bars.
4. **Unified 'SYNC NOW' Action**: Merge "SYNC NOW" and "SYNC FORM" into a single button on `EventCard` that executes both sheet response import and Google Form slot gating in one click with consolidated status feedback.
5. **Dancer Identity & Matric Disambiguation**: Allow dancers sharing the same matric number but having distinct full names to exist as independent dancer profiles, both able to log in with their respective names, while displaying their authentic matric number without public suffixes. Detect minor name typos as "Name variations" and distinct names as "Matric conflicts" in the system alert feed.
6. **'I · CHOOSE EVENT' Accordion with Year Grouping**: Clean up the global event selector across admin pages by nesting archived events under an accordion with year tabs.
7. **Floating Notification Center**: Implement a persistent retro cyberpunk floating bell button at the bottom-right of all admin pages that slides open a side drawer with three tabs: **New Dancers**, **Slot Progress**, and **System & Audit** (including profile changes, errors, and matric conflict alerts).

---

## 2. Feature Specifications

### 2.1 Clock Icon Visibility in Time Inputs
- **Problem**: Native `<input type="time">` elements in `ScheduleStep.tsx` and throughout the app render dark browser indicators (`::-webkit-calendar-picker-indicator`), which are almost invisible against `--night-1` / `--night-2` dark backgrounds.
- **Solution**:
  - Add explicit global styling in `web/src/theme/pixel.css`:
    ```css
    input[type="time"], input[type="date"] {
      color-scheme: dark;
    }
    input[type="time"]::-webkit-calendar-picker-indicator,
    input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(0.85) sepia(100%) hue-rotate(130deg) saturate(300%) brightness(1.2);
      cursor: pointer;
    }
    ```
  - This ensures the clock icon renders in vibrant neon cyan matching the UMDSC retro theme.

### 2.2 Single-Style Event Full-House Auto-Gating
- **Problem**: In single-style events (e.g. House Foundation), the Google Form does not have a checkbox or multiple-choice question for selecting dance styles. The previous auto-discovery attempted to score non-style questions or failed to close the form when slots filled up.
- **Specification**:
  - In `syncGoogleFormSlotChoices` (`api/src/features/formGating.ts`):
    - Check if `event.styleIds.length === 1`.
    - If single-style:
      - **Do NOT** execute question choice auto-discovery (skip modifying questions or parsing choices).
      - Compute enrolled count directly from `activeMembers.length`.
      - Check against `slotCapacity[singleStyleId]`.
      - If `enrolledCount >= cap`, trigger `form.setAcceptingResponses(false)` with `FULL_HOUSE_CLOSED_MESSAGE`.
      - If capacity is increased or enrolled count drops below cap, re-open the form (`form.setAcceptingResponses(true)`).
  - Update `checkAndNotifySlotCapacities` in `eventImport.ts`:
    - Ensure slot full notification email accurately reflects single-style events.
    - Run `syncGoogleFormSlotChoices` during both manual sync and scheduled auto-sync.

### 2.3 Events Page Accordion & Year-Based Archive Grouping
- **Active Events**:
  - Replaced flat grid with collapsible event bars.
  - Collapsed state: Compact retro bar showing event name, type badge, dancer count pill, and slot status pill, with `[ ▼ ]` expand icon.
  - Expanded state: Full `EventCard` view with `[ ▲ ]` collapse icon.
  - Header control: Retro toggle button `[ ▲ / ▼ ]` to Expand All or Collapse All active events.
- **Archived Events**:
  - Filter and group all `status === 'archived'` events by start year (extracted from `startDate`, e.g. `2026`, `2025`).
  - Sort years descending.
  - Collapsible year accordion panels (e.g., `📁 2026 ARCHIVED EVENTS (4)`).
  - Inside each year panel, individual archived events display as collapsible name bars that expand to full cards on click.

### 2.4 Unified 'SYNC NOW' Button
- **Component**: `web/src/features/events/EventCard.tsx`.
- **Behavior**:
  - Remove separate `SYNC FORM` button.
  - Single `SYNC NOW` button:
    1. Executes `events.sync` (pulls responses from Google Sheets, updates members and attendance).
    2. Executes `events.syncFormSlots` (evaluates slot capacities and updates/closes Google Form).
    3. Invalidates queries: `events`, `members`, `attendance`, `sessions`.
    4. Displays combined outcome note (e.g. `Synced: +2 new, 1 updated · Google Form: Full House closed`).
    5. Disables during mutation with loading state `SYNCING…`.

### 2.5 Multi-Dancer Identity with Same Matric Number
- **Problem**: Multiple individuals (e.g. testing accounts or students sharing matric or matric typos) with the same matric number were collapsed into a single dancer in `buildMembers.ts`, overwriting older records and preventing alternate users from logging in.
- **Specification**:
  - **Fuzzy Name Matching**:
    - When processing a form row with `matricKey`:
      - If `matricKey` already exists in current batch or `memberIndex`:
        - Compare candidate name with existing member name using `nameSimilarity` / `levenshtein` from `api/src/logic/normalize.ts`.
        - **Case A: Name Variation (Minor)** (similarity >= 0.82 or 1-2 char difference):
          - Treat as the **SAME** dancer.
          - Merge styles and take the latest information.
          - If the name string differed in non-trivial ways, log an audit alert: `kind: 'name_variation'`, target: `matricKey`, detail: `Name variation "${oldName}" vs "${newName}"`.
        - **Case B: Distinct Dancers (Conflict)** (similarity < 0.82):
          - Treat as **SEPARATE** dancers.
          - Assign unique internal ID to the new dancer (e.g., `M-${matricKey}-${nameKey(fullName)}`), while keeping the original dancer as `M-${matricKey}` so existing historical data, attendance, and roles remain intact.
          - Both dancers store the exact same `matricRaw` and `matricKey` so public screens (rosters, profiles, cards) display their genuine matric.
          - Log an audit alert: `kind: 'matric_conflict'`, target: `matricKey`, detail: `Matric ${matricKey} shared by "${name1}" and "${name2}"`.
  - **Login Support (`auth.dancerLogin`)**:
    - Query `ctx.db.memberIndex` for all active entries with `m.matricKey === matricKey`.
    - If multiple dancers share `matricKey`, find the exact/best match on `fullNameMatches(inputFullName, m.fullName)`.
    - Allow each distinct person to authenticate into their own profile with their own name + matric.

### 2.6 'I · CHOOSE EVENT' Accordion with Year Grouping
- **Component**: `web/src/components/ui/EventStyleSteps.tsx` (`EventStep`).
- **Specification**:
  - Primary view displays active events in the dropdown (plus `ALL EVENTS` if `allowAll` is enabled).
  - Below the dropdown, render a collapsible retro section: `📁 ARCHIVED EVENTS (${archived.length}) [ ▼ ]`.
  - Expanding reveals year pills: `[ 2026 ]`, `[ 2025 ]`, `[ 2024 ]`.
  - Selecting a year displays buttons or an option list for events archived in that year.
  - Selecting an archived event sets `currentId` and highlights the choice.

### 2.7 Floating Notification Center (Retro Drawer)
- **Component**: `web/src/components/ui/NotificationWidget.tsx` embedded in `DesktopShell.tsx`.
- **Visuals & Interaction**:
  - Fixed floating circular/square retro pixel button at bottom-right (`fixed bottom-6 right-6 z-40`).
  - Displays retro pixel bell icon `🔔` with an unread/alert count badge (neon red if errors/conflicts exist, neon gold otherwise).
  - Clicking toggles a full-height retro cyberpunk side drawer (`SideDrawer` style with dark backdrop).
- **Three Tabs**:
  1. **Tab 1: `NEW DANCERS`**:
     - Lists dancers imported within the last 14 days across all active events.
     - Displays dancer name, matric, event name, styles enrolled, and registration timestamp.
     - Search / filter input for quick lookup.
  2. **Tab 2: `SLOT PROGRESS`**:
     - Visualizes capacity for every active event and dance style.
     - Shows custom pixel progress bar (`[████████░░░] 73%`), slots filled / total slots, remaining available slots pill.
     - Status badges: `AVAILABLE` (green), `ALMOST FULL` (gold), `FULL HOUSE` (red).
  3. **Tab 3: `SYSTEM & AUDIT`**:
     - Categorized alerts and audit history:
       - **Matric Conflicts**: Instances where two different names share a matric number.
       - **Name Variations**: Small typos / spacing variations merged into existing profiles.
       - **Sync & System Errors**: Form sync errors, missing folder warnings, drive permissions.
       - **Profile & Role Updates**: Recent edits from `AuditLog`.
     - Action buttons: "Dismiss" or "Mark as reviewed" stored in local browser state.

---

## 3. Architecture & Data Flow

```
[Google Form Responses]
         │
         ▼
[events.sync (Backend)]
         │
         ├──> buildMembers (Fuzzy Name Check)
         │        ├── Similar Name: Merge + Audit 'name_variation'
         │        └── Distinct Name: Split Internal ID + Audit 'matric_conflict'
         │
         └──> syncGoogleFormSlotChoices
                  ├── Single Style: Check activeCount >= cap -> Close Form (Full House)
                  └── Multi-Style: Check choices & gating -> Close Form or Filter Choices
```

```
[Web Admin Shell]
         ├── DesktopShell
         │        ├── Sidebar
         │        ├── Page Content (EventsPage, Attendance, etc.)
         │        └── Floating Notification Widget (bottom-right)
         │                 ├── Tab 1: New Dancers
         │                 ├── Tab 2: Slot Progress
         │                 └── Tab 3: System & Audit (Conflicts & Changes)
```

---

## 4. Verification & Testing Strategy

1. **Unit Tests (Vitest - `api`)**:
   - `buildMembers.test.ts`: Verify fuzzy name matching splits distinct names with same matric into separate members and merges minor name variations.
   - `auth.test.ts`: Verify two dancers sharing a matric can each log in with their respective names.
   - `formGating.test.ts`: Verify single-style event auto-closes without style question when capacity is reached.
2. **Component Tests (Vitest - `web`)**:
   - `EventsPage.test.tsx`: Test accordion expand/collapse and year-based grouping.
   - `EventCard.test.tsx`: Test unified `SYNC NOW` triggering both sheet and form sync.
   - `EventStyleSteps.test.tsx`: Test archived events year-grouped accordion.
   - `NotificationWidget.test.tsx`: Test floating button, drawer toggle, and tab switches.
3. **End-to-End Tests (Playwright - `web/e2e`)**:
   - Run `web/e2e/admin-events.spec.ts` to ensure event management and sync actions succeed cleanly.
