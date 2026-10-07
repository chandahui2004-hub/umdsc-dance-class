import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionEditor } from './SessionEditor';

const mockCall = vi.fn();
vi.mock('../../lib/api', () => ({
  call: (...args: any[]) => mockCall(...args),
  errorMessage: (err: any) => String(err),
  ApiError: class extends Error {}
}));

const styles = [{ id: 'st-pop', name: 'Popping', colorKey: 'blue', active: true }] as any[];
const instructors = [
  { id: 'inst-lam', name: 'Lam Hong Woh', active: true },
  { id: 'inst-kelvin', name: 'Newstyle Kelvin', active: true }
] as any[];

const session = (instructorId: string) =>
  ({
    id: 's1', version: 3, eventId: 'evt-1', styleId: 'st-pop', seq: 1, date: '2026-10-05', start: '20:00', end: '22:00',
    instructorId, venue: 'Studio A', status: 'scheduled', note: '', active: true
  }) as any;

const renderEditor = (instructorId: string) =>
  render(
    <SessionEditor
      isOpen
      onClose={() => {}}
      session={session(instructorId)}
      styles={styles}
      instructors={instructors}
      allowedInstructorIds={['inst-lam', 'inst-kelvin']}
      onSaved={() => undefined}
    />
  );

describe('SessionEditor instructor drop-down', () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockCall.mockResolvedValue({ ok: true, data: {} });
  });

  it('shows a deleted current instructor as "Removed instructor", selected, and saves it unchanged', async () => {
    renderEditor('inst-gone');
    const select = document.getElementById('instructor-select') as HTMLSelectElement;
    const removed = screen.getByRole('option', { name: "Removed instructor (not in this event's list)" }) as HTMLOptionElement;
    expect(removed.value).toBe('inst-gone');
    expect(removed.selected).toBe(true);
    expect(select.value).toBe('inst-gone');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mockCall).toHaveBeenCalledWith('sessions.update', expect.objectContaining({ instructorId: 'inst-gone' })));
  });

  it('shows no "Removed instructor" option for a known instructor', () => {
    renderEditor('inst-lam');
    expect(screen.queryByRole('option', { name: /Removed instructor/ })).toBeNull();
    expect((document.getElementById('instructor-select') as HTMLSelectElement).value).toBe('inst-lam');
  });
});
