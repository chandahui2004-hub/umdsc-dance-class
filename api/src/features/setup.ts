import { Route } from '../router';
import { AppError } from '../errors';
import { extractDriveId, PERMISSIONS } from '@umdsc/shared';
import { SCHEMA } from '../db/schema';
import { openDb } from '../db/db';
import { hashPassword, PASSWORD_ITERATIONS } from '../security/passwords';
import { newId } from '../db/ids';
import { importEventMembers } from './eventImport';
import { readEventMembers } from './eventMembers';

export function getSetupRoutes(): Record<string, Route> {
  return {
    'setup.status': {
      perm: 'public',
      write: false,
      handler: (ctx) => {
        const sysId = ctx.props.get('SYSTEM_SPREADSHEET_ID');
        return { initialized: Boolean(sysId) };
      }
    },

    'setup.init': {
      perm: 'public',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const existingSysId = ctx.props.get('SYSTEM_SPREADSHEET_ID');
        if (existingSysId) {
          throw new AppError('SETUP_DONE', 'System is already initialized');
        }

        const expectedCode = ctx.props.get('SETUP_CODE');
        if (!expectedCode || payload.setupCode !== expectedCode) {
          throw new AppError('FORBIDDEN', 'Invalid setup code');
        }

        const driveResult = extractDriveId(payload.dbFolderUrl);
        if (!driveResult) {
          throw new AppError('LINK_INVALID', 'Invalid Google Drive folder link');
        }

        const folderId = driveResult.id;
        const info = ctx.drive.info(folderId);
        if (!info.exists || info.kind !== 'folder') {
          throw new AppError('LINK_WRONG_KIND', 'The link must point to a Google Drive folder');
        }
        if (!info.canEdit) {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Share this folder with ${ctx.clubEmail} as Editor, then try again.`
          );
        }

        // Create UMDSC_System spreadsheet in the DB folder
        const ss = ctx.drive.createSpreadsheet('UMDSC_System', folderId);

        // Add all tabs and headers from schema
        for (const [tab, headers] of Object.entries(SCHEMA)) {
          ss.addSheet(tab, [...headers]);
        }

        ctx.props.set('SYSTEM_SPREADSHEET_ID', ss.id);
        ctx.props.set('DATA_VERSION', '1');
        ctx.props.set('PERM_VERSION', '1');

        // Open DB using the newly created spreadsheet
        const db = openDb(ctx.drive, ss.id);
        const now = ctx.now();

        // 1. Seed Settings
        db.settings.insert({ key: 'dbFolderId', value: folderId }, 'setup', now);
        db.settings.insert({ key: 'clubEmail', value: ctx.clubEmail }, 'setup', now);
        db.settings.insert({ key: 'clubName', value: 'UM Dancesport Club' }, 'setup', now);

        // 2. Seed Roles
        const adminRole = db.roles.insert(
          {
            name: 'Admin',
            description: 'System Administrator',
            loginType: 'admin',
            isSystem: true
          },
          'setup',
          now
        );

        const dancerRole = db.roles.insert(
          {
            name: 'Dancer',
            description: 'Standard Club Dancer',
            loginType: 'dancer',
            isSystem: true
          },
          'setup',
          now
        );

        // 3. Seed RolePermissions
        for (const p of PERMISSIONS) {
          db.rolePermissions.insert(
            { roleId: adminRole.id, permission: p.code },
            'setup',
            now
          );
        }

        const dancerDefaultPerms = [
          'calendar.view',
          'attendance.view.own',
          'videos.view',
          'music.view'
        ] as const;

        for (const code of dancerDefaultPerms) {
          db.rolePermissions.insert(
            { roleId: dancerRole.id, permission: code },
            'setup',
            now
          );
        }

        // 4. Seed Default Instructors
        const insLam = db.instructors.insert(
          {
            name: 'Lam Hong Woh',
            contact: '',
            color: 'pink',
            photoUrl: '/instructors/lam-hong-woh.png',
            photosJson: '[]',
            styleIds: []
          },
          'setup',
          now
        );

        const insCarmen = db.instructors.insert(
          {
            name: 'Carmen Loh',
            contact: '',
            color: 'blue',
            photoUrl: '/instructors/carmen-loh.png',
            photosJson: '[]',
            styleIds: []
          },
          'setup',
          now
        );

        const insKelvin = db.instructors.insert(
          {
            name: 'Newstyle Kelvin',
            contact: '',
            color: 'orange',
            photoUrl: '/instructors/newstyle-kelvin.png',
            photosJson: '[]',
            styleIds: []
          },
          'setup',
          now
        );

        // 5. Seed DanceStyles
        db.styles.insert(
          {
            name: 'Locking',
            aliases: ['locking'],
            colorKey: 'green',
            defaultWeekday: null,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: insKelvin.id,
            defaultVenue: '',
            attendanceFolderId: '',
            videoFolderId: ''
          },
          'setup',
          now
        );

        db.styles.insert(
          {
            name: 'Popping',
            aliases: ['popping'],
            colorKey: 'blue',
            defaultWeekday: null,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: insCarmen.id,
            defaultVenue: '',
            attendanceFolderId: '',
            videoFolderId: ''
          },
          'setup',
          now
        );

        db.styles.insert(
          {
            name: 'Hip Hop',
            aliases: ['hip hop', 'hiphop', 'hip-hop'],
            colorKey: 'orange',
            defaultWeekday: null,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: insKelvin.id,
            defaultVenue: '',
            attendanceFolderId: '',
            videoFolderId: ''
          },
          'setup',
          now
        );

        db.styles.insert(
          {
            name: 'Latin',
            aliases: ['latin'],
            colorKey: 'pink',
            defaultWeekday: null,
            defaultStart: '20:00',
            defaultEnd: '22:00',
            defaultInstructorId: insLam.id,
            defaultVenue: '',
            attendanceFolderId: '',
            videoFolderId: ''
          },
          'setup',
          now
        );

        // 5. Seed First Admin User
        const salt = newId('salt');
        const hmac = (ctx as any)._secrets?.hmac;
        const passwordHash = hashPassword(payload.adminPassword, salt, PASSWORD_ITERATIONS, hmac);

        db.admins.insert(
          {
            username: payload.adminUsername,
            displayName: payload.adminDisplayName,
            passwordHash,
            salt,
            iterations: PASSWORD_ITERATIONS,
            roleId: adminRole.id
          },
          'setup',
          now
        );

        return { initialized: true };
      }
    },

    'debug.testRecapEmail': {
      perm: 'public',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const to = payload?.to || 'chandahui2004@gmail.com';
        const name = payload?.name || 'CHAN DA HUI';
        const styleName = payload?.styleName || 'Hip Hop';
        const seq = payload?.seq || 1;
        const date = payload?.date || '2026-10-16';

        const subject = `[UMDSC] Class Recap Video Uploaded - ${styleName} (Class #${seq} - ${date})`;
        const body = `Hi ${name},\n\nThe class recap video for ${styleName} Class #${seq} (${date}) has been uploaded and is now available to watch!\n\nAccess your class recap and practice music here:\nhttps://umdsc-dance-class.umdancesportc.workers.dev\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`;
        const htmlBody = `<div style="font-family: sans-serif; line-height: 1.6; color: #222;">
  <h2 style="color: #6366f1;">UMDSC Dance Class System</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>The class recap video for <strong>${styleName} Class #${seq} (${date})</strong> has been uploaded and is now available to watch!</p>
  <p style="margin: 24px 0;">
    <a href="https://umdsc-dance-class.umdancesportc.workers.dev" style="background-color: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">WATCH CLASS RECAP</a>
  </p>
  <p style="color: #666; font-size: 13px;">Or open: <a href="https://umdsc-dance-class.umdancesportc.workers.dev">https://umdsc-dance-class.umdancesportc.workers.dev</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">Universiti Malaya Dance Sport Club (UMDSC)</p>
</div>`;

        let quota: any = 'N/A';
        try {
          if (typeof MailApp !== 'undefined') {
            quota = MailApp.getRemainingDailyQuota();
          }
        } catch (e: any) {
          quota = 'Error checking quota: ' + (e?.message || e);
        }

        let sendResult = 'OK';
        try {
          ctx.mail.sendEmail({ to, subject, body, htmlBody });
        } catch (err: any) {
          sendResult = 'Error: ' + (err?.message || err);
        }

        return { sent: sendResult === 'OK', to, subject, quota, sendResult };
      }
    },

    'debug.triggerSync': {
      perm: 'public',
      write: true,
      bumpsData: true,
      handler: (ctx) => {
        const results = [];
        for (const event of ctx.db.events.find(e => e.active && e.status === 'active')) {
          try {
            const res = importEventMembers(ctx, event, { full: true });
            results.push({ eventId: event.id, name: event.name, res });
          } catch (e: any) {
            results.push({ eventId: event.id, name: event.name, error: e?.message || String(e) });
          }
        }
        return results;
      }
    },

    'debug.checkDancer': {
      perm: 'public',
      write: false,
      handler: (ctx) => {
        const events = ctx.db.events.find(e => e.active);
        const members = [];
        for (const e of events) {
          const mList = readEventMembers(ctx, e);
          const found = mList.find(m => m.matricKey === '230051471' || (m.fullName && m.fullName.toUpperCase().includes('CHAN DA HUI')));
          if (found) {
            members.push({ event: e.name, matric: found.matricRaw, flags: found.flags, styles: found.styleNames });
          }
        }
        return members;
      }
    },

    'debug.testRegistrationEmail': {
      perm: 'public',
      write: false,
      handler: (ctx) => {
        const to = 'chandahui2004@gmail.com';
        const name = 'CHAN DA HUI';
        const eventName = 'OCT MONTHLY CLASS';
        const matric = '23005147/1';
        const styles = 'Latin, Locking, Hip Hop';

        const subject = `[UMDSC] Registration Confirmed: ${eventName}`;
        const body = `Hi ${name},\n\nThank you for registering for ${eventName}! Here are your registration details:\n\nMatric Number: ${matric}\nEnrolled Style(s): ${styles}\n\nAccess your dancer portal anytime to view class schedules, attendance, recap videos, and practice music:\nhttps://umdsc-dance-class.umdancesportc.workers.dev\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`;
        const htmlBody = `<div style="font-family: sans-serif; line-height: 1.6; color: #222;">
  <h2 style="color: #6366f1;">UMDSC Dance Class System</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>Thank you for registering for <strong>${eventName}</strong>! Here are your registration details:</p>
  <ul>
    <li><strong>Matric Number:</strong> ${matric}</li>
    <li><strong>Enrolled Style(s):</strong> ${styles}</li>
  </ul>
  <p style="margin: 24px 0;">
    <a href="https://umdsc-dance-class.umdancesportc.workers.dev" style="background-color: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">OPEN DANCER PORTAL</a>
  </p>
  <p style="color: #666; font-size: 13px;">Or open: <a href="https://umdsc-dance-class.umdancesportc.workers.dev">https://umdsc-dance-class.umdancesportc.workers.dev</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">Universiti Malaya Dance Sport Club (UMDSC)</p>
</div>`;

        ctx.mail.sendEmail({ to, subject, body, htmlBody });
        return { sent: true, to, subject };
      }
    }
  };
}
