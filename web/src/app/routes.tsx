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

import {
  PixelCalendarIcon as CalendarIcon,
  PixelAttendanceIcon as AttendanceIcon,
  PixelMusicIcon as MusicIcon,
  PixelUserIcon as UserIcon,
  PixelVideoIcon as VideoIcon,
  PixelMoreIcon as MoreIcon,
  PixelEventIcon as EventIcon,
  PixelStyleIcon as StyleIcon,
  PixelInstructorIcon as InstructorIcon,
  PixelRoleIcon as RoleIcon,
  PixelSettingIcon as SettingIcon
} from '../components/ui/pixelIcons';

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
