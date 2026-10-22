import { Ctx, FormInstancePort } from '../ports';
import { EventItem, Member } from '@umdsc/shared';
import { readEventMembers } from './eventMembers';
import { REMOVED_FLAG } from './eventImport';
import { extractGoogleFormId, isResponderFormLink } from '../logic/googleForm';

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

  // 1. Resolve form target. Must be an EDIT link or valid Google Form ID.
  const rawForm = event.formId || event.formUrl || (event.sourceSheetId ? ctx.form.getFormUrl(event.sourceSheetId) : null);

  // Check if only a responder (/d/e/...) link was provided
  if (isResponderFormLink(event.formUrl) && !extractGoogleFormId(event.formId)) {
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'Google Form edit link required (e.g. https://docs.google.com/forms/d/.../edit). Responder /viewform links cannot be edited by Google Apps Script.'
    };
  }

  const formTarget = extractGoogleFormId(rawForm) || (rawForm && !isResponderFormLink(rawForm) ? rawForm : null);

  if (!formTarget) {
    return {
      synced: false,
      formClosed: false,
      formClosedManually: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'No Google Form edit link linked to event'
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
    const cleanChoice = (str: string) =>
      str.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\bclasses?\b/gi, '').trim();

    for (const rawChoice of question.choices) {
      const choice = cleanChoice(rawChoice);
      if (!choice) continue;
      const choiceNorm = lettersOnly(choice);

      // Try exact name or alias match
      let matched = allActiveStyles.find(
        s => lettersOnly(s.name) === choiceNorm ||
             (s.aliases || []).some(a => lettersOnly(a) === choiceNorm)
      );

      // Try letters-only / substring match
      if (!matched) {
        matched = allActiveStyles.find(
          s => lettersOnly(s.name).includes(choiceNorm) || choiceNorm.includes(lettersOnly(s.name)) ||
               (s.aliases || []).some(a => lettersOnly(a).includes(choiceNorm) || choiceNorm.includes(lettersOnly(a)))
        );
      }

      if (matched) {
        if (!currentStyleIds.has(matched.id)) {
          currentStyleIds.add(matched.id);
          discoveredStyleIds.push(matched.id);
        }
      } else {
        // Genuine new style not in master data -> auto-create with clean name
        const slug = choiceNorm || 'style';
        const newStyleId = 'st_' + slug;
        const existing = ctx.db.styles.find(s => s.id === newStyleId)[0];
        const finalId = existing ? `${newStyleId}_${Date.now() % 10000}` : newStyleId;

        try {
          ctx.db.styles.insert({
            id: finalId,
            name: choice,
            aliases: [choice.toLowerCase(), choiceNorm],
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
    const lettersOnly = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanChoice = (str: string) =>
      str.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\bclasses?\b/gi, '').trim();

    // Map style IDs to style names & aliases
    const styleInfoMap = new Map<string, { id: string; name: string; aliases: string[] }>();
    for (const sid of styleIds) {
      const s = ctx.db.styles.find(st => st.id === sid && st.active)[0];
      const name = s?.name || sid;
      const aliases = (s?.aliases || []).map(a => a.toLowerCase());
      styleInfoMap.set(sid, { id: sid, name, aliases });
    }

    const matchChoiceToStyleId = (choiceText: string): string | null => {
      const cleaned = cleanChoice(choiceText);
      const cleanedNorm = lettersOnly(cleaned);
      const rawNorm = lettersOnly(choiceText);

      // 1. Exact match on cleaned name or alias
      for (const [sid, info] of styleInfoMap.entries()) {
        const nameNorm = lettersOnly(info.name);
        if (cleanedNorm === nameNorm || rawNorm === nameNorm) return sid;
        for (const a of info.aliases) {
          const aNorm = lettersOnly(a);
          if (cleanedNorm === aNorm || rawNorm === aNorm) return sid;
        }
      }

      // 2. Substring match
      for (const [sid, info] of styleInfoMap.entries()) {
        const nameNorm = lettersOnly(info.name);
        if (cleanedNorm.includes(nameNorm) || nameNorm.includes(cleanedNorm)) return sid;
        for (const a of info.aliases) {
          const aNorm = lettersOnly(a);
          if (cleanedNorm.includes(aNorm) || aNorm.includes(cleanedNorm)) return sid;
        }
      }
      return null;
    };

    // Cache original choice labels so when a style is restored, its original pricing/formatting is preserved
    const cacheKey = `form_choices:${form.getId()}`;
    const cachedLabelsRaw = ctx.cache.get(cacheKey);
    let rememberedLabels: Record<string, string> = {};
    if (cachedLabelsRaw) {
      try {
        rememberedLabels = JSON.parse(cachedLabelsRaw);
      } catch {
        rememberedLabels = {};
      }
    }

    // Record any current choice mappings
    for (const choice of question.choices) {
      const sid = matchChoiceToStyleId(choice);
      if (sid) {
        rememberedLabels[sid] = choice;
      }
    }
    ctx.cache.put(cacheKey, JSON.stringify(rememberedLabels), 86400 * 30);

    // Filter question choices:
    // Drop full styles. Keep available styles and unrecognized choices.
    const filteredChoices = question.choices.filter(choice => {
      const matchedSid = matchChoiceToStyleId(choice);
      if (!matchedSid) return true;
      return availableStyleIds.includes(matchedSid);
    });

    // Ensure all available styles are present in choices without adding duplicates
    for (const availSid of availableStyleIds) {
      const alreadyPresent = filteredChoices.some(c => matchChoiceToStyleId(c) === availSid);
      if (!alreadyPresent) {
        const restoredLabel = rememberedLabels[availSid] || styleInfoMap.get(availSid)?.name || availSid;
        filteredChoices.push(restoredLabel);
      }
    }

    // Preserve original choices order if possible
    const choiceOrder = Object.values(rememberedLabels);
    if (choiceOrder.length > 0) {
      filteredChoices.sort((a, b) => {
        const idxA = choiceOrder.indexOf(a);
        const idxB = choiceOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }

    remainingChoices = filteredChoices;

    // Compose help text notice while preserving the admin's original promotion / description
    const NOTICE_PREFIX = '⚠️ Note:';
    const cleanHelp = (question.helpText || '')
      .split(/\n\s*\n/)
      .filter(p => !p.trim().startsWith(NOTICE_PREFIX) && !p.includes('reached maximum capacity'))
      .join('\n\n')
      .trim();

    let helpTextToSet = cleanHelp;
    if (fullStyleIds.length > 0) {
      const fullNames = fullStyleIds
        .map(sid => styleInfoMap.get(sid)?.name || sid)
        .join(', ');
      const helpNotice = `${NOTICE_PREFIX} [${fullNames}] ${fullStyleIds.length === 1 ? 'has' : 'have'} reached maximum capacity and ${fullStyleIds.length === 1 ? 'is' : 'are'} closed for registration. Please select from the remaining available styles.`;
      helpTextToSet = cleanHelp ? `${cleanHelp}\n\n${helpNotice}` : helpNotice;
    }

    try {
      form.setChoices(question.id, remainingChoices, helpTextToSet);
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
