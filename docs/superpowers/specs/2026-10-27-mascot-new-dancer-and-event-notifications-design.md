# Mascot Notification for New Dancers and Events Design Spec

**Date:** 2026-10-27  
**Status:** Approved via Grill-Me  
**Related Components:** `web/src/components/ui/NotificationWidget.tsx`, `web/src/components/ui/MascotAvatar.tsx`

## 1. Problem Statement
The floating mascot notification center currently fails to alert admins about newly registered dancers and newly added events:
1. `allMembers` query in `NotificationWidget.tsx` was restricted by `enabled: isOpen && isAdmin`, preventing the floating mascot badge from showing new dancer counts while the drawer is closed.
2. `sourceTimestamp` from Google Forms in Malaysia is formatted as `DD/MM/YYYY HH:mm:ss`. Standard `new Date(m.sourceTimestamp).getTime()` returns `NaN`, causing real Google Form dancer submissions to be completely discarded from the 14-day filter.
3. Newly created events (e.g., added via Event Wizard) and their existing registrants are not highlighted in the notification center.
4. Dancer notification cards did not display the event name to which the dancer registered.

## 2. Goals & Success Criteria
- **7-Day Activity Window:** Highlight all dancers who registered within the last 7 days, as well as newly added events created within the last 7 days.
- **New Events Announcement Banner:** Highlight newly added events at the top of the "NEW DANCERS" tab with event name, type, dates, and registered dancer count.
- **New Event Pre-Registered Dancers:** When a newly added event is created with pre-registered dancers (from its connected Google Sheet), all its dancers are included in the new dancer list and count.
- **Robust Malaysian Timestamp Parsing:** Support `DD/MM/YYYY`, `YYYY-MM-DD`, and ISO formats with day/month heuristics so no dancers are dropped due to `NaN` date errors.
- **Informative Dancer Cards:** Each dancer card in the notification drawer clearly displays Full Name, Matric Number, Event Name, formatted Registration Date/Time, and Enrolled Style badges.
- **Live Background Mascot Badge:** Query runs in background while admin is signed in, with 60-second auto-refresh and cache reactivity, so the mascot avatar badge displays the notification count immediately.

## 3. Architecture & Implementation Details

### 3.1 Robust Timestamp Parsing Helper (`parseFlexibleTimestamp`)
A utility function in `web/src/lib/time.ts` (or local helper):
- Parses `DD/MM/YYYY HH:mm:ss`, `D/M/YYYY H:mm:ss`, `YYYY-MM-DD`, and ISO strings.
- Disambiguates day and month when one exceeds 12.
- Returns timestamp in milliseconds, or `null` if invalid.
- Helper `formatRegistrationDate(raw?: string | null): string` formats valid dates cleanly as `DD/MM/YYYY, HH:mm` (or `DD/MM/YYYY`).

### 3.2 Identifying New Events and Dancers
In `NotificationWidget.tsx`:
- `sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000`.
- **New Events:**
  - An event is considered new if `new Date(ev.updatedAt).getTime() >= sevenDaysAgo`.
  - Stored in `recentEvents: EventItem[]`.
- **New Dancers:**
  - A dancer is considered new if:
    1. Their `parseFlexibleTimestamp(m.sourceTimestamp) >= sevenDaysAgo`, OR
    2. They belong to a newly added event (`recentEventIds.has(m._eventId)`).
  - Deduplicated and sorted by timestamp descending.
- **Badge Count (`alertCount`):**
  - Includes `systemAlerts.length + recentDancers.length + recentEvents.length`.

### 3.3 Background Query & Cache Reactivity
- In `NotificationWidget.tsx`:
  - `enabled: isAdmin && activeEvents.length > 0` (removed `isOpen` restriction).
  - `refetchInterval: 60_000` (auto-refresh every 60s).
  - Uses queryKey `['notification_members', activeEvents.map(e => e.id).join(',')]`.
  - When `useEventAutoSync` detects changes, it automatically triggers background refetching.

### 3.4 UI Layout Updates in Notification Drawer (`adminTab === 'new_dancers'`)
1. **New Events Section (if `recentEvents.length > 0`):**
   - Rendered above the dancer list in an eye-catching retro cyberpunk card.
   - Shows: `🎉 NEW EVENT ADDED: {ev.name}`
   - Details: Type badge, dates (`{ev.startDate} to {ev.endDate}`), and `{ev.memberCount || eventDancers.length} registered dancers`.
2. **Search Input & Counter:**
   - Shows `{filteredDancers.length} recent dancers` and search filter.
3. **Dancer Item Card:**
   - Full Name (bold font-display).
   - Matric Key (neon cyan font-mono).
   - **Event Name Badge** (e.g. `🎪 {d._eventName}`).
   - Formatted Registration Date (`📅 {formatRegistrationDate(d.sourceTimestamp)}`).
   - Enrolled Style tags (neon gold badges).

## 4. Testing & Verification
1. **Unit Tests for Timestamp Parsing (`web/src/lib/time.test.ts` or helper tests):**
   - Verify parsing of `26/10/2026 21:04:12`, `5/10/2026 14:30:00`, `2026-10-26T21:04:12Z`, etc.
2. **Widget Tests (`web/src/components/ui/NotificationWidget.test.tsx`):**
   - Verify mascot avatar badge displays count while drawer is closed.
   - Verify newly added event renders in the announcement card with dancer count.
   - Verify dancers in newly added event appear in the list.
   - Verify dancer card displays Event Name, Matric, and formatted date.
   - Verify Malaysian format timestamps (`DD/MM/YYYY`) are recognized as within 7 days.
