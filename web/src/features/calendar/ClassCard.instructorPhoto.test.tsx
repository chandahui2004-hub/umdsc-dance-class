import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ClassCard } from './ClassCard';
import { getInstructorPhotoUrl } from '../../lib/instructorPhotos';
import type { ClassSession, DanceStyle, Instructor } from '@umdsc/shared';

describe('Instructor Photos and ClassCard Focus Layout', () => {
  it('resolves correct photo URLs for instructors with uploaded photos and null when not uploaded', () => {
    expect(getInstructorPhotoUrl({ name: 'Carmen Loh' })).toBeNull();
    expect(getInstructorPhotoUrl({ name: 'Lam Hong Woh' })).toBeNull();
    expect(getInstructorPhotoUrl({ name: 'Newstyle Kelvin' })).toBeNull();
    expect(getInstructorPhotoUrl({ name: 'Elf', photoUrl: 'https://lh3.googleusercontent.com/d/elf-123' })).toBe('https://lh3.googleusercontent.com/d/elf-123');
    expect(getInstructorPhotoUrl({ name: 'Custom Coach', photoUrl: 'https://example.com/custom.png' })).toBe('https://example.com/custom.png');
  });

  it('renders ClassCard with instructor picture on the left and details on the right', () => {
    const session: ClassSession = {
      id: 'sess-1',
      eventId: 'evt-1',
      styleId: 'style-latin',
      seq: 1,
      date: '2026-10-13',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-lam',
      venue: 'Dance Studio',
      status: 'scheduled',
      note: 'Focus on Cha Cha rhythm',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01',
      active: true
    };

    const style: DanceStyle = {
      id: 'style-latin',
      name: 'Latin',
      aliases: ['latin'],
      colorKey: 'pink',
      defaultWeekday: 2,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'inst-lam',
      defaultVenue: 'Dance Studio',
      attendanceFolderId: '',
      videoFolderId: '',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01',
      active: true
    };

    const instructor: Instructor = {
      id: 'inst-lam',
      name: 'Lam Hong Woh',
      contact: '+60123456789',
      photoUrl: 'https://lh3.googleusercontent.com/d/drive-lam-123',
      styleIds: [],
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01',
      active: true
    };

    render(
      <MemoryRouter>
        <ClassCard
          session={session}
          style={style}
          instructor={instructor}
          videos={[]}
          music={[]}
          eventName="OCT MONTHLY CLASS"
        />
      </MemoryRouter>
    );

    // Verify instructor portrait exists with correct alt and source
    const portraitImg = screen.getByAltText('Lam Hong Woh');
    expect(portraitImg).toBeInTheDocument();
    expect(portraitImg).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/drive-lam-123');

    // Verify information on the right
    expect(screen.getByText('Lam Hong Woh')).toBeInTheDocument();
    expect(screen.getByText('20:00 - 22:00')).toBeInTheDocument();
    expect(screen.getByText('Dance Studio')).toBeInTheDocument();
    expect(screen.getByText('Focus on Cha Cha rhythm')).toBeInTheDocument();
    expect(screen.getByText('+60123456789')).toBeInTheDocument();
  });
});
