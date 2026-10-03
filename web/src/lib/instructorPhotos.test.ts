import { describe, it, expect } from 'vitest';
import {
  getInstructorPhotoUrl,
  convertDriveImageUrl,
  DEFAULT_INSTRUCTOR_PHOTOS
} from './instructorPhotos';

describe('instructorPhotos library', () => {
  it('resolves pre-seeded photo paths for default instructors', () => {
    expect(getInstructorPhotoUrl({ name: 'Lam Hong Woh' })).toBe(DEFAULT_INSTRUCTOR_PHOTOS['Lam Hong Woh']);
    expect(getInstructorPhotoUrl({ name: 'Carmen Loh' })).toBe(DEFAULT_INSTRUCTOR_PHOTOS['Carmen Loh']);
    expect(getInstructorPhotoUrl({ name: 'Newstyle Kelvin' })).toBe(DEFAULT_INSTRUCTOR_PHOTOS['Newstyle Kelvin']);
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
});
