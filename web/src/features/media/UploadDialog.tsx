import React, { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { getAccessToken } from '../../lib/google/gis';
import { pickFolder, hasPickerGrant } from '../../lib/google/picker';
import { ensureFolderPath } from '../../lib/google/driveFolders';
import { uploadResumable, makePublic, videoFormatWarning } from '../../lib/google/resumableUpload';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import type { ClassSession, DanceStyle, Month } from '@umdsc/shared';

interface UploadDialogProps {
  type: 'video' | 'mp3';
  month: Month;
  style: DanceStyle;
  sessions: ClassSession[];
  initialSessionId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadDialog: React.FC<UploadDialogProps> = ({
  type,
  month,
  style,
  sessions,
  initialSessionId,
  onClose,
  onSuccess
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId || (sessions[0]?.id || '')
  );
  const [file, setFile] = useState<File | null>(null);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);
  const [warningIgnored, setWarningIgnored] = useState<boolean>(false);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormatWarning(null);
    setWarningIgnored(false);

    if (e.target.files && e.target.files[0]) {
      const chosen = e.target.files[0];
      setFile(chosen);
      if (type === 'video') {
        const warning = videoFormatWarning(chosen);
        if (warning) {
          setFormatWarning(warning);
        }
      }
    }
  };

  const handleStartUpload = async () => {
    if (!file || !selectedSessionId) return;
    setIsUploading(true);
    setError(null);
    setProgressPercent(0);
    setUploadStatus('Authenticating with Google...');

    let wakeLock: any = null;
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLock = await (navigator as any).wakeLock.request('screen').catch(() => null);
      }

      // 1. Get OAuth access token
      const token = await getAccessToken();

      // 2. Fetch target folder details from API
      setUploadStatus('Resolving Google Drive destination folder...');
      const targetRes = await api.post<{
        rootFolderId: string;
        monthFolderName: string;
        classFolderName: string;
        musicFolderName: string;
      }>('videos.targetFolder', { sessionId: selectedSessionId });

      const { rootFolderId, monthFolderName, classFolderName, musicFolderName } = targetRes.data;

      // 3. Check picker grant if rootFolderId is configured
      if (rootFolderId && !hasPickerGrant(rootFolderId)) {
        setUploadStatus('Authorizing folder access via Google Picker...');
        try {
          await pickFolder(token, rootFolderId);
        } catch {
          // If picker cancelled or fails, continue with rootFolderId
        }
      }

      // 4. Ensure folder path exists
      setUploadStatus('Ensuring Drive subfolders exist...');
      const pathNames =
        type === 'mp3'
          ? [monthFolderName, classFolderName, musicFolderName]
          : [monthFolderName, classFolderName];

      const parentFolderId = await ensureFolderPath(token, rootFolderId, pathNames);

      // 5. Perform Resumable Upload
      setUploadStatus('Uploading file to Google Drive...');
      const uploaded = await uploadResumable({
        token,
        file,
        parentId: parentFolderId,
        name: file.name,
        onProgress: (sent, total) => {
          const pct = Math.round((sent / total) * 100);
          setProgressPercent(pct);
        }
      });

      // 6. Make public (anyone reader)
      setUploadStatus('Updating file permissions...');
      await makePublic(token, uploaded.id);

      // 7. Register in backend database
      setUploadStatus('Registering file with club system...');
      if (type === 'video') {
        await api.post('videos.register', {
          driveFileId: uploaded.id,
          sessionId: selectedSessionId,
          title: file.name
        });
      } else {
        await api.post('music.create', {
          styleId: style.id,
          month,
          sessionId: selectedSessionId,
          title: file.name,
          sourceType: 'mp3',
          driveFileId: uploaded.id
        });
      }

      setIsUploading(false);
      onSuccess();
    } catch (err: any) {
      setIsUploading(false);
      setError(errorMessage(err) || err.message || 'Upload failed');
    } finally {
      if (wakeLock) {
        wakeLock.release().catch(() => null);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Panel
          title={type === 'video' ? 'UPLOAD CLASS RECAP VIDEO' : 'UPLOAD CLASS MP3 MUSIC'}
          className="px-corners bg-[var(--c-panel)] space-y-4"
        >
          {error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-2 border-[var(--c-red)] p-3 text-[var(--c-red)] font-bold text-xs"
            >
              {error}
            </div>
          )}

          {/* Session Selector */}
          <Field label="Target Class Session" required>
            <select
              value={selectedSessionId}
              disabled={isUploading}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.seq} {s.date} ({s.start} - {s.end}) {s.venue ? `@ ${s.venue}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* File Picker */}
          <Field label={type === 'video' ? 'Select Video File' : 'Select MP3 File'} required>
            <input
              type="file"
              accept={type === 'video' ? 'video/mp4,video/*,.mov,.mp4' : 'audio/mp3,audio/*,.mp3'}
              disabled={isUploading}
              onChange={handleFileChange}
              className="w-full min-h-[44px] p-2 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
            />
          </Field>

          {/* Video Format Warning Alert */}
          {formatWarning && !warningIgnored && (
            <div className="p-3 bg-[var(--c-peach)] border-2 border-[var(--c-orange)] text-[var(--c-ink)] space-y-2 text-xs">
              <p className="font-bold text-[var(--c-brown)]">VIDEO FORMAT WARNING</p>
              <p>{formatWarning}</p>
              <div className="flex gap-2 pt-1">
                <PixelButton
                  size="md"
                  variant="primary"
                  onClick={() => setWarningIgnored(true)}
                >
                  CONTINUE ANYWAY
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => {
                    setFile(null);
                    setFormatWarning(null);
                  }}
                >
                  CHOOSE ANOTHER FILE
                </PixelButton>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="p-4 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] space-y-2">
              <div className="flex justify-between font-display text-xs text-[var(--c-ink)]">
                <span>{uploadStatus}</span>
                <span className="font-bold text-[var(--c-navy)]">{progressPercent}%</span>
              </div>
              <div className="w-full h-4 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] overflow-hidden">
                <div
                  className="h-full bg-[var(--c-green)] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="p-2 bg-[var(--c-yellow)] border border-[var(--c-ink)] text-center font-display text-[10px] text-[var(--c-ink)] font-bold animate-pulse">
                KEEP THIS PAGE OPEN UNTIL UPLOAD COMPLETES
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
            <PixelButton
              size="md"
              variant="secondary"
              disabled={isUploading}
              onClick={onClose}
            >
              CANCEL
            </PixelButton>
            <PixelButton
              size="md"
              variant="primary"
              className="flex-1"
              disabled={isUploading || !file || (Boolean(formatWarning) && !warningIgnored)}
              onClick={handleStartUpload}
            >
              {isUploading ? 'UPLOADING...' : 'START UPLOAD'}
            </PixelButton>
          </div>
        </Panel>
      </div>
    </div>
  );
};
