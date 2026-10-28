import React from 'react';
import { useBootstrap } from '../auth/useBootstrap';
import { useCurrentEvent } from './useCurrentEvent';
import { session } from '../../lib/session';
import { can } from '../../lib/permissions';

/**
 * Top-of-page links to the Google Drive folders and sheets for the chosen event.
 * Gated by permissions so view-only roles do not see raw Drive/Sheet links.
 */
export const FolderLinksHeader: React.FC = () => {
  const { current: event, isAll } = useCurrentEvent();
  const { data: bootstrap } = useBootstrap('admin');
  const perms = session.get()?.claims?.perms;

  const canEventFolder =
    can(perms, 'sessions.edit') || can(perms, 'members.import') || can(perms, 'settings.edit');
  const canAttFolder =
    can(perms, 'attendance.edit') || can(perms, 'settings.edit');
  const canMembersSheet =
    can(perms, 'members.import') || can(perms, 'settings.edit');

  const masterFolderId = bootstrap?.settings?.DRIVE_MASTER_FOLDER_ID || '';
  const eventFolderId = canEventFolder && !isAll && event?.folderId ? event.folderId : '';
  const attFolderId = canAttFolder ? (eventFolderId || masterFolderId) : '';
  const membersSpreadsheetId = canMembersSheet && !isAll ? event?.membersSpreadsheetId || '' : '';

  if (!eventFolderId && !attFolderId && !membersSpreadsheetId) return null;

  return (
    <div
      data-testid="folder-links-header"
      className="px-panel p-2.5 bg-[var(--night-2)] border-2 border-[var(--outline)] flex flex-wrap items-center gap-2 shadow-[2px_2px_0_var(--outline)]"
    >
      {eventFolderId && (
        <a
          href={`https://drive.google.com/drive/folders/${eventFolderId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 border-2 border-[var(--outline)] bg-[var(--night-1)] hover:bg-[var(--violet-2)] text-[var(--neon-gold)] font-display text-[11px] font-bold no-underline shadow-[1px_1px_0_var(--outline)]"
        >
          <span>📁</span>
          <span>EVENT FOLDER ↗</span>
        </a>
      )}
      {attFolderId && (
        <a
          href={`https://drive.google.com/drive/folders/${attFolderId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 border-2 border-[var(--outline)] bg-[var(--night-1)] hover:bg-[var(--violet-2)] text-[var(--neon-cyan)] font-display text-[11px] font-bold no-underline shadow-[1px_1px_0_var(--outline)]"
        >
          <span>📋</span>
          <span>ATTENDANCE FOLDER ↗</span>
        </a>
      )}
      {membersSpreadsheetId && (
        <a
          href={`https://docs.google.com/spreadsheets/d/${membersSpreadsheetId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 border-2 border-[var(--outline)] bg-[var(--night-1)] hover:bg-[var(--violet-2)] text-[var(--neon-green)] font-display text-[11px] font-bold no-underline shadow-[1px_1px_0_var(--outline)]"
        >
          <span>📊</span>
          <span>MEMBERS SHEET ↗</span>
        </a>
      )}
    </div>
  );
};

export const AttendanceFolderHeader = FolderLinksHeader;

export default FolderLinksHeader;
