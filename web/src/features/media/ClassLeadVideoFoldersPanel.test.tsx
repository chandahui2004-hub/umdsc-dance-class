import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DanceStyle, EventItem } from '@umdsc/shared';
import { ClassLeadVideoFoldersPanel } from './ClassLeadVideoFoldersPanel';
import { api } from '../../lib/api';
import { session } from '../../lib/session';

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
  errorMessage: (e: unknown) => String(e)
}));

vi.mock('../../lib/google/gis', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token')
}));

vi.mock('../../lib/google/picker', () => ({
  pickFolder: vi.fn(),
  checkFolderAccess: vi.fn().mockResolvedValue(true)
}));

const mockEvent: EventItem = {
  id: 'evt_1',
  name: 'OCT MONTHLY CLASS',
  nameKey: 'oct-monthly-class',
  type: 'monthly',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  sourceSheetId: 'sheet_1',
  sourceTab: 'Form',
  columnMapJson: '{}',
  classIndex: 0,
  styleIds: ['st_popping', 'st_locking'],
  folderId: '',
  videoFolderId: '',
  membersSpreadsheetId: '',
  status: 'active',
  active: true,
  sourceRowCount: 0,
  sourceLastRowHash: '',
  lastSyncAt: '',
  lastSyncError: '',
  memberCount: 0,
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

const styleWithLink: DanceStyle = {
  id: 'st_popping',
  name: 'Popping',
  aliases: ['popping'],
  colorKey: 'blue',
  defaultWeekday: 2,
  defaultStart: '20:00',
  defaultEnd: '22:00',
  defaultInstructorId: '',
  defaultVenue: 'Studio A',
  attendanceFolderId: 'att_1',
  videoFolderId: 'vid_folder_popping',
  active: true,
  version: 2,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

const styleWithoutLink: DanceStyle = {
  id: 'st_locking',
  name: 'Locking',
  aliases: ['locking'],
  colorKey: 'yellow',
  defaultWeekday: 4,
  defaultStart: '20:00',
  defaultEnd: '22:00',
  defaultInstructorId: '',
  defaultVenue: 'Studio B',
  attendanceFolderId: 'att_2',
  videoFolderId: '',
  active: true,
  version: 1,
  updatedBy: 'admin',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

async function renderPanel(styles: DanceStyle[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const res = render(
    <QueryClientProvider client={queryClient}>
      <ClassLeadVideoFoldersPanel event={mockEvent} styles={styles} />
    </QueryClientProvider>
  );
  await waitFor(() => {});
  return res;
}

describe('ClassLeadVideoFoldersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.set('tok', {
      sub: 'admin',
      role: 'admin',
      name: 'Admin',
      pv: 1,
      exp: Date.now() + 3600000,
      perms: { 'styles.edit': '*' }
    });
  });

  it('expanded when one event style has no link', async () => {
    await renderPanel([styleWithLink, styleWithoutLink]);

    expect(screen.getByTestId('toggle-folders-panel').textContent).toContain('▲ COLLAPSE');
    expect(screen.getByTestId('folder-row-st_popping')).toBeDefined();
    expect(screen.getByTestId('folder-row-st_locking')).toBeDefined();
    expect(screen.getByText('1 MISSING LINK')).toBeDefined();
  });

  it('collapsed when all event styles have links', async () => {
    const allLinked = [
      styleWithLink,
      { ...styleWithoutLink, videoFolderId: 'vid_folder_locking' }
    ];
    await renderPanel(allLinked);

    expect(screen.getByTestId('toggle-folders-panel').textContent).toContain('▼ EXPAND');
    expect(screen.queryByTestId('folder-row-st_popping')).toBeNull();
    expect(screen.getByText('2/2 LINKED')).toBeDefined();
  });

  it('shows ⚠ LINK NOT INSERTED for the missing style', async () => {
    await renderPanel([styleWithLink, styleWithoutLink]);

    const missingRow = screen.getByTestId('folder-row-st_locking');
    expect(missingRow.textContent).toContain('⚠ LINK NOT INSERTED');
  });

  it('hides INSERT/CHANGE buttons without styles.edit, showing "ask an admin" text instead', async () => {
    session.set('tok', {
      sub: 'dancer_1',
      role: 'dancer',
      name: 'Dancer',
      pv: 1,
      exp: Date.now() + 3600000,
      perms: {}
    });

    await renderPanel([styleWithLink, styleWithoutLink]);

    expect(screen.queryByRole('button', { name: '+ INSERT LINK' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CHANGE LINK' })).toBeNull();
    expect(screen.getByText('— ask an admin to add it')).toBeDefined();
  });

  it('saving calls styles.update with { id, version, videoFolderUrl }', async () => {
    (api.post as any).mockResolvedValue({ ok: true, data: { ...styleWithoutLink, videoFolderId: 'new_folder' } });

    await renderPanel([styleWithLink, styleWithoutLink]);

    const insertBtn = screen.getByRole('button', { name: '+ INSERT LINK' });
    fireEvent.click(insertBtn);

    const input = screen.getByPlaceholderText('https://drive.google.com/drive/folders/...');
    fireEvent.change(input, {
      target: { value: 'https://drive.google.com/drive/folders/new_folder_12345' }
    });

    const saveBtn = screen.getByRole('button', { name: 'SAVE' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('styles.update', {
        id: 'st_locking',
        version: 1,
        videoFolderUrl: 'https://drive.google.com/drive/folders/new_folder_12345'
      });
    });
  });
});
