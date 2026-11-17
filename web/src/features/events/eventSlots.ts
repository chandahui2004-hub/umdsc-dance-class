import type { EventListItem } from '@umdsc/shared';

function parseJsonValue<T>(direct: T | undefined, rawJson: string | undefined, fallback: T): T {
  if (direct !== undefined) return direct;
  if (!rawJson) return fallback;
  try {
    return JSON.parse(rawJson) as T;
  } catch {
    return fallback;
  }
}

/** Parses per-style slot limits from an event object or its JSON fallback field. */
export function parseEventStyleSlots(
  event: Pick<EventListItem, 'styleSlots' | 'styleSlotsJson'>
): Record<string, number> {
  const parsed = parseJsonValue(event.styleSlots, event.styleSlotsJson, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** Parses the list of style IDs whose slot limit has been reached. */
export function parseNotifiedFullStyles(
  event: Pick<EventListItem, 'notifiedFullStyles' | 'notifiedFullStylesJson'>
): string[] {
  const parsed = parseJsonValue(event.notifiedFullStyles, event.notifiedFullStylesJson, []);
  return Array.isArray(parsed) ? parsed : [];
}

/** Returns true if a dance style within an event is currently marked or counted as full. */
export function isEventStyleFull(
  event: Pick<
    EventListItem,
    'styleIds' | 'memberCount' | 'styleSlots' | 'styleSlotsJson' | 'notifiedFullStyles' | 'notifiedFullStylesJson'
  >,
  styleId: string
): boolean {
  const notified = parseNotifiedFullStyles(event);
  if (notified.includes(styleId)) return true;
  const slots = parseEventStyleSlots(event);
  const limit = Number(slots[styleId]) || 0;
  return event.styleIds.length === 1 && limit > 0 && event.memberCount >= limit;
}
