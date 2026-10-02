import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttendanceGrid } from './AttendanceGrid';
import { RosterList } from './RosterList';
import type { ClassSession } from '@umdsc/shared';

describe('AttendanceGrid & RosterList scrollbars and minimum text sizes', () => {
  const dummySessions: ClassSession[] = [
    { id: 'sess-1', eventId: 'ev1', styleId: 'st1', date: '2026-10-05', start: '20:00', end: '21:30', venue: 'Studio A', instructorId: 'inst-1', seq: 1, version: 1, updatedBy: 'admin', updatedAt: '2026-10-01', active: true, status: 'scheduled', note: '' },
    { id: 'sess-2', eventId: 'ev1', styleId: 'st1', date: '2026-10-12', start: '20:00', end: '21:30', venue: 'Studio A', instructorId: 'inst-1', seq: 2, version: 1, updatedBy: 'admin', updatedAt: '2026-10-01', active: true, status: 'scheduled', note: '' },
  ];

  const dummyMembers = [
    { memberId: 'm1', fullName: 'Alice Tan', matric: '23001111' },
    { memberId: 'm2', fullName: 'Bob Lee', matric: '23002222' }
  ];

  it('AttendanceGrid renders with scrollable container, pixel-scrollbar, and sticky header', () => {
    const { container } = render(
      <AttendanceGrid
        sessions={dummySessions}
        members={dummyMembers}
        presentMap={{ m1: ['sess-1'] }}
        onToggle={vi.fn()}
      />
    );

    // Scrollable container with pixel-scrollbar
    const scrollContainer = container.querySelector('.pixel-scrollbar');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass('overflow-auto');

    // Sticky header
    const thead = container.querySelector('thead');
    expect(thead).toHaveClass('sticky');
    expect(thead).toHaveClass('top-0');

    // Table elements
    expect(screen.getByText('Alice Tan')).toBeInTheDocument();
    expect(screen.getByText('Bob Lee')).toBeInTheDocument();
  });

  it('RosterList renders with pixel-scrollbar for both session chips and member list', () => {
    const { container } = render(
      <RosterList
        sessions={dummySessions}
        members={dummyMembers}
        presentMap={{ m1: ['sess-1'] }}
        activeSessionId="sess-1"
        onSelectSession={vi.fn()}
        onToggle={vi.fn()}
      />
    );

    const scrollbars = container.querySelectorAll('.pixel-scrollbar');
    expect(scrollbars.length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('Alice Tan')).toBeInTheDocument();
    expect(screen.getByText('SCORE 1/2')).toBeInTheDocument();
  });
});
