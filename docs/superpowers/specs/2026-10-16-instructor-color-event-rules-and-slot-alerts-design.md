# Instructor Colors, Event Class Rule & Slot Capacity Alert Emails Design

- **Date:** 2026-10-16
- **Status:** Approved by Owner
- **Author:** Antigravity & Club Admin

---

## 1. Overview & Goals

This specification resolves two critical visual & data flow issues and introduces two new business rules to the UMDSC Dance Class System:

1. **Instructor Signature Colors on Calendars & Class Cards**:
   - Dance styles do not have distinct colors; **instructors have their own signature colors** (configured in *Master Data › Instructors* with `ColorSwatchPicker`).
   - Fix Calendar markers, Class Badges, and Class Cards across Admin Mode (`ClassesPage`, `TodayPage`) and Dancer Mode (`DancerHome`, `ClassCard`) so they render using the resolved instructor's signature color instead of falling back or using dance style colors.
   - Support hex codes (e.g. `#FF5500`) and standard tokens in color utilities.
   - Correct query cache invalidation (`queryKey: ['bootstrap']`) on style and instructor edits.

2. **Dancer Mode Event Visibility Clarification**:
   - Dancers only see events and classes for which they have registered (via Google Form submission and sync).
   - Clarify this expected behavior and ensure that once a dancer is registered and synced for an event, all classes with the instructor's signature color appear correctly on the Dancer Calendar.

3. **Compulsory Minimum 1 Class per Selected Dance Style in Add/Edit Event**:
   - In the Event Wizard (Step 4: Schedule and Step 5: Review) and backend API (`events.create`, `events.update`), enforce that every selected dance style has **at least 1 scheduled class**.
   - Block progression (`NEXT` / `CREATE EVENT` / `SAVE CHANGES` disabled) and reject API requests with validation errors if any selected style has 0 classes.

4. **Compulsory Slot Capacity per Dance Style & Automated Full Slot Alerts**:
   - In the Event Wizard (Step 3: Dance Styles), require a compulsory positive number of slots for each selected dance style.
   - Slot numbers remain internal for email alerts only (not displayed on Event cards per owner decision).
   - During Google Form response sheet sync (`events.sync` / `events.autoSync`), the system tallies the number of enrolled dancers for each style.
   - When a style reaches or exceeds its slot capacity, an alert email is sent **once** via `ctx.mail.sendEmail` to:
     - **Club Admin**: `clubEmail` (Settings) and all Admin accounts with email usernames.
     - **Class Lead**: `DanceStyle.videoUploaderEmail`.
   - The email notifies them that the style's slots are full, while noting that additional dancers may still register.

---

## 2. Technical Architecture & Data Models

### 2.1 Database & Schema Changes (`api/src/db/schema.ts`, `shared/src/types.ts`)

#### Table `Events`
Add two internal fields:
- `styleSlotsJson`: JSON string mapping `styleId -> number` (e.g. `{"st_freestyle": 30}`).
- `notifiedFullStyles`: comma-separated or JSON list of style IDs for which a slot-full alert has already been sent (e.g. `["st_freestyle"]`), ensuring emails are only sent once when capacity is reached.

#### `shared/src/types.ts`
```typescript
export interface EventItem extends RowMeta {
  // ... existing fields
  styleSlots?: Record<string, number>;
  styleSlotsJson?: string;
  notifiedFullStyles?: string[];
}
```

### 2.2 Instructor Signature Color Resolution & Propagation

#### Color Utility (`web/src/theme/colors.ts`)
Update `getStyleColor` (and export helper `getInstructorColor`):
```typescript
export function getStyleColor(colorKey?: string): string {
  if (!colorKey) return 'var(--c-ink)';
  if (colorKey.startsWith('#')) return colorKey;
  return STYLE_COLOR[colorKey.toLowerCase()] || `var(--c-${colorKey.toLowerCase()})` || 'var(--c-ink)';
}

export function getInstructorColor(instructor?: Partial<Instructor> | null): string {
  if (!instructor?.color) return 'var(--neon-orange)';
  return getStyleColor(instructor.color);
}
```

#### Admin Calendar & Classes (`web/src/features/classes/ClassesPage.tsx`)
- In `calendarMarks`:
  ```typescript
  const inst = resolveInstructor(s, style, instructors);
  const colorKey = inst?.color || 'orange';
  ```
- In `colorOf(s: ClassSession)`:
  ```typescript
  const inst = resolveInstructor(s, style, instructors);
  return getInstructorColor(inst);
  ```

#### Dancer Calendar (`web/src/features/calendar/DancerHome.tsx` & `ClassCard.tsx`)
- In `DancerHome.tsx` `calendarMarks`:
  ```typescript
  const inst = resolveInstructor(session, style, instructors);
  const colorKey = inst?.color || 'orange';
  ```
- In `ClassCard.tsx`:
  Use the resolved instructor's color for the header accent and badge border.

