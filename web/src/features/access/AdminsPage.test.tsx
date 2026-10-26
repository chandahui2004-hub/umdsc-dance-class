import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminsPage } from './AdminsPage';

const mockPost = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args)
  },
  call: (...args: any[]) => mockPost(...args),
  errorMessage: (err: any) => String(err)
}));

const mockAdmins = [
  {
    id: 'adm_1',
    username: 'clubadmin',
    displayName: 'Head Admin',
    roleId: 'role_admin',
    version: 1,
    active: true
  },
  {
    id: 'adm_2',
    username: 'classrep',
    displayName: 'Class Rep Lead',
    roleId: 'role_class_rep',
    version: 1,
    active: true
  }
];

const mockRoles = [
  {
    id: 'role_admin',
    name: 'Admin',
    description: 'System Administrator',
    loginType: 'admin',
    isSystem: true,
    version: 1
  },
  {
    id: 'role_class_rep',
    name: 'Class Rep',
    description: 'Attendance Taker & Sheet Export',
    loginType: 'admin',
    isSystem: true,
    version: 1
  },
  {
    id: 'role_dancer',
    name: 'Dancer',
    description: 'Standard Club Dancer',
    loginType: 'dancer',
    isSystem: true,
    version: 1
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

describe('AdminsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockImplementation(async (action: string) => {
      if (action === 'admins.list') {
        return { ok: true, data: mockAdmins };
      }
      if (action === 'roles.list') {
        return { ok: true, data: mockRoles };
      }
      return { ok: true, data: {} };
    });
  });

  it('renders existing admins and maps role names correctly', async () => {
    renderWithClient(<AdminsPage />);

    expect(await screen.findByText('clubadmin')).toBeInTheDocument();
    expect(screen.getByText('classrep')).toBeInTheDocument();
    expect(screen.getByText('Class Rep Lead')).toBeInTheDocument();
  });

  it('allows creating an admin account and selecting Class Rep role', async () => {
    renderWithClient(<AdminsPage />);

    const newAdminBtn = await screen.findByRole('button', { name: /\+ NEW ADMIN/i });
    fireEvent.click(newAdminBtn);

    expect(screen.getByText('CREATE ADMIN ACCOUNT')).toBeInTheDocument();

    const usernameInput = screen.getByLabelText(/^Username/i);
    fireEvent.change(usernameInput, { target: { value: 'testrep' } });

    const displayNameInput = screen.getByLabelText(/^Display Name/i);
    fireEvent.change(displayNameInput, { target: { value: 'Test Rep' } });

    const passwordInput = screen.getByLabelText(/^Password/i);
    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });

    // Select roleId
    const roleSelect = screen.getByLabelText(/Assigned Role/i);
    fireEvent.change(roleSelect, { target: { value: 'role_class_rep' } });

    const createBtn = screen.getByRole('button', { name: /CREATE ADMIN/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('admins.create', expect.objectContaining({
        username: 'testrep',
        displayName: 'Test Rep',
        password: 'Secret123!',
        roleId: 'role_class_rep'
      }));
    });
  });
});
