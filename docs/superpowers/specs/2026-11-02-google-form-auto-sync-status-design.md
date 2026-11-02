# Design Spec: Google Form Bidirectional Auto-Sync & Real-Time Open/Closed Status

**Date:** 2026-11-02  
**Status:** In Review (Brainstorming Complete)  
**Author:** Antigravity & UMDSC Team  

---

## 1. Executive Summary & Objectives

In the UMDSC Dance Class System, events link to Google Forms for dancer registration. Currently, the system can close a Google Form when slot capacity is reached ("Full House"), but:
1. If an administrator manually toggles "Accepting responses" ON or OFF directly in Google Forms, the website has no live visibility of this state.
2. The website does not display a clear status indicator showing whether registration is currently **OPEN** or **CLOSED**.
3. Periodic automatic synchronization checks Google Sheets for new response rows every 1-10 minutes, but does not poll Google Forms for accepting response status.
4. If an admin re-opens a Google Form to allow late registrations, previous logic could potentially force the form back to closed if the dancer count remained high.

### Key Objectives
1. **Bidirectional Status Sync**: Poll Google Forms `isAcceptingResponses()` every 10 minutes and reflect the live state on the website.
2. **Real-Time Website Badging**: Prominent retro 8-bit neon badge on Admin Event Cards (`[● FORM OPEN]` in neon green vs `[✖ FORM CLOSED]` in neon red) next to the `FORM ↗` link.
3. **Admin Intent Precedence**: If an admin manually opens the form in Google Forms, the system respects the manual open state and does not auto-close it, even if dancer count is high.
4. **Hybrid 10-Minute Engine**:
   - Google Apps Script 10-minute trigger for standalone server-side sync (runs even when no browser is open).
   - Frontend periodic background sync in `useEventAutoSync` (every 10 minutes and on tab visibility) with automatic query invalidation on status change.

---

## 2. Architecture & Data Model

### 2.1 Event Schema Updates (`@umdsc/shared` and `Events` Table)
Add `formClosed` and `formClosedAt` to `EventItem`:
```ts
export interface EventItem extends RowMeta {
  // Existing fields ...
  formUrl?: string;
  formId?: string;
  formClosed?: boolean;        // true = form is closed; false/undefined = form is open
  formClosedAt?: string;       // ISO timestamp when form was detected closed
  formClosedReason?: 'manual' | 'capacity' | 'none';
}
```

### 2.2 Google Form State Resolution Hierarchy
When querying form status:
1. Call `form.isAcceptingResponses()` via `FormInstancePort`.
2. If `form.isAcceptingResponses() === false`:
   - `formClosed = true`.
   - `formClosedReason`: check `form.getCustomClosedFormMessage()`. If matching `FULL_HOUSE_CLOSED_MESSAGE`, reason is `'capacity'`; otherwise `'manual'`.
3. If `form.isAcceptingResponses() === true`:
   - `formClosed = false`.
   - `formClosedReason = 'none'`.
   - **Crucial Rule**: If the form is currently accepting responses, the system will **NOT** force-close it, even if dancer count >= slot limit. Admin manual re-opening overrides automated slot limits.

---

## 3. Synchronization Engine

### 3.1 Backend Route & Logic (`api/src/features/formGating.ts` & `events.ts`)
* **`checkEventFormStatus(ctx: Ctx, event: EventItem)`**:
  - Opens the form via `ctx.form.openForm(formTarget)`.
  - Checks `isAcceptingResponses()`.
  - Compares with stored `event.formClosed`.
  - If state changed:
    - Updates `Events` table with `{ formClosed, formClosedAt, formClosedReason }`.
    - Bumps `DATA_VERSION`.
    - Logs audit event: `events.formStatusChanged`.
* **Integration into `events.autoSync`**:
  - In addition to checking sheet rows, checks form status for all active events every 10 minutes (throttled by cache key `sync:formCheck:${event.id}`).
* **Google Apps Script Recurring Trigger**:
  - Time-driven trigger running every 10 minutes executing `syncFormStatusScheduled()`.

### 3.2 Frontend Live Reflection (`web/src/lib/useEventAutoSync.ts` & `EventCard.tsx`)
* When `events.autoSync` returns changes, query keys `['events']` and `['bootstrap']` are invalidated.
* `EventCard.tsx` renders a retro pixel badge:
  - If `event.formClosed`:
    ```tsx
    <span className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[var(--neon-red)] font-bold shadow-[1px_1px_0_var(--outline)] flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-red)] animate-pulse" />
      <span>FORM CLOSED</span>
    </span>
    ```
  - If not closed (open) and has form link:
    ```tsx
    <span className="px-2 py-0.5 border-2 border-[var(--outline)] bg-[var(--night-3)] font-display text-[12px] text-[#4ade80] font-bold shadow-[1px_1px_0_var(--outline)] flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
      <span>FORM OPEN</span>
    </span>
    ```
* Clicking `SYNC NOW` on any event runs both sheet sync and Google Form status check immediately.

---

## 4. Verification & Testing Plan

1. **Unit Tests (`api/test/features/formGating.test.ts`)**:
   - Detects when Google Form is manually closed and saves `formClosed: true` on event.
   - Detects when Google Form is re-opened and saves `formClosed: false`.
   - Respects re-opened Google Form even when member count exceeds capacity.
2. **Integration Tests (`api/test/features/events.test.ts`)**:
   - `events.autoSync` polls form status and bumps `DATA_VERSION` on change.
3. **Web UI Tests (`web/src/features/events/EventCard.test.tsx`)**:
   - Renders `FORM OPEN` neon green badge when `formClosed` is false.
   - Renders `FORM CLOSED` neon red badge when `formClosed` is true.
   - Renders live state after sync.

