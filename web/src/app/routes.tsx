import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useLayout } from './useLayout';
import { PhoneShell } from './PhoneShell';
import { DesktopShell } from './DesktopShell';
import { TabDef } from '../components/ui/TabBar';

// Pixel art icon SVG helpers
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

const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const MusicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const DEFAULT_TABS: TabDef[] = [
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, path: '/' },
  { id: 'attendance', label: 'Attendance', icon: <AttendanceIcon />, path: '/attendance' },
  { id: 'videos', label: 'Videos', icon: <VideoIcon />, path: '/videos' },
  { id: 'studio', label: 'Studio', icon: <MusicIcon />, path: '/studio' }
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const layout = useLayout();

  if (layout === 'desktop') {
    return <DesktopShell nav={DEFAULT_TABS}>{children}</DesktopShell>;
  }

  return <PhoneShell tabs={DEFAULT_TABS}>{children}</PhoneShell>;
};

export const AppRoutes: React.FC = () => {
  return (
    <AppLayout>
      <Routes>
        <Route
          path="/"
          element={
            <div className="font-display text-sm">
              <h1 className="text-xl mb-4">Calendar</h1>
              <p className="font-body text-base">UMDSC Dance Class Calendar</p>
            </div>
          }
        />
        <Route
          path="/attendance"
          element={
            <div className="font-display text-sm">
              <h1 className="text-xl mb-4">Attendance</h1>
              <p className="font-body text-base">Monthly Attendance Tracker</p>
            </div>
          }
        />
        <Route
          path="/videos"
          element={
            <div className="font-display text-sm">
              <h1 className="text-xl mb-4">Videos</h1>
              <p className="font-body text-base">Class Routine Videos</p>
            </div>
          }
        />
        <Route
          path="/studio"
          element={
            <div className="font-display text-sm">
              <h1 className="text-xl mb-4">Music Studio</h1>
              <p className="font-body text-base">DanceCue Practice Studio</p>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
};
