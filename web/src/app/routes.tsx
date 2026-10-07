import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useLayout } from './useLayout';
import { PhoneShell } from './PhoneShell';
import { DesktopShell } from './DesktopShell';
import { TabDef } from '../components/ui/TabBar';
import { RequireRole } from './guards';
import { TitleScreen } from '../features/auth/TitleScreen';
import { AdminLogin } from '../features/auth/AdminLogin';
import { SetupPage } from '../features/setup/SetupPage';
import { MembersPage } from '../features/members/MembersPage';
import { ClassesPage } from '../features/classes/ClassesPage';
import { StylesPage } from '../features/masterdata/StylesPage';
import { InstructorsPage } from '../features/masterdata/InstructorsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { RolesPage } from '../features/access/RolesPage';
import { AdminsPage } from '../features/access/AdminsPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { MediaPage } from '../features/media/MediaPage';
import { EventsPage } from '../features/events/EventsPage';
import { EventWizard } from '../features/events/EventWizard';
import { DancerHome } from '../features/calendar/DancerHome';
import { MePage } from '../features/me/MePage';
import { StudioPage } from '../features/music-studio/StudioPage';
import { useEventAutoSync } from '../lib/useEventAutoSync';

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 4h-2V2h-2v2H9V2H7v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
  </svg>
);

const AttendanceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);

const MusicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const MoreIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

const EventIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 2h2v20H4V2zm4 2h12l-3 4 3 4H8V4z" />
  </svg>
);

const StyleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19H7v-2h2v2h2v-2h2v2h2.65l-.62-1.39C16.26 16.07 17 14.12 17 12c0-4.97-4.03-9-9-9zm-3 8c-.83 0-1.5-.67-1.5-1.5S8.17 8 9 8s1.5.67 1.5 1.5S9.83 11 9 11zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 8 15 8s1.5.67 1.5 1.5S15.83 11 15 11z" />
  </svg>
);

const InstructorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 11.75A3.25 3.25 0 109 5.25a3.25 3.25 0 000 6.5zm7 2.25H2v1a3 3 0 003 3h8a3 3 0 003-3v-1zm4.5-5h-3v2h3v3h2v-3h3v-2h-3v-3h-2v3z" />
  </svg>
);

const RoleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
);

const SettingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

export interface NavSubItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

export const ADMIN_MORE_ITEMS: NavSubItem[] = [
  { id: 'styles', label: 'Dance Styles', icon: <StyleIcon />, path: '/admin/styles' },
  { id: 'instructors', label: 'Instructors', icon: <InstructorIcon />, path: '/admin/instructors' },
  { id: 'roles', label: 'Roles & Permissions', icon: <RoleIcon />, path: '/admin/roles' },
  { id: 'admins', label: 'Admin Accounts', icon: <UserIcon />, path: '/admin/admins' },
  { id: 'settings', label: 'System Settings', icon: <SettingIcon />, path: '/admin/settings' },
  { id: 'events', label: 'Events', icon: <EventIcon />, path: '/admin/events' }
];

export const DANCER_TABS: TabDef[] = [
  { id: 'calendar', label: 'Home', icon: <CalendarIcon />, path: '/' },
  { id: 'studio', label: 'Studio', icon: <MusicIcon />, path: '/studio' },
  { id: 'me', label: 'Me', icon: <UserIcon />, path: '/me' }
];

export const ADMIN_TABS: TabDef[] = [
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, path: '/admin/calendar' },
  { id: 'attendance', label: 'Attendance', icon: <AttendanceIcon />, path: '/admin/attendance' },
  { id: 'media', label: 'Media', icon: <VideoIcon />, path: '/admin/media' },
  { id: 'members', label: 'Dancers', icon: <UserIcon />, path: '/admin/members' },
  { id: 'more', label: 'More', icon: <MoreIcon />, path: '#more' }
];

export const ShellLayout: React.FC<{
  tabs: TabDef[];
  moreItems?: NavSubItem[];
  topBar?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  tabs,
  moreItems,
  topBar,
  children
}) => {
  const layout = useLayout();
  if (layout === 'desktop') {
    return <DesktopShell nav={tabs} moreItems={moreItems} topBar={topBar}>{children}</DesktopShell>;
  }
  return <PhoneShell tabs={tabs} moreItems={moreItems} topBar={topBar}>{children}</PhoneShell>;
};

/** Admin shell: the 10-minute registration check. Pages that need an event show their own Step I picker. */
const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEventAutoSync();
  return (
    <ShellLayout tabs={ADMIN_TABS} moreItems={ADMIN_MORE_ITEMS}>
      {children}
    </ShellLayout>
  );
};


export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public / Auth routes without shell */}
      <Route path="/login" element={<TitleScreen />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/setup" element={<SetupPage />} />

      {/* Admin routes with Admin Shell */}
      <Route
        path="/admin/*"
        element={
          <RequireRole role="admin">
            <AdminShell>
              <Routes>
                <Route path="today" element={<Navigate to="/admin/calendar" replace />} />
                <Route path="calendar" element={<ClassesPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="media" element={<MediaPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="events/new" element={<EventWizard />} />
                <Route path="events/:id/edit" element={<EventWizard />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="styles" element={<StylesPage />} />
                <Route path="instructors" element={<InstructorsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="admins" element={<AdminsPage />} />
                <Route path="more" element={<Navigate to="/admin/styles" replace />} />
                <Route path="*" element={<Navigate to="/admin/calendar" replace />} />
              </Routes>
            </AdminShell>
          </RequireRole>
        }
      />

      {/* Dancer routes with Dancer Shell */}
      <Route
        path="/*"
        element={
          <RequireRole role="dancer">
            <ShellLayout tabs={DANCER_TABS}>
              <Routes>
                <Route path="/" element={<DancerHome />} />
                <Route path="studio" element={<StudioPage />} />
                <Route path="me" element={<MePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ShellLayout>
          </RequireRole>
        }
      />
    </Routes>
  );
};
