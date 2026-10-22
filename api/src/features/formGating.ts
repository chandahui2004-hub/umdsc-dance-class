import { Ctx, FormInstancePort } from '../ports';
import { EventItem, Member } from '@umdsc/shared';
import { readEventMembers } from './eventMembers';
import { REMOVED_FLAG } from './eventImport';

export const FULL_HOUSE_CLOSED_MESSAGE =
  'Sorry, we have reached FULL HOUSE for this event! Registration is now closed to prevent over-registration. Thank you for your interest and support! Keep dancing! — Universiti Malaya Dance Sport Club (UMDSC)';

export interface FormGatingResult {
  synced: boolean;
  formId?: string;
  formClosed: boolean;
  formClosedManually?: boolean;
  fullStyleIds: string[];
  availableStyleIds: string[];
  remainingChoices?: string[];
  discoveredStyleIds?: string[];
  message?: string;
}

/**
 * Two-way Google Form Synchronization and Slot Gating:
 * 1. Pull / Auto-Discovery: Reads choices directly from Google Form. If the admin added
 *    new style options in Google Forms, maps them to master data and automatically updates
 *    event.styleIds so the admin never has to do double work.
 * 2. Manual Closure Protection: Detects if the admin turned off "Accepting responses" directly
 *    in Google Forms and respects that closure (never re-opens an admin-closed form).
 * 3. Dynamic Choice Removal: Removes styles that reached slot limits and updates question help notice.
 * 4. Full House Auto-Closure: Closes the form with a polite message when all styles or a single-style event fills up.
 * 5. Auto Re-Opening: Automatically re-opens the form if capacity is increased or cancellations occur
 *    (only if the closure was due to full house).
 */
