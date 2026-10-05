import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pickFolder } from './picker';

const FOLDER_ID = 'fld-locking';

// Minimal fake of the Google Picker API: records how the view was built and lets a test
// fire the picker callback.
function installFakePicker() {
  const calls: { viewId?: string; methods: Record<string, unknown[]> } = { methods: {} };
  let callback: ((data: any) => void) | null = null;

  function DocsView(this: any, viewId: string) {
    calls.viewId = viewId;
    const record = (name: string) => (...args: unknown[]) => {
      calls.methods[name] = args;
      return this;
    };
    this.setMimeTypes = record('setMimeTypes');
    this.setIncludeFolders = record('setIncludeFolders');
    this.setSelectFolderEnabled = record('setSelectFolderEnabled');
    this.setFileIds = record('setFileIds');
    this.setParent = record('setParent');
  }

  function PickerBuilder(this: any) {
    const chain = () => this;
    this.addView = chain;
    this.setOAuthToken = chain;
    this.setDeveloperKey = chain;
    this.setAppId = chain;
    this.setTitle = chain;
    this.setCallback = (cb: (data: any) => void) => {
      callback = cb;
      return this;
    };
    this.build = () => ({ setVisible: () => {} });
  }

  (window as any).gapi = { load: (_: string, cb: () => void) => cb() };
  (window as any).google = {
    picker: {
      ViewId: { DOCS: 'all', FOLDERS: 'folders' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      DocsView,
      PickerBuilder
    }
  };

  return {
    calls,
    fire: (data: any) => callback?.(data)
  };
}

describe('pickFolder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the folder itself (setFileIds), not its contents (setParent)', async () => {
    const fake = installFakePicker();
    const done = pickFolder('tok', FOLDER_ID);
    await vi.waitFor(() => expect(fake.calls.methods.setFileIds).toBeDefined());

    expect(fake.calls.methods.setFileIds).toEqual([FOLDER_ID]);
    expect(fake.calls.methods.setParent).toBeUndefined();
    expect(fake.calls.methods.setMimeTypes).toEqual(['application/vnd.google-apps.folder']);
    expect(fake.calls.methods.setSelectFolderEnabled).toEqual([true]);

    fake.fire({ action: 'picked', docs: [{ id: FOLDER_ID }] });
    await expect(done).resolves.toBe(FOLDER_ID);
  });

  it('rejects when a different folder is picked', async () => {
    const fake = installFakePicker();
    const done = pickFolder('tok', FOLDER_ID);
    await vi.waitFor(() => expect(fake.calls.methods.setFileIds).toBeDefined());

    fake.fire({ action: 'picked', docs: [{ id: 'some-other-folder' }] });
    await expect(done).rejects.toThrow(/select the class lead folder itself/i);
  });

  it('rejects when cancelled', async () => {
    const fake = installFakePicker();
    const done = pickFolder('tok', FOLDER_ID);
    await vi.waitFor(() => expect(fake.calls.methods.setFileIds).toBeDefined());

    fake.fire({ action: 'cancel' });
    await expect(done).rejects.toThrow(/cancelled/i);
  });
});
