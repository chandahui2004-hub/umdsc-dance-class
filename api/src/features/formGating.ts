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
  fullStyleIds: string[];
  availableStyleIds: string[];
  remainingChoices?: string[];
  message?: string;
}

/**
 * Evaluates enrolled dancers against target styleSlots and automatically updates
 * the live Google Form:
 * 1. For multi-style events: removes full styles from checkbox choices and adds warning text in the question description.
 * 2. For single-style events or when all styles are full: closes the form with a polite Full House message.
 * 3. Auto-heals: restores choices and re-opens the form if capacity is increased or cancellations occur.
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
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'No form port available on context'
    };
  }

  // Find linked form URL or ID
  const explicitForm = (event as any).formUrl || (event as any).formId;
  const formUrl = explicitForm || (event.sourceSheetId ? ctx.form.getFormUrl(event.sourceSheetId) : null);

  if (!formUrl) {
    return {
      synced: false,
      formClosed: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: 'No Google Form linked to event'
    };
  }

  let form: FormInstancePort | null = null;
  try {
    form = ctx.form.openForm(formUrl);
  } catch (err) {
    console.warn(`[syncGoogleFormSlotChoices] Failed to open form ${formUrl}:`, err);
    return {
      synced: false,
      formClosed: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: `Failed to open Google Form: ${err}`
    };
  }

  if (!form) {
    return {
      synced: false,
      formClosed: false,
      fullStyleIds: [],
      availableStyleIds: [],
      message: `Google Form could not be found at ${formUrl}`
    };
  }

  // Evaluate member enrollment per style
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

  // Check if Full House:
  // 1. Single-style event and that style is full
  // 2. Multi-style event and ALL configured styles with cap are full (no available styles remaining)
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
      fullStyleIds,
      availableStyleIds: [],
      remainingChoices: []
    };
  }

  // Not Full House: ensure form is accepting responses
  try {
    if (!form.isAcceptingResponses()) {
      form.setAcceptingResponses(true);
    }
  } catch (err) {
    console.warn(`[syncGoogleFormSlotChoices] Failed to re-open form ${form.getId()}:`, err);
  }

  // Now manage choices on the style question
  const question = form.getStyleQuestion();
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

    // Helper to find which styleId a choice text corresponds to
    const matchChoiceToStyleId = (choiceText: string): string | null => {
      const trimmed = choiceText.trim().toLowerCase();
      for (const [sid, info] of styleInfoMap.entries()) {
        if (trimmed === info.name.toLowerCase() || info.aliases.some(a => trimmed === a || trimmed.includes(a))) {
          return sid;
        }
      }
      return null;
    };

    // Calculate all available style names
    const availableStyleNames = availableStyleIds.map(sid => styleInfoMap.get(sid)?.name || sid);

    // Filter question choices:
    // If a choice matches a full style, drop it.
    // If a choice matches an available style, keep it.
    // If a choice is other/unrecognized, preserve it.
    const filteredChoices = question.choices.filter(choice => {
      const matchedSid = matchChoiceToStyleId(choice);
      if (!matchedSid) return true; // keep unrecognized / extra choices
      return availableStyleIds.includes(matchedSid);
    });

    // If filteredChoices has fewer choices than available styles (e.g. choice was previously removed),
    // ensure all available styles are present in choices!
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
    formClosed: false,
    fullStyleIds,
    availableStyleIds,
    remainingChoices
  };
}
