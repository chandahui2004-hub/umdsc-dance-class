# Dancer Autocomplete, Self Profile Edit, and Walk-In Class Pass Design

## 1. Overview & Goals

This specification covers three major enhancements to the UMDSC Dance Class System:
1. **Dancer Login Autocomplete**:
   - As a dancer types in either the "Full Name" or "Matric Number" input on the login page (`TitleScreen`), automatically suggest the top 3 nearest registered dancers.
   - For security and PDPA compliance, the matric number is partially masked (e.g., `17••••34`).
   - If no close match exists, always fallback to showing the single closest dancer.
   - Tapping a suggestion fills in the Full Name and focuses the Matric Number field.
   - No Google account integration is used.
2. **Dancer Self-Edit Personal Information**:
   - Dancers can edit their Full Name and Matric Number directly from their `Me` profile page.
   - Updates propagate immediately across:
     - Google Form response sheets for all active registered events where the dancer is enrolled.
     - Event Members sheets and Attendance sheets (attendance ticks move with the dancer).
     - System database sheet (`MemberIndex`).
     - Audit log (`AuditLog`).
   - The user's active session is refreshed automatically with a newly signed token without requiring re-login.
3. **Walk-In Class Pass Mode**:
   - Every class session automatically possesses a unique, human-readable walk-in code (e.g., `LCK-7Q4F` or 6-8 alphanumeric characters).
   - Admins can view and copy the walk-in code on the calendar and class detail views, with an option to regenerate the code if needed.
   - On the login page, visitors can switch to **[ WALK-IN MODE ]**, enter the Class Code and their Name.
   - The system records the walk-in into a dedicated `Walk-ins` tab in that event style's Attendance Google Sheet.
   - The walk-in dancer receives permanent access (never expires) scoped exclusively to that single class session, its choreography recap videos, and practice music in the Studio.

---

## 2. Feature 1: Dancer Login Autocomplete

### 2.1 Backend Endpoint: `auth.suggestDancers`
- **Route**: `auth.suggestDancers`
- **Permission**: `public`
- **Write**: `false`
- **Payload**:
  ```ts
  interface SuggestPayload {
    query: string;
    type: 'name' | 'matric';
  }
  ```
- **Response**:
  ```ts
  interface SuggestionItem {
    fullName: string;
    matricMasked: string;
  }
  interface SuggestResponse {
    suggestions: SuggestionItem[];
  }
  ```

### 2.2 Matching Algorithm
- Read active entries from `ctx.db.memberIndex`.
- Filter out entries without an active status or with empty names/matrics.
- **When searching by name** (`type: 'name'`):
  - Minimum query length: 2 characters.
  - Calculate similarity score using `nameSimilarity(query, m.fullName)` and token prefix matching.
  - Sort candidates by descending similarity score.
  - Pick the top 3 matches. If all scores are low (< 0.2), still return the top 1 most similar candidate.
- **When searching by matric** (`type: 'matric'`):
  - Minimum query length: 3 characters.
  - Normalize query using `normalizeMatric(query)`.
  - Match by prefix or substring of `m.matricKey`.
  - Rank candidates by:
    1. Exact prefix match.
    2. Substring match.
    3. Levenshtein edit distance on matric numbers.
  - Pick the top 3 matches. If no match, return the 1 lowest edit distance candidate.

### 2.3 Matric Masking Format
- Matrics typically have 7-10 characters (e.g. `17201234` or `U2000123`).
- Mask rule: Show the first 2 characters and last 2 characters, replacing the middle with `••••` (e.g. `17••••34` or `U2••••23`).
- For short values (≤ 4 chars), show only the first and last character.
- Raw matric is never returned in the autocomplete payload to prevent full account enumeration.

### 2.4 Frontend UI (`TitleScreen.tsx`)
- Add retro-styled popover dropdown underneath the active input.
- Debounce API queries by 200ms.
- Dropdown displays up to 3 retro cards:
  ```
  ┌────────────────────────────────────────────────────────┐
  │ ★ SARAH BINTI AHMAD                     [ 17••••34 ]   │
  └────────────────────────────────────────────────────────┘
  ```
