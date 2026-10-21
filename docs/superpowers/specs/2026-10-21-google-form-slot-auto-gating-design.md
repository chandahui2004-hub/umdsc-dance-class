# Design Spec: Automated Google Form Slot Gating & Dynamic Choice Management

**Date:** 2026-10-21  
**Status:** Approved  
**Author:** Antigravity & UMDSC Team  

---

## 1. Overview & Objectives

In dance workshop and monthly class events, each dance style has a specific maximum slot capacity based on studio space (e.g. 30 slots for Hip Hop, 25 for Popping). Currently, when a dance style reaches its capacity, the system detects this and sends alert emails to administrators, but the Google Form continues accepting selections for full styles unless manually edited by a club admin.

This specification defines the automated integration between the UMDSC Dance Class System and Google Forms via the Google Apps Script `FormApp` API to:
1. **Remove full dance style choices** from the live Google Form checkbox question so dancers cannot select full styles.
2. **Display dynamic slot status notes** in the question description (e.g., `⚠️ Note: [Hip Hop] has reached maximum capacity and is closed for registration.`).
3. **Automatically close the Google Form** when a single-style event is full or when all styles in a multi-style event reach capacity ("Full House"), displaying a custom friendly closure message.
4. **Auto-heal & re-arm**: Automatically restore choices and re-open the form if slot limits are increased or dancers cancel.

---

## 2. Form Discovery & Linkage Architecture

The Google Form is managed and owned by the club Google account (`umdancesportc@gmail.com`), which also runs the Google Apps Script backend.

### 2.1 Resolution Hierarchy
To locate the exact Google Form for an event:
1. **Primary Auto-Discovery**: Google Apps Script's `SpreadsheetApp.openById(event.sourceSheetId).getFormUrl()` directly retrieves the edit/view URL of the linked Google Form from the response spreadsheet.
2. **Explicit Property**: An optional `formUrl` / `formId` field in `EventItem` allows admins to provide a direct Google Form URL or ID if auto-discovery is unavailable or detached.
3. **Form Adapter (`FormPort`)**: An abstraction port `FormPort` allows unit testing without live Google FormApp network dependencies, while `GasFormAdapter` implements real calls using `FormApp.openById` / `FormApp.openByUrl`.

---

## 3. Dynamic Choice & Question Management Logic

### 3.1 Style Question Identification
The system inspects items on the form to locate the dance styles question:
* Filters for items of type `FormApp.ItemType.CHECKBOX` or `FormApp.ItemType.MULTIPLE_CHOICE`.
* Identifies the target question by matching:
  - Title keywords: `"class"`, `"style"`, `"dance"`, `"workshop"`, or
  - Option values that match known style names / aliases in `event.styleIds` via `matchStyle`.

### 3.2 Multi-Style Events: Option Removal
When an event has multiple dance styles (e.g., Hip Hop, Popping, Locking, Latin):
1. **Capacity Evaluation**: Compares enrolled active members (`enrolledCount`) against `styleSlots[styleId]`.
2. **Choice Filtering**:
   - Dance styles with `enrolledCount >= cap` are **removed** from the question choices.
   - Available styles remain selectable.
3. **Question Description / Help Text**:
   - If one or more styles are full, sets the question description:
     `"⚠️ Note: [Hip Hop] has reached maximum capacity and is closed for registration. Please select from the remaining available styles."`
   - If multiple styles are full: lists all full styles:
     `"⚠️ Note: [Hip Hop, Locking] have reached maximum capacity and are closed for registration."`
   - If all styles are available: restores default or blank description.
4. **Form Status**: The form remains **accepting responses** (`form.setAcceptingResponses(true)`).

### 3.3 Single-Style Event OR All Styles Full: Full House Form Closure
When a single-style event reaches capacity, OR when every style in a multi-style event has reached capacity:
1. **Close Form**: Calls `form.setAcceptingResponses(false)`.
2. **Custom Message**: Sets `form.setCustomClosedFormMessage(...)`:
   > *"Sorry, we have reached FULL HOUSE for this event! Registration is now closed to prevent over-registration. Thank you for your interest and support! Keep dancing! — Universiti Malaya Dance Sport Club (UMDSC)"*

### 3.4 Auto-Reopening & Re-arming
If an administrator increases the slot limit (e.g., 30 → 40) or dancers cancel / are removed:
1. If the form was previously closed due to full house, calls `form.setAcceptingResponses(true)`.
2. Re-inserts the newly available style(s) into the checkbox choices.
3. Updates or clears the question help text.

---

## 4. Execution Triggers & Data Flow

Automated form gating executes at three lifecycle points:
1. **Form Response Import / Background Sync** (`importEventMembers`, `events.sync`, `events.autoSync`): Whenever new responses are imported, slot capacity is evaluated and the form is updated immediately if any style crosses the capacity threshold.
2. **Event Slot Update** (`events.update`): When an admin adjusts slot numbers in the Event Editor modal, the Google Form is updated instantly.
3. **Manual Sync Action** (`events.syncFormSlots`): An explicit admin route to trigger form synchronization and inspect status.

---

## 5. Security, Isolation & Error Handling

* **Graceful Degradation**: If the Google Form cannot be found, is unlinked, or Google Forms API throws a transient error, the error is logged as a warning, and member sync / attendance operations continue uninterrupted without failing dancer registrations.
* **Script Locking**: Form updates are wrapped with `withScriptLock` alongside spreadsheet writes to prevent race conditions during rapid simultaneous submissions.
* **Audit Logging**: Every automated form modification (closing form, removing choice, re-opening) is recorded in `ctx.db.auditLog`.
