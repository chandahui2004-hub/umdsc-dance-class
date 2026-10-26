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

  it('invalidates cache and clears stale bootstrap on save', async () => {
    localStorage.setItem('boot:dancer:test', JSON.stringify({ data: { sessions: [] } }));
    renderEditor('inst-lam');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mockCall).toHaveBeenCalledWith('sessions.update', expect.anything()));
    await waitFor(() => expect(localStorage.getItem('boot:dancer:test')).toBeNull());
  });

  it('allows changing venue even if minDate and maxDate differ from current session date', async () => {
    render(
      <SessionEditor
        isOpen
        onClose={() => {}}
        session={session('inst-lam')} // date is 2026-10-05
        styles={styles}
        instructors={instructors}
        allowedInstructorIds={['inst-lam']}
        minDate="2026-11-03"
        maxDate="2026-11-03"
        onSaved={() => undefined}
      />
    );

    const dateInput = screen.getByLabelText(/date/i);
    // Ensure HTML5 constraint attributes are NOT set so Chromium never displays "Value must be 03/11/2026."
    expect(dateInput.getAttribute('min')).toBeNull();
    expect(dateInput.getAttribute('max')).toBeNull();

    const venueInput = screen.getByLabelText(/venue/i);
    fireEvent.change(venueInput, { target: { value: 'New Dance Hall' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        'sessions.update',
        expect.objectContaining({
          venue: 'New Dance Hall',
          date: '2026-10-05'
        })
      )
    );
  });

  it('shows in-app alert when user explicitly changes date outside event bounds', async () => {
    render(
      <SessionEditor
        isOpen
        onClose={() => {}}
        session={session('inst-lam')} // date is 2026-10-05
        styles={styles}
        instructors={instructors}
        allowedInstructorIds={['inst-lam']}
        minDate="2026-10-01"
        maxDate="2026-10-31"
        onSaved={() => undefined}
      />
    );

    const dateInput = screen.getByLabelText(/date/i);
    fireEvent.change(dateInput, { target: { value: '2026-11-15' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Class date must be inside the event (2026-10-01 to 2026-10-31)'
      );
    });
    expect(mockCall).not.toHaveBeenCalled();
  });
});