- Clicking / tapping a suggestion:
  - Sets `fullName` to the selected dancer's full name.
  - Closes the dropdown.
  - Automatically moves focus to the `Matric Number` input field.

---

## 3. Feature 2: Dancer Self-Edit Personal Information

### 3.1 Backend Endpoint: `members.selfEdit`
- **Route**: `members.selfEdit`
- **Permission**: `signedIn`
- **Write**: `true`
- **Bumps Data Version**: `true`
- **Payload**:
  ```ts
  interface SelfEditPayload {
    fullName?: string;
    matric?: string;
  }
  ```
- **Response**:
  ```ts
  interface SelfEditResponse {
    token: string;
    claims: TokenClaims;
    bootstrap: DancerBootstrap;
  }
  ```

### 3.2 Processing Logic
1. Validate that `auth.claims.role === 'dancer'`.
2. Extract current `matricKey = auth.claims.sub.replace(/^M-/, '')`.
3. Locate dancer record in `ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0]`.
4. Validate changes:
   - `fullName`: trimmed; cannot be empty.
   - `matric`: if provided, `newMatricKey = normalizeMatric(matric)`. Cannot be empty.
   - If `newMatricKey !== matricKey`:
     - Ensure `newMatricKey` does not already belong to another active dancer in `MemberIndex`. If so, throw `AppError('VALIDATION', 'Matric number already registered to another member')`.
5. Iterate through all active events in which this dancer is registered (`dancer.eventIds`):
   - For each active, unarchived event (not past retention):
     - Open source registration sheet tab via `openSourceTab(ctx, event.sourceSheetId, event.sourceTab)`.
     - Find rows matching the old `matricKey`.
     - Update name and/or matric in the Google Form response sheet (keeping plain-text formatting for matric).
     - Run `importEventMembers(ctx, event, { full: true })`. This:
       - Rewrites event Members sheet.
       - Replaces attendance sheet rows & moves all class ticks over to the new matric.
       - Updates `MemberIndex` with the new matric/name.
       - Updates cached indices.
6. Sign new JWT token:
   - `sub: 'M-' + newMatricKey`
   - `name: newFullName`
   - `perms: claims.perms`
   - `exp: now + 30 days`
7. Record in `AuditLog`:
   - Actor: `auth.claims.sub`
   - Action: `members.selfEdit`
   - Target: `newMatricKey`
   - Detail: `Dancer updated profile: "${oldName}" -> "${newName}", "${oldMatric}" -> "${newMatric}"`
8. Return new `{ token, claims, bootstrap }`.

### 3.3 Frontend UI (`MePage.tsx`)
- In the "MEMBER CARD" panel, add an `[ EDIT INFO ]` button.
- Clicking opens a retro dialog (`EditDancerDialog`):
  - Fields: `Full Name` and `Matric Number`.
  - Explanatory note: *"Editing your details updates all your registered event forms, attendance records, and login credentials."*
  - On Submit:
    - Calls `members.selfEdit`.
    - Updates local storage session via `session.set(res.token, res.claims, true)`.
    - Re-caches bootstrap data.
    - Shows success toast and updates the page state immediately.

---

## 4. Feature 3: Walk-In Class Pass Mode

### 4.1 Schema Update
- In `api/src/db/schema.ts`, extend `SCHEMA.ClassSessions`:
  ```ts
  ClassSessions: ['eventId', 'styleId', 'seq', 'date', 'start', 'end', 'instructorId', 'venue', 'status', 'note', 'walkInCode', ...COMMON_COLUMNS]
  ```
- In `shared/src/types.ts`:
  Add `walkInCode?: string;` to `ClassSession`.

### 4.2 Code Generation & Maintenance
- Code format: 6-7 uppercase alphanumeric characters with clear readability (excluding confusing characters like 0/O, 1/I), e.g., `LCK-7X9` or `8M4KP2`.
- When a `ClassSession` is created or loaded without a `walkInCode`, the system auto-generates a unique code and persists it.
- Admin route `sessions.regenerateWalkInCode` (`perm: 'sessions.edit'`, `write: true`):
  - Allows regenerating a new code if the previous one was leaked or needs refreshing.

