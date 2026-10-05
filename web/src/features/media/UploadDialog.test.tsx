import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ClassSession, DanceStyle } from '@umdsc/shared';
import { UploadDialog } from './UploadDialog';

const mockPost = vi.fn();
const mockGetAccessToken = vi.fn();
const mockLoadGisScript = vi.fn();
const mockPickFolder = vi.fn();
const mockCheckFolderAccess = vi.fn();
const mockEnsureClassFolder = vi.fn();
const mockUploadResumable = vi.fn();
const mockMakePublic = vi.fn();
const mockCompressVideo = vi.fn();
const mockFetchAccountEmail = vi.fn();
let mockCurrentEmail: string | null = null;

vi.mock('../../lib/api', () => ({
  api: { post: (...args: any[]) => mockPost(...args) },
  errorMessage: (e: any) => e?.message || String(e)
}));

vi.mock('../../lib/google/gis', () => ({
  loadGisScript: () => mockLoadGisScript(),
  getAccessToken: () => mockGetAccessToken()
}));

vi.mock('../../lib/google/googleAccount', () => ({
  fetchAccountEmail: (...args: any[]) => mockFetchAccountEmail(...args),
  sameAccount: (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase(),
  useGoogleAccountEmail: () => mockCurrentEmail,
  refreshAccountFromCache: async () => null,
  signInGoogle: vi.fn(),
  switchGoogleAccount: vi.fn()
}));

vi.mock('../../lib/google/picker', () => ({
  pickFolder: (...args: any[]) => mockPickFolder(...args),
  checkFolderAccess: (...args: any[]) => mockCheckFolderAccess(...args)
}));

vi.mock('../../lib/google/driveFolders', () => ({
  ensureClassFolder: (...args: any[]) => mockEnsureClassFolder(...args)
}));

vi.mock('../../lib/google/resumableUpload', () => ({
  uploadResumable: (...args: any[]) => mockUploadResumable(...args),
  makePublic: (...args: any[]) => mockMakePublic(...args)
}));

vi.mock('../../lib/media/videoCompressor', () => ({
  compressVideo: (...args: any[]) => mockCompressVideo(...args)
}));

const styleWithLink = {
  id: 'st1',
  name: 'Locking',
  videoFolderId: 'folder_locking',
  videoUploaderEmail: 'lead@gmail.com'
} as DanceStyle;
const styleWithoutUploader = { id: 'st3', name: 'Hip Hop', videoFolderId: 'folder_hiphop' } as DanceStyle;
const styleWithoutLink = { id: 'st2', name: 'Popping', videoFolderId: '' } as DanceStyle;
const sessions = [{ id: 's1', date: '2026-10-15', seq: 1, styleId: 'st1', eventId: 'e1' }] as ClassSession[];

function renderDialog(style: DanceStyle = styleWithLink) {
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

describe('UploadDialog Gating and Video Compression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('fake-access-token');
    mockFetchAccountEmail.mockResolvedValue('lead@gmail.com');
    mockCurrentEmail = null;
    mockPost.mockResolvedValue({
      data: {
        videoMasterFolderId: 'folder_locking',
        eventFolderId: 'event_subfolder_id'
      }
    });
    mockCheckFolderAccess.mockResolvedValue(true);
    mockEnsureClassFolder.mockResolvedValue({
      eventFolderId: 'event_subfolder_id',
      classFolderId: 'class_subfolder_id'
    });
    mockUploadResumable.mockResolvedValue({ id: 'uploaded_file_id' });
    mockMakePublic.mockResolvedValue(undefined);
    mockCompressVideo.mockImplementation(async (file: File) => ({
      file,
      compressed: false
    }));

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
  });

  it('disables START UPLOAD and displays warning when dance style has no videoFolderId', async () => {
    renderDialog(styleWithoutLink);
    const file = new File([new Uint8Array(100)], 'test.mp4', { type: 'video/mp4' });
    chooseFile(file);

    expect(screen.getByTestId('missing-video-folder-alert')).toBeInTheDocument();
    expect(screen.getByText(/Class lead video folder link not inserted for Popping/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'START UPLOAD' })).toBeDisabled();
  });

  it('calls getAccessToken before awaiting wakeLock', async () => {
    const callOrder: string[] = [];
    mockGetAccessToken.mockImplementation(() => {
      callOrder.push('getAccessToken');
      return Promise.resolve('token-123');
    });

    let wakeLockResolve: any;
    const wakeLockPromise = new Promise((res) => {
      wakeLockResolve = res;
    });

    (navigator as any).wakeLock = {
      request: vi.fn().mockImplementation(() => {
        callOrder.push('wakeLock.request');
        wakeLockResolve({ release: vi.fn().mockResolvedValue(undefined) });
        return wakeLockPromise;
      })
    };

    renderDialog(styleWithLink);
    const file = new File([new Uint8Array(100)], 'test.mp4', { type: 'video/mp4' });
    chooseFile(file);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    // getAccessToken must be called immediately, before wakeLock promise resolves
    expect(callOrder[0]).toBe('getAccessToken');
    await waitFor(() => expect(mockUploadResumable).toHaveBeenCalled());
  });

  it('files.get 200 -> skips Google Picker', async () => {
    mockCheckFolderAccess.mockResolvedValue(true);

    renderDialog(styleWithLink);
    const file = new File([new Uint8Array(100)], 'test.mp4', { type: 'video/mp4' });
    chooseFile(file);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    await waitFor(() => expect(mockUploadResumable).toHaveBeenCalled());
    expect(mockCheckFolderAccess).toHaveBeenCalledWith('fake-access-token', 'folder_locking');
    expect(mockPickFolder).not.toHaveBeenCalled();
  });

  it('files.get 404 + coarse pointer -> shows authorize message, does not call Picker', async () => {
    mockCheckFolderAccess.mockResolvedValue(false);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    renderDialog(styleWithLink);
    const file = new File([new Uint8Array(100)], 'test.mp4', { type: 'video/mp4' });
    chooseFile(file);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    expect(
      await screen.findByText(
        /This class lead folder isn't authorized yet. Close this window, open Class Lead Video Drive Folders on the Media page and tap AUTHORIZE for Locking/
      )
    ).toBeInTheDocument();
    expect(mockPickFolder).not.toHaveBeenCalled();
    expect(mockUploadResumable).not.toHaveBeenCalled();
  });

  it('files.get 404 + fine pointer -> calls Google Picker', async () => {
    mockCheckFolderAccess.mockResolvedValue(false);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    renderDialog(styleWithLink);
    const file = new File([new Uint8Array(100)], 'test.mp4', { type: 'video/mp4' });
    chooseFile(file);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    await waitFor(() => expect(mockPickFolder).toHaveBeenCalledWith('fake-access-token', 'folder_locking'));
    await waitFor(() => expect(mockUploadResumable).toHaveBeenCalled());
  });

  it('compresses video and passes compressed file to uploadResumable', async () => {
    const originalFile = new File([new Uint8Array(200)], 'huge.mov', { type: 'video/quicktime' });
    const compressedFile = new File([new Uint8Array(50)], 'huge.mp4', { type: 'video/mp4' });

    mockCompressVideo.mockResolvedValue({
      file: compressedFile,
      compressed: true,
      originalSize: 200,
      newSize: 50
    });

    renderDialog(styleWithLink);
    chooseFile(originalFile);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    await waitFor(() => expect(mockCompressVideo).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockUploadResumable).toHaveBeenCalledWith(
        expect.objectContaining({
          file: compressedFile,
          name: 'huge.mp4'
        })
      )
    );
  });

  it("shows fallback notice when compressor fails, and continues upload with original file", async () => {
    const originalFile = new File([new Uint8Array(200)], 'huge.mov', { type: 'video/quicktime' });

    mockCompressVideo.mockResolvedValue({
      file: originalFile,
      compressed: false,
      reason: 'conversion_failed'
    });

    let finishUpload: (val: any) => void;
    mockUploadResumable.mockImplementation(
      () => new Promise((res) => { finishUpload = res; })
    );

    renderDialog(styleWithLink);
    chooseFile(originalFile);

    fireEvent.click(screen.getByRole('button', { name: 'START UPLOAD' }));

    await waitFor(() =>
      expect(
        screen.getByText(/Couldn't compress on this device — uploading the original/)
      ).toBeInTheDocument()
    );

    finishUpload!({ id: 'done' });

    await waitFor(() =>
      expect(mockUploadResumable).toHaveBeenCalledWith(
        expect.objectContaining({
          file: originalFile,
          name: 'huge.mov'
        })
      )
    );
  });

  describe('class lead upload account', () => {
    const videoFile = () => new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' });

    it('disables START UPLOAD when the style has no upload account yet', () => {
      renderDialog(styleWithoutUploader);
      chooseFile(videoFile());
      expect(screen.getByTestId('upload-account-alert')).toHaveTextContent(/Hip Hop has no upload account yet/);
      expect(screen.getByRole('button', { name: /^START UPLOAD/ })).toBeDisabled();
    });

    it('disables START UPLOAD when the signed-in account is not the class lead account', () => {
      mockCurrentEmail = 'club@gmail.com';
      renderDialog();
      chooseFile(videoFile());
      expect(screen.getByTestId('upload-account-alert')).toHaveTextContent(
        /Locking uploads with lead@gmail.com, but you're signed in as club@gmail.com/
      );
      expect(screen.getByRole('button', { name: /^START UPLOAD/ })).toBeDisabled();
    });

    it('stops before uploading when Google returns a different account at start', async () => {
      mockFetchAccountEmail.mockResolvedValue('club@gmail.com');
      renderDialog();
      chooseFile(videoFile());
      fireEvent.click(screen.getByRole('button', { name: /^START UPLOAD/ }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/Tap SWITCH ACCOUNT and choose lead@gmail.com/)
      );
      expect(mockUploadResumable).not.toHaveBeenCalled();
      expect(mockEnsureClassFolder).not.toHaveBeenCalled();
    });

    it('uploads when the signed-in account matches, ignoring letter case', async () => {
      mockFetchAccountEmail.mockResolvedValue('Lead@Gmail.com');
      renderDialog();
      chooseFile(videoFile());
      fireEvent.click(screen.getByRole('button', { name: /^START UPLOAD/ }));
      await waitFor(() => expect(mockUploadResumable).toHaveBeenCalled());
    });
  });
});