#### Cache Invalidation Fix (`web/src/features/masterdata/InstructorsPage.tsx` & `StylesPage.tsx`)
Change `queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] })` to:
```typescript
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['instructors'] }),
  queryClient.invalidateQueries({ queryKey: ['styles'] }),
  queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
]);
```

---

## 3. Business Rules Implementation

### 3.1 Minimum 1 Class per Selected Dance Style

#### Frontend (`web/src/features/events/steps/ScheduleStep.tsx`)
- Compute `emptyStyles = draft.styleIds.filter(id => (draft.schedule[id] || []).length === 0)`.
- If `emptyStyles.length > 0`:
  - Disable the `NEXT` button.
  - Display alert: `"Every selected dance style must have at least 1 class. Schedule classes for: {names}"`.

#### Frontend (`web/src/features/events/steps/ReviewStep.tsx`)
- Disable `CREATE EVENT` / `SAVE CHANGES` if `emptyStyles.length > 0`.

#### Backend (`api/src/features/events.ts`)
- In `events.create` and `events.update`:
  ```typescript
  const sessionsByStyle = new Set(sessions.map(s => s.styleId));
  const missingStyles = styleIds.filter(id => !sessionsByStyle.has(id));
  if (missingStyles.length > 0) {
    const names = missingStyles.map(id => ctx.db.styles.find(s => s.id === id)[0]?.name || id);
    throw new AppError('VALIDATION', `Each selected dance style must have at least one scheduled class. Missing: ${names.join(', ')}`);
  }
  ```

---

### 3.2 Compulsory Slot Capacity & Automated Alert Emails

#### Event Wizard (`web/src/features/events/steps/StylesStep.tsx`)
- For each selected dance style, render a compulsory number input:
  - Label: `SLOT CAPACITY (COMPULSORY)`
  - Value: `draft.styleSlots[s.id] || ''`
  - Validation: Positive integer >= 1.
- Disable `NEXT` until every selected style has a valid positive integer slot count.

#### Backend Slot Detection & Alert Dispatch (`api/src/features/eventImport.ts`)
- When `importEventMembers(ctx, event, options)` runs:
  - Tally member enrollment per style: `countsByStyle: Record<string, number>`.
  - Parse `styleSlots = JSON.parse(event.styleSlotsJson || '{}')`.
  - Parse `notifiedStyles = new Set(JSON.parse(event.notifiedFullStylesJson || '[]'))`.
  - For each `styleId` in `event.styleIds`:
    - `capacity = styleSlots[styleId]`.
    - `enrolled = countsByStyle[styleId] || 0`.
    - If `capacity > 0 && enrolled >= capacity && !notifiedStyles.has(styleId)`:
      - Send alert email via `ctx.mail.sendEmail`.
      - Add `styleId` to `notifiedStyles`.
  - If any new styles were notified, update `event.notifiedFullStylesJson` in `ctx.db.events`.

#### Alert Email Recipients & Content
- **Recipients**:
  - Club Email: `ctx.db.settings.find(s => s.key === 'clubEmail')[0]?.value || ctx.clubEmail`.
  - Admins: All `ctx.db.admins.find(a => a.active)` where `a.username` contains `@`.
  - Class Lead: `style.videoUploaderEmail` for that specific style.
- **Subject**: `[UMDSC Alert] Slot Full - {Event Name} ({Style Name})`
- **Body**:
  ```text
  Hi Admin and Class Lead,

  This is an automated notification that the slots for {Style Name} in {Event Name} have reached capacity.

  - Event: {Event Name}
  - Dance Style: {Style Name}
  - Slot Capacity: {Capacity}
  - Current Enrolled: {Enrolled Count} dancers

  The event will continue to accept further registrations if new dancers sign up. Please coordinate if you need to adjust venues, class leaders, or close the Google Form.

  Universiti Malaya Dance Sport Club (UMDSC)
  ```
- **HTML Body**: Clean notification template styled with UMDSC branding.

---

## 4. Testing & Verification Plan

1. **Unit Tests**:
   - `web/src/theme/colors.test.ts`: Test hex color passthrough in `getStyleColor` and `getInstructorColor`.
   - `web/src/features/events/eventDraft.test.ts`: Validate that `emptyStyles` properly flags styles with 0 classes and requires positive `styleSlots`.
   - `api/test/features/events.test.ts`: Verify `events.create` rejects events where any selected style has 0 classes.
   - `api/test/features/eventImport.test.ts`: Verify slot-full email alert is dispatched once to admins and class lead when capacity is reached, and not re-sent on subsequent syncs.

2. **UI & End-to-End Playwright Tests (`webapp-testing`)**:
   - Verify that changing instructor color updates the calendar marker in Admin Calendar (`ClassesPage`).
   - Verify that Event Wizard enforces slot capacity input and blocks proceeding without at least 1 class per style.
   - Verify Dancer Calendar correctly renders instructor signature color for enrolled classes.
