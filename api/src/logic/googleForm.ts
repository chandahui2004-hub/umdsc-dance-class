/**
 * Google Form link helpers.
 *
 * Only the EDIT id (…/forms/d/<id>/edit) can be opened by FormApp.openById. The share/responder
 * link (…/forms/d/e/<publishedId>/viewform) carries a different, published id that FormApp cannot edit.
 */

const EDIT_ID_RE = /\/forms\/(?:u\/\d+\/)?d\/(?!e\/)([a-zA-Z0-9_-]{15,})/;
const RESPONDER_RE = /\/forms\/(?:u\/\d+\/)?d\/e\//;

/** The editable form id from an edit link or a bare id; '' for responder links or anything else. */
export function extractGoogleFormId(urlOrId?: string | null): string {
  const trimmed = String(urlOrId || '').trim();
  if (!trimmed) return '';
  if (RESPONDER_RE.test(trimmed)) return '';
  const match = trimmed.match(EDIT_ID_RE);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return '';
}

/** True for the share link (/forms/d/e/…) that respondents use. */
export function isResponderFormLink(url?: string | null): boolean {
  return RESPONDER_RE.test(String(url || ''));
}
