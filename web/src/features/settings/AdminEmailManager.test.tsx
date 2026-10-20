// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminEmailManager, parseEmailList } from './AdminEmailManager';

describe('AdminEmailManager', () => {
  it('parses multiple emails separated by commas, Chinese commas, semicolons, and spaces', () => {
    const raw = 'charlotteyee923@gmail.com, zhihan260805@gmail.com，24078221@siswa.um.edu.my; vernicedingjiemin@gmail.com';
    const parsed = parseEmailList(raw);
    expect(parsed).toEqual([
      'charlotteyee923@gmail.com',
      'zhihan260805@gmail.com',
      '24078221@siswa.um.edu.my',
      'vernicedingjiemin@gmail.com'
    ]);
  });

  it('renders 4 individual cards for 4 email addresses and default club email', () => {
    const emails = 'charlotteyee923@gmail.com, zhihan260805@gmail.com, 24078221@siswa.um.edu.my, vernicedingjiemin@gmail.com';
    render(
      <AdminEmailManager
        emailsRaw={emails}
        clubEmail="umdancesportc@gmail.com"
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('charlotteyee923@gmail.com')).toBeDefined();
    expect(screen.getByText('zhihan260805@gmail.com')).toBeDefined();
    expect(screen.getByText('24078221@siswa.um.edu.my')).toBeDefined();
    expect(screen.getByText('vernicedingjiemin@gmail.com')).toBeDefined();
    expect(screen.getByText(/umdancesportc@gmail.com/)).toBeDefined();
    expect(screen.getByText(/4 custom addresses/)).toBeDefined();
  });

  it('allows adding a new email and calls onSave with updated list', () => {
    const onSave = vi.fn();
    render(
      <AdminEmailManager
        emailsRaw="user1@gmail.com"
        clubEmail="umdancesportc@gmail.com"
        onSave={onSave}
      />
    );

    const input = screen.getByPlaceholderText(/Enter admin email/i);
    fireEvent.change(input, { target: { value: 'user2@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /ADD EMAIL/i }));

    expect(onSave).toHaveBeenCalledWith('user1@gmail.com, user2@gmail.com');
  });

  it('opens Popconfirm when clicking DELETE and deletes upon confirmation', () => {
    const onSave = vi.fn();
    render(
      <AdminEmailManager
        emailsRaw="user1@gmail.com, user2@gmail.com"
        clubEmail="umdancesportc@gmail.com"
        onSave={onSave}
      />
    );

    const deleteButtons = screen.getAllByRole('button', { name: /DELETE/i });
    fireEvent.click(deleteButtons[0]);

    // Modal popup appears
    expect(screen.getByText(/Delete notification email/i)).toBeDefined();
    expect(screen.getAllByText(/user1@gmail.com/i).length).toBeGreaterThanOrEqual(2);

    // Confirm delete
    fireEvent.click(screen.getByRole('button', { name: /CONFIRM DELETE/i }));
    expect(onSave).toHaveBeenCalledWith('user2@gmail.com');
  });

  it('allows editing an email inline and saving', () => {
    const onSave = vi.fn();
    render(
      <AdminEmailManager
        emailsRaw="user1@gmail.com"
        clubEmail="umdancesportc@gmail.com"
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /EDIT/i }));
    const editInput = screen.getByDisplayValue('user1@gmail.com');
    fireEvent.change(editInput, { target: { value: 'updated@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /SAVE/i }));

    expect(onSave).toHaveBeenCalledWith('updated@gmail.com');
  });
});
