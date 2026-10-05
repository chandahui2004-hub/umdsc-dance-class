import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClassSession } from '@umdsc/shared';
import { RosterList } from './RosterList';

const sessions = [
  { id: 's1', seq: 1, date: '2026-10-08', start: '20:00', end: '21:30' }
] as ClassSession[];
const LONG = 'NUR AISYAH BINTI MOHAMAD KAMARUL ZAMAN';
const members = [{ memberId: 'm1', fullName: LONG, matric: '22001111' }];

function renderList() {
  return render(
    <RosterList
      sessions={sessions}
      members={members}
      presentMap={{}}
      activeSessionId="s1"
      onSelectSession={() => {}}
      onToggle={vi.fn()}
    />
  );
}

describe('RosterList full names', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shortens long names by default', () => {
    renderList();
    expect(screen.getByText(LONG).className).toContain('truncate');
  });

  it('SHOW FULL NAMES wraps names instead of cutting them, and stacks the button under the name', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /SHOW FULL NAMES/ }));

    const name = screen.getByText(LONG);
    expect(name.className).not.toContain('truncate');
    expect(name.className).toContain('break-words');
    expect(screen.getByTestId('roster-row-m1').className).toContain('flex-col');
    expect(screen.getByRole('button', { name: /SHORT NAMES/ })).toBeDefined();
  });

  it('remembers the choice on this device', () => {
    const first = renderList();
    fireEvent.click(screen.getByRole('button', { name: /SHOW FULL NAMES/ }));
    first.unmount();

    renderList();
    expect(screen.getByText(LONG).className).not.toContain('truncate');
  });
});
