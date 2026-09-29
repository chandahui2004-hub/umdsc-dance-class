import { describe, it, expect } from 'vitest';
import { extractDriveId } from '@umdsc/shared';

describe('extractDriveId', () => {
  it('parses various Google Drive and Docs URL formats and bare IDs', () => {
    expect(extractDriveId('https://drive.google.com/drive/folders/10rrxr82U3sSX16i8AksvFbMeWmsLxgST?usp=sharing'))
      .toEqual({ id: '10rrxr82U3sSX16i8AksvFbMeWmsLxgST', kind: 'folder' });

    expect(extractDriveId('https://drive.google.com/drive/u/0/folders/1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6'))
      .toEqual({ id: '1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6', kind: 'folder' });

    expect(extractDriveId('https://docs.google.com/spreadsheets/d/1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg/edit?usp=sharing'))
      .toEqual({ id: '1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg', kind: 'spreadsheet' });

    expect(extractDriveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/view?usp=drive_link'))
      .toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'file' });

    expect(extractDriveId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz0123'))
      .toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'unknown' });

    expect(extractDriveId('  1AbCdEfGhIjKlMnOpQrStUvWxYz0123  '))
      .toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', kind: 'unknown' });

    expect(extractDriveId('hello')).toBeNull();
    expect(extractDriveId('https://youtube.com/watch?v=abc')).toBeNull();
  });
});
