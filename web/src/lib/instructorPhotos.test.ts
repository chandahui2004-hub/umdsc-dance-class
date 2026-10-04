import { describe, it, expect } from 'vitest';
import {
  getInstructorPhotoUrl,
  convertDriveImageUrl
} from './instructorPhotos';

describe('instructorPhotos library', () => {
  it('returns null for instructors without uploaded Drive photos', () => {
    expect(getInstructorPhotoUrl({ name: 'Lam Hong Woh' })).toBeNull();
    expect(getInstructorPhotoUrl({ name: 'Carmen Loh' })).toBeNull();
    expect(getInstructorPhotoUrl({ name: 'Newstyle Kelvin' })).toBeNull();
  });

  it('prefers explicit photoUrl over seed photo', () => {
    const url = getInstructorPhotoUrl({
      name: 'Lam Hong Woh',
      photoUrl: 'https://example.com/custom-lam.jpg'
    });
    expect(url).toBe('https://example.com/custom-lam.jpg');
  });

  it('prefers active photo in photosJson', () => {
    const photosJson = JSON.stringify([
      { id: '1', url: 'https://example.com/p1.jpg', active: false },
      { id: '2', url: 'https://example.com/p2.jpg', active: true }
    ]);
    const url = getInstructorPhotoUrl({
      name: 'EIF',
      photosJson
    });
    expect(url).toBe('https://example.com/p2.jpg');
  });

  it('converts Google Drive file links to direct preview URLs', () => {
    const driveLink1 = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/view?usp=sharing';
    expect(convertDriveImageUrl(driveLink1)).toBe('https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123');

    const driveLink2 = 'https://drive.google.com/open?id=1xyz_987-abc';
    expect(convertDriveImageUrl(driveLink2)).toBe('https://lh3.googleusercontent.com/d/1xyz_987-abc');

    const regularUrl = 'https://images.unsplash.com/photo-123.jpg';
    expect(convertDriveImageUrl(regularUrl)).toBe(regularUrl);
  });

  it('matches all Drive photos for an instructor including duplicates', async () => {
    const { matchDrivePhotosForInstructor, getInstructorPhotosWithDrive } = await import('./instructorPhotos');
    const driveFiles = [
      { id: 'file_1', name: 'Newstyle Kelvin - Photo 1.webp', url: 'https://lh3.googleusercontent.com/d/file_1' },
      { id: 'file_2', name: 'Newstyle Kelvin - Photo 2.webp', url: 'https://lh3.googleusercontent.com/d/file_2' },
      { id: 'file_3', name: 'Elf - Photo 1.webp', url: 'https://lh3.googleusercontent.com/d/file_3' }
    ];

    const kelvinFiles = matchDrivePhotosForInstructor('Newstyle Kelvin', driveFiles);
    expect(kelvinFiles).toHaveLength(2);
    expect(kelvinFiles.map((f) => f.id)).toEqual(['file_1', 'file_2']);

    const kelvinPhotos = getInstructorPhotosWithDrive(
      {
        id: 'inst_kelvin',
        version: 1,
        active: true,
        name: 'Newstyle Kelvin',
        photoUrl: 'https://lh3.googleusercontent.com/d/file_1',
        photosJson: '[]'
      } as any,
      driveFiles
    );

    expect(kelvinPhotos).toHaveLength(2);
    expect(kelvinPhotos[0].active).toBe(true);
    expect(kelvinPhotos[1].active).toBe(false);
  });
});
