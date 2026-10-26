import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RolesPage } from './RolesPage';

const mockPost = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args)
  },
  call: (...args: any[]) => mockPost(...args),
  errorMessage: (err: any) => String(err)
}));

const mockRoles = [
  {
    id: 'role_admin',
    name: 'Admin',
    description: 'System Administrator',
    loginType: 'admin',
    isSystem: true,
    version: 1,
    permissions: ['admins.manage', 'roles.manage', 'settings.edit', 'calendar.view']
  },
  {
    id: 'role_class_rep',
    name: 'Class Rep',
    description: 'Attendance Taker & Sheet Export',
    loginType: 'admin',
    isSystem: true,
    version: 1,
    permissions: ['attendance.view.all', 'attendance.edit', 'export.download']
  },
  {
    id: 'role_dancer',
    name: 'Dancer',
    description: 'Standard Club Dancer',
    loginType: 'dancer',
    isSystem: true,
    version: 1,
    permissions: ['calendar.view', 'attendance.view.own']
  }
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'roles.list') {
        return { ok: true, data: mockRoles };
      }
      if (action === 'styles.list') {
        return { ok: true, data: [] };
      }
      return { ok: true, data: {} };
    });
  });

  it('renders all roles including Class Rep and Admin', async () => {
    renderWithClient(<RolesPage />);

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Class Rep')).toBeInTheDocument();
    expect(screen.getByText('Dancer')).toBeInTheDocument();
  });

  it('allows opening the create role form and submits a new custom admin role', async () => {
    renderWithClient(<RolesPage />);

    const newRoleBtn = await screen.findByRole('button', { name: /\+ NEW ROLE/i });
    fireEvent.click(newRoleBtn);

    expect(screen.getByText('CREATE NEW ROLE')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Role Name/i);
    fireEvent.change(nameInput, { target: { value: 'Media Specialist' } });

    // Switch login type to Admin
    const loginSelect = screen.getByLabelText(/Login Type/i);
    fireEvent.change(loginSelect, { target: { value: 'admin' } });

    const saveBtn = screen.getByRole('button', { name: /SAVE ROLE/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('roles.create', expect.objectContaining({
        name: 'Media Specialist',
        loginType: 'admin'
      }));
    });
  });
});