### 4.3 Backend Endpoint: `auth.walkInLogin`
- **Route**: `auth.walkInLogin`
- **Permission**: `public`
- **Write**: `true`
- **Payload**:
  ```ts
  interface WalkInLoginPayload {
    code: string;
    name: string;
  }
  ```
- **Response**:
  ```ts
  interface WalkInLoginResponse {
    token: string;
    claims: TokenClaims;
    bootstrap: DancerBootstrap;
  }
  ```

### 4.4 Walk-In Login Processing
1. Validate `code` and `name`. Name must be non-empty.
2. Find session by `walkInCode` where `s.active === true`.
   - If not found, throw `AppError('NOT_FOUND', 'Invalid or inactive class code')`.
3. Log into Attendance Spreadsheet:
   - Find Attendance spreadsheet for `session.eventId` and `session.styleId`.
   - If spreadsheet exists, open it and check for tab `Walk-ins`.
   - If tab does not exist, create it with header: `['Timestamp', 'Dancer Name', 'Class Date', 'Session Seq', 'Class Code']`.
   - Append row: `[ctx.now().toISOString(), name.trim(), session.date, session.seq, code]`.
4. Issue permanent JWT Token:
   - `sub: 'W-' + session.id + '-' + encodeURIComponent(name.trim().toLowerCase())`
   - `role: 'dancer'`
   - `name: name.trim() + ' (Walk-In)'`
   - `exp: Math.floor(ctx.now().getTime() / 1000) + 10 * 365 * 24 * 3600` (Permanent / 10 years)
   - `perms`:
     ```ts
     {
       'calendar.view': [session.styleId],
       'videos.view': [session.styleId],
       'music.view': [session.styleId]
     }
     ```
5. Construct Walk-In `bootstrap`:
   - Scoped strictly to `session`:
     - `events`: the parent event summary.
     - `styles`: the single style for `session.styleId`.
     - `instructors`: instructor assigned to this session.
     - `sessions`: `[session]`
     - `videos`: videos matching `v.sessionId === session.id && v.active`.
     - `music`: music matching `m.sessionId === session.id && m.active`.
     - `sections`: sections for the above music items.
     - `attendance`: `[{ sessionId: session.id, present: true }]`.

### 4.5 Frontend UI
- **TitleScreen (`TitleScreen.tsx`)**:
  - Add a toggle or tab: `[ MEMBER LOGIN ]` | `[ WALK-IN PASS ]`.
  - When Walk-In Pass is active:
    - Input: `Class Code` (auto-uppercases, e.g. `LCK-7X9`).
    - Input: `Your Name` (e.g. `Alex Tan`).
    - Button: `[ ENTER CLASS ]`.
    - Submitting signs in and redirects to `/`.
- **Dancer Interface Adjustments**:
  - For walk-in tokens (`claims.sub.startsWith('W-')`):
    - Show badge: `WALK-IN PASS: [Style Name] Class #[Seq]`.
    - Calendar displays that single class prominently with a "WALK-IN CLASS" banner.
    - Music Studio & Media Player allow playing that class's music and videos.
    - Profile (`MePage.tsx`) shows Walk-In Pass details and a logout button.
- **Admin Interface (`ClassesPage.tsx` / `DaySheet.tsx`)**:
  - Display the `Walk-In Code: [ CODE ]` with a copy-to-clipboard button on every class card / modal.
  - Add small button to regenerate code if desired.

---

## 5. Security & Verification Strategy

1. **Information Leak Prevention**:
   - Autocomplete never reveals full matric numbers.
   - Autocomplete requires a minimum length before returning results.
2. **Data Integrity**:
   - All Google Sheet writes occur under `withScriptLock`.
   - Response sheets, Members sheets, and Attendance sheets remain 100% in sync.
   - Duplicate matric checks prevent identity collision.
3. **Automated Testing Suite**:
   - Unit tests for autocomplete matching & matric masking in `api/test/features/auth.test.ts`.
   - Unit tests for `members.selfEdit` in `api/test/features/members.test.ts`.
   - Unit tests for walk-in code generation, login, and bootstrap in `api/test/features/sessions.test.ts` and `api/test/features/auth.test.ts`.
   - Frontend tests for `TitleScreen` autocomplete & walk-in toggle, and `MePage` self-edit dialog.
