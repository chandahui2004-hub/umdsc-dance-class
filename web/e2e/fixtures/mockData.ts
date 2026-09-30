import type { DancerBootstrap, AdminBootstrap } from '@umdsc/shared';

export const dancerBootstrap: DancerBootstrap = {
  profile: {
    matricKey: '17201234',
    fullName: 'SARAH BINTI AHMAD',
    eventIds: ['evt-oct'],
    months: ['2026-10'],
    perms: {
      'calendar.view': '*',
      'attendance.view.own': '*',
      'videos.view': '*',
      'music.view': '*'
    }
  },
  events: [
    {
      id: 'evt-oct',
      name: 'OCT MONTHLY CLASS',
      type: 'monthly' as const,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'active' as const,
      styleIds: ['style-hiphop']
    }
  ],
  styles: [
    {
      id: 'style-hiphop',
      name: 'Hip Hop',
      aliases: ['hiphop'],
      colorKey: 'orange',
      defaultWeekday: 4,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'inst-1',
      defaultVenue: 'Dance Room 1',
      attendanceFolderId: 'f-att-1',
      videoFolderId: 'f-vid-1',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  instructors: [
    {
      id: 'inst-1',
      name: 'Alex Tan',
      contact: '0123456789',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  sessions: [
    {
      id: 'ses-1',
      month: '2026-10',
      styleId: 'style-hiphop',
      seq: 1,
      date: '2026-10-08',
      start: '20:00',
      end: '22:00',
      instructorId: 'inst-1',
      venue: 'Dance Room 1',
      status: 'scheduled',
      note: '',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  attendance: [
    {
      sessionId: 'ses-1',
      present: true
    }
  ],
  videos: [],
  music: [],
  sections: []
};

export const adminBootstrap: AdminBootstrap = {
  profile: {
    username: 'admin',
    displayName: 'Club Admin',
    perms: {
      'calendar.view': '*',
      'attendance.view.all': '*',
      'attendance.edit': '*',
      'sessions.edit': '*',
      'styles.edit': '*',
      'instructors.edit': '*',
      'members.view': '*',
      'members.import': '*',
      'videos.view': '*',
      'videos.upload': '*',
      'videos.edit': '*',
      'music.view': '*',
      'music.edit': '*',
      'sections.edit': '*',
      'settings.edit': '*',
      'admins.manage': '*',
      'roles.manage': '*',
      'export.download': '*'
    }
  },
  styles: [
    {
      id: 'style-hiphop',
      name: 'Hip Hop',
      aliases: ['hiphop'],
      colorKey: 'orange',
      defaultWeekday: 4,
      defaultStart: '20:00',
      defaultEnd: '22:00',
      defaultInstructorId: 'inst-1',
      defaultVenue: 'Dance Room 1',
      attendanceFolderId: 'f-att-1',
      videoFolderId: 'f-vid-1',
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ],
  instructors: [],
  sessions: [],
  roles: [],
  months: ['2026-10'],
  settings: {
    clubName: 'UMDSC Dance Club'
  }
};
