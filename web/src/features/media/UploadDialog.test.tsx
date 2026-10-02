import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ClassSession, DanceStyle } from '@umdsc/shared';
import { UploadDialog } from './UploadDialog';

vi.mock('../../lib/api', () => ({ api: { post: vi.fn() }, errorMessage: (e: unknown) => String(e) }));
vi.mock('../../lib/google/gis', () => ({ getAccessToken: vi.fn() }));
vi.mock('../../lib/google/picker', () => ({ pickFolder: vi.fn(), hasPickerGrant: vi.fn(() => false) }));
vi.mock('../../lib/google/driveFolders', () => ({ ensureClassFolder: vi.fn() }));

const style = { id: 'st1', name: 'Locking', videoFolderId: 'f1' } as DanceStyle;
const sessions = [{ id: 's1', date: '2026-10-15', seq: 1, styleId: 'st1', eventId: 'e1' }] as ClassSession[];

function mp4With(marker: string) {
  const bytes = new Uint8Array(2048);
  bytes.set(new TextEncoder().encode(marker), 700);
  return new File([bytes], 'class.mp4', { type: 'video/mp4' });
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <UploadDialog
        type="video"
        eventId="e1"
        eventName="OCT"
        style={style}
        sessions={sessions}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    </MemoryRouter>
  );
}

const chooseFile = (file: File) =>
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
    target: { files: [file] }
  });

describe('UploadDialog HEVC warning (warns, never blocks)', () => {
  it('warns about an HEVC mp4 and still lets the admin continue', async () => {
    renderDialog();
    chooseFile(mp4With('hvc1'));

    expect(await screen.findByText(/This video is H\.265\/HEVC/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'START UPLOAD' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE ANYWAY' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'START UPLOAD' })).toBeEnabled());
  });

  it('shows no warning for an H.264 mp4', async () => {
    renderDialog();
    chooseFile(mp4With('avc1'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'START UPLOAD' })).toBeEnabled());
    expect(screen.queryByText(/H\.265\/HEVC/)).toBeNull();
  });
});