export function syncGoogleFormSlotChoices(
  ctx: Ctx,
  event: EventItem,
  providedMembers?: Member[]
): FormGatingResult {
  if (!ctx.form) {
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'No form port available on context'
    };
  }

  // Find linked form URL or ID
  const rawForm = event.formId || event.formUrl || (event.sourceSheetId ? ctx.form.getFormUrl(event.sourceSheetId) : null);
  const match = (rawForm || '').match(/\/forms\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  const formTarget = (match ? match[1] : null) || event.formId || rawForm;

  if (!formTarget) {
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'No Google Form linked to event'
    };
  }

  let form: FormInstancePort | null = null;
  try {
    form = ctx.form.openForm(formTarget);
  } catch (err) {
    console.warn(`[syncGoogleFormSlotChoices] Failed to open form ${formTarget}:`, err);
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: `Failed to open Google Form: ${err}`
    };
  }

  if (!form) {
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: `Google Form could not be found at ${formTarget}`
    };
  }

  // 1. Two-Way Sync / Auto-Discovery: Inspect Google Form question choices
  const question = form.getStyleQuestion();
  const discoveredStyleIds: string[] = [];
  const currentStyleIds = new Set(event.styleIds || []);

  if (question && question.choices.length > 0) {
    const allActiveStyles = ctx.db.styles.find(s => s.active);
    const lettersOnly = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const rawChoice of question.choices) {
      const choice = rawChoice.trim();
      if (!choice) continue;

      // Try exact name or alias match
      let matched = allActiveStyles.find(
        s => s.name.toLowerCase() === choice.toLowerCase() ||
             (s.aliases || []).some(a => a.toLowerCase() === choice.toLowerCase())
      );

      // Try letters-only match
      if (!matched) {
        const choiceNorm = lettersOnly(choice);
        matched = allActiveStyles.find(
          s => lettersOnly(s.name) === choiceNorm ||
               (s.aliases || []).some(a => lettersOnly(a) === choiceNorm)
        );
      }

      if (matched) {
        if (!currentStyleIds.has(matched.id)) {
          currentStyleIds.add(matched.id);
          discoveredStyleIds.push(matched.id);
        }
      } else {
        // Style does not exist in master data yet -> auto-create it in master data
        const slug = lettersOnly(choice) || 'style';
        const newStyleId = 'st_' + slug;
        const existing = ctx.db.styles.find(s => s.id === newStyleId)[0];
        const finalId = existing ? `${newStyleId}_${Date.now() % 10000}` : newStyleId;

        try {
          ctx.db.styles.insert({
            id: finalId,
            name: choice,
            aliases: [choice.toLowerCase()],
            colorKey: 'cyan',
            active: true,
            defaultWeekday: null,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: '',
            defaultVenue: '',
            attendanceFolderId: '',
            videoFolderId: ''
          } as any, 'form-sync', ctx.now());

          currentStyleIds.add(finalId);
          discoveredStyleIds.push(finalId);
        } catch (insertErr) {
          console.warn(`[syncGoogleFormSlotChoices] Failed to auto-create style ${choice}:`, insertErr);
        }
      }
    }

    // Persist discovered styles onto event in database
    if (discoveredStyleIds.length > 0) {
      const nextStyleIds = Array.from(currentStyleIds);
      event.styleIds = nextStyleIds;
      const currentSlots = event.styleSlots || (event.styleSlotsJson ? JSON.parse(event.styleSlotsJson) : {});
      event.styleSlots = currentSlots;
      event.styleSlotsJson = JSON.stringify(currentSlots);

      try {
        ctx.db.events.update(event.id, event.version, {
          styleIds: nextStyleIds,
          styleSlots: currentSlots,
          styleSlotsJson: event.styleSlotsJson
        }, 'form-sync', ctx.now());
        const fresh = ctx.db.events.get(event.id);
        if (fresh) {
          event.version = fresh.version;
        }
      } catch (updateErr) {
        console.warn(`[syncGoogleFormSlotChoices] Failed to update event with discovered styles:`, updateErr);
      }
    }
  }

  // 2. Evaluate member enrollment per style
  const members = providedMembers || (event.membersSpreadsheetId ? readEventMembers(ctx, event) : []);
  const activeMembers = members.filter(
    m => !(m.flags || []).includes('removed') && !(m.flags || []).includes(REMOVED_FLAG)
  );

  const slotCapacity = event.styleSlots || (event.styleSlotsJson ? JSON.parse(event.styleSlotsJson) : {});
  const styleIds = event.styleIds || [];

  const fullStyleIds: string[] = [];
  const availableStyleIds: string[] = [];

  for (const styleId of styleIds) {
    const cap = Number(slotCapacity[styleId]);
    if (cap > 0) {
      const enrolledCount = (styleIds.length === 1)
        ? activeMembers.length
        : activeMembers.filter(m => (m.styleIds || []).includes(styleId)).length;

      if (enrolledCount >= cap) {
        fullStyleIds.push(styleId);
      } else {
        availableStyleIds.push(styleId);
      }
    } else {
      // No capacity limit specified -> always available
      availableStyleIds.push(styleId);
    }
  }

  // 3. Check if Full House:
  // - Single-style event and that style is full
  // - Multi-style event and ALL configured styles with cap are full (no available styles remaining)
  const isFullHouse = (styleIds.length === 1 && fullStyleIds.length === 1) ||
    (styleIds.length > 1 && availableStyleIds.length === 0 && fullStyleIds.length > 0);

  if (isFullHouse) {
    try {
      form.setAcceptingResponses(false);
      form.setCustomClosedFormMessage(FULL_HOUSE_CLOSED_MESSAGE);
    } catch (err) {
      console.warn(`[syncGoogleFormSlotChoices] Failed to close form ${form.getId()}:`, err);
    }

    return {
      synced: true,
      formId: form.getId(),
      formClosed: true,
      formClosedManually: false,
      fullStyleIds,
      availableStyleIds: [],
      remainingChoices: [],
      discoveredStyleIds
    };
  }

  // 4. Not Full House: Check if form was manually closed by admin in Google Forms
  let formClosedManually = false;
  try {
    const isCurrentlyAccepting = form.isAcceptingResponses();
    if (!isCurrentlyAccepting) {
      const currentClosedMsg = form.getCustomClosedFormMessage();
      if (currentClosedMsg === FULL_HOUSE_CLOSED_MESSAGE) {
        // Previously closed by system for full house, but now capacity expanded: re-open it!
        form.setAcceptingResponses(true);
        form.setCustomClosedFormMessage('');
      } else {
        // Admin manually turned off responses in Google Forms: respect and preserve!
        formClosedManually = true;
      }
    }
  } catch (err) {
    console.warn(`[syncGoogleFormSlotChoices] Failed to check accepting state on form ${form.getId()}:`, err);
  }

  // 5. Manage choices on the style question
  let remainingChoices: string[] = [];

  if (question) {
    // Map style IDs to style names & aliases
    const styleInfoMap = new Map<string, { id: string; name: string; aliases: string[] }>();
    for (const sid of styleIds) {
      const s = ctx.db.styles.find(st => st.id === sid && st.active)[0];
      const name = s?.name || sid;
      const aliases = (s?.aliases || []).map(a => a.toLowerCase());
      styleInfoMap.set(sid, { id: sid, name, aliases });
    }

    const matchChoiceToStyleId = (choiceText: string): string | null => {
      const trimmed = choiceText.trim().toLowerCase();
      for (const [sid, info] of styleInfoMap.entries()) {
        if (trimmed === info.name.toLowerCase() || info.aliases.some(a => trimmed === a || trimmed.includes(a))) {
          return sid;
        }
      }
      return null;
    };

    const availableStyleNames = availableStyleIds.map(sid => styleInfoMap.get(sid)?.name || sid);

    // Filter question choices:
    // Drop full styles. Keep available styles and unrecognized choices.
    const filteredChoices = question.choices.filter(choice => {
      const matchedSid = matchChoiceToStyleId(choice);
      if (!matchedSid) return true;
      return availableStyleIds.includes(matchedSid);
    });

    // Ensure all available styles are present in choices
    const choiceNamesLower = new Set(filteredChoices.map(c => c.trim().toLowerCase()));
    for (const availName of availableStyleNames) {
      if (!choiceNamesLower.has(availName.trim().toLowerCase())) {
        filteredChoices.push(availName);
      }
    }

    remainingChoices = filteredChoices;

    // Compose help text notice
    let helpNotice = '';
    if (fullStyleIds.length > 0) {
      const fullNames = fullStyleIds
        .map(sid => styleInfoMap.get(sid)?.name || sid)
        .join(', ');
      helpNotice = `⚠️ Note: [${fullNames}] ${fullStyleIds.length === 1 ? 'has' : 'have'} reached maximum capacity and ${fullStyleIds.length === 1 ? 'is' : 'are'} closed for registration. Please select from the remaining available styles.`;
    }

    try {
      form.setChoices(question.id, remainingChoices, helpNotice);
    } catch (err) {
      console.warn(`[syncGoogleFormSlotChoices] Failed to update choices on form ${form.getId()}:`, err);
    }
  }

  return {
    synced: true,
    formId: form.getId(),
    formClosed: formClosedManually,
    formClosedManually,
    fullStyleIds,
    availableStyleIds,
    remainingChoices,
    discoveredStyleIds
  };
}
