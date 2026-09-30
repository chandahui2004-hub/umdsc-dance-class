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
import { TodayPage } from '../features/classes/TodayPage';
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
import { EventPicker } from '../components/ui/EventPicker';
import { useEventAutoSync } from '../lib/useEventAutoSync';

// Pixel art icon SVG helpers
const TodayIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-13h-2v6h6v-2h-4V7z" />
  </svg>
);

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

const DANCER_TABS: TabDef[] = [
  { id: 'calendar', label: 'Home', icon: <CalendarIcon />, path: '/' },
  { id: 'studio', label: 'Studio', icon: <MusicIcon />, path: '/studio' },
  { id: 'me', label: 'Me', icon: <UserIcon />, path: '/me' }
];

const ADMIN_TABS: TabDef[] = [
  { id: 'today', label: 'Today', icon: <TodayIcon />, path: '/admin/today' },
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, path: '/admin/calendar' },
  { id: 'events', label: 'Events', icon: <EventIcon />, path: '/admin/events' },
  { id: 'attendance', label: 'Attendance', icon: <AttendanceIcon />, path: '/admin/attendance' },
  { id: 'media', label: 'Media', icon: <VideoIcon />, path: '/admin/media' },
  { id: 'more', label: 'More', icon: <MoreIcon />, path: '/admin/more' }
];

export const ShellLayout: React.FC<{ tabs: TabDef[]; topBar?: React.ReactNode; children: React.ReactNode }> = ({
  tabs,
  topBar,
  children
}) => {
  const layout = useLayout();
  if (layout === 'desktop') {
    return <DesktopShell nav={tabs} topBar={topBar}>{children}</DesktopShell>;
  }
  return <PhoneShell tabs={tabs} topBar={topBar}>{children}</PhoneShell>;
};

/** Admin shell: event picker on every page, and the 10-minute registration check. */
const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEventAutoSync();
  return (
    <ShellLayout tabs={ADMIN_TABS} topBar={<EventPicker />}>
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
                <Route path="today" element={<TodayPage />} />
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
                <Route
                  path="more"
                  element={
                    <div className="space-y-4">
                      <h1 className="font-display text-xl mb-4">More</h1>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <a
                          href="/admin/events/new"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            NEW EVENT
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Set up a monthly class, trial class or workshop from its registration form
                          </p>
                        </a>
                        <a
                          href="/admin/members"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            REGISTERED DANCERS
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            View member roster, contact info, styles, and export CSV
                          </p>
                        </a>
                        <a
                          href="/admin/styles"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            DANCE STYLES
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Configure style metadata, aliases, colors, and folders
                          </p>
                        </a>
                        <a
                          href="/admin/instructors"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            INSTRUCTORS
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Manage club dance instructors and contact details
                          </p>
                        </a>
                        <a
                          href="/admin/roles"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            ROLES & PERMISSIONS
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Manage permissions matrix and dancer role assignments
                          </p>
                        </a>
                        <a
                          href="/admin/admins"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            ADMIN ACCOUNTS
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Manage admin user accounts, roles, and passwords
                          </p>
                        </a>
                        <a
                          href="/admin/settings"
                          className="p-4 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] block hover:bg-[var(--c-bg)]"
                        >
                          <h2 className="font-display text-sm text-[var(--c-ink)] mb-1">
                            SYSTEM SETTINGS
                          </h2>
                          <p className="font-body text-xs text-[var(--c-darkgrey)]">
                            Google Drive folder links and update history
                          </p>
                        </a>
                      </div>
                    </div>
                  }
                />
                <Route path="*" element={<Navigate to="/admin/today" replace />} />
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
                <Route
                  path="studio"
                  element={
                    <div>
                      <h1 className="font-display text-xl mb-4">Music Studio</h1>
                      <p className="font-body text-base">DanceCue Practice Studio</p>
                    </div>
                  }
                />
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
