import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { getAccessToken } from '../../lib/google/gis';
import { pickFolder, hasPickerGrant } from '../../lib/google/picker';
import { ensureClassFolder, ClassFolderTarget } from '../../lib/google/driveFolders';
import { uploadResumable, makePublic, videoFormatWarning } from '../../lib/google/resumableUpload';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import type { ClassSession, DanceStyle } from '@umdsc/shared';

interface UploadDialogProps {
  type: 'video' | 'mp3';
  eventId: string;
  eventName: string;
  style: DanceStyle;
  sessions: ClassSession[];
  initialSessionId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadDialog: React.FC<UploadDialogProps> = ({
  type,
  eventId,
  eventName,
  style,
  sessions,
  initialSessionId,
  onClose,
  onSuccess
}) => {
  const navigate = useNavigate();
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId || (sessions[0]?.id || '')
  );
  const [files, setFiles] = useState<File[]>([]);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);
  const [warningIgnored, setWarningIgnored] = useState<boolean>(false);
  const [checkingFormat, setCheckingFormat] = useState<boolean>(false);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Prevent accidental tab closure while uploading
  useEffect(() => {
    if (!isUploading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Upload is in progress. Leaving will cancel the upload.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormatWarning(null);
    setWarningIgnored(false);

    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);

      if (type === 'mp3') {
        const videoFiles = selected.filter(
          f => (f.type && f.type.startsWith('video/')) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name)
        );
        if (videoFiles.length > 0) {
          setError('Only MP3 or audio files can be uploaded for music. Video files (MP4) are not allowed.');
          setFiles([]);
          e.target.value = '';
          return;
        }
      }

      setFiles(selected);
      if (type === 'video') {
        // Reads the codec out of the file, so Upload stays disabled until the answer is in.
        setCheckingFormat(true);
        void Promise.all(selected.map(f => videoFormatWarning(f)))
          .then(warnings => {
            const first = warnings.find(Boolean);
            if (first) setFormatWarning(first);
          })
          .catch(() => {
            // An unreadable file simply gets no codec warning; the upload itself reports real problems.
          })
          .finally(() => setCheckingFormat(false));
      }
    }
  };

  const removeFile = (idxToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== idxToRemove));
    if (files.length <= 1) {
      setFormatWarning(null);
    }
  };

  const handleStartUpload = async () => {
    if (files.length === 0 || !selectedSessionId) return;
    setIsUploading(true);
    setError(null);
    setProgressPercent(0);
    setCurrentFileIndex(0);
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
      const target = (await api.post<ClassFolderTarget>('videos.targetFolder', { sessionId: selectedSessionId })).data;
      if (!target.videoMasterFolderId && !target.eventFolderId) {
        throw new Error('Set the video master folder on the Events page first.');
      }

      // 3. One-time Picker grant on the video master folder (drive.file scope)
      const grantFolder = target.eventFolderId || target.videoMasterFolderId;
      if (!hasPickerGrant(grantFolder)) {
        setUploadStatus('Authorizing folder access via Google Picker...');
        try {
          await pickFolder(token, grantFolder);
        } catch {
          // If picker cancelled or fails, continue and let Drive report access problems
        }
      }

      // 4. Video master › event › class (› Music)
      setUploadStatus('Ensuring Drive subfolders exist...');
      const folders = await ensureClassFolder(token, target, type);
      const parentFolderId = folders.musicFolderId || folders.classFolderId;

      // 5. Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        const curFile = files[i];
        setCurrentFileIndex(i);
        const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
        setUploadStatus(`${prefix}Uploading ${curFile.name} to Google Drive...`);
        setProgressPercent(0);

        const uploaded = await uploadResumable({
          token,
          file: curFile,
          parentId: parentFolderId,
          name: curFile.name,
          onProgress: (sent, total) => {
            const pct = Math.round((sent / total) * 100);
            setProgressPercent(pct);
          }
        });

        setUploadStatus(`${prefix}Updating file permissions...`);
        await makePublic(token, uploaded.id);

        setUploadStatus(`${prefix}Registering file with club system...`);
        if (type === 'video') {
          await api.post('videos.register', {
            driveFileId: uploaded.id,
            sessionId: selectedSessionId,
            title: curFile.name,
            eventFolderId: folders.eventFolderId
          });
        } else {
          await api.post('music.create', {
            styleId: style.id,
            eventId,
            sessionId: selectedSessionId,
            title: curFile.name,
            sourceType: 'mp3',
            driveFileId: uploaded.id
          });
        }
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

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Panel
          title={type === 'video' ? 'UPLOAD CLASS RECAP VIDEO(S)' : 'UPLOAD CLASS MP3 MUSIC'}
          className="px-corners bg-[var(--night-2)] space-y-4"
        >
          {error && (
            <div
              role="alert"
              className="bg-[var(--violet-2)] border-2 border-[var(--neon-red)] p-3 text-[var(--neon-red)] font-bold text-xs"
            >
              {error}
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="p-4 bg-[var(--violet-2)] border-2 border-[var(--neon-gold)] space-y-3">
              <h4 className="font-display text-xs text-[var(--text-1)] font-bold">
                NO CLASSES IN {eventName.toUpperCase()} FOR {style.name.toUpperCase()}
              </h4>
              <p className="font-body text-sm text-[var(--text-2)]">
                Media files are organized inside each class&apos;s folder. Add {style.name} classes to this event first.
              </p>
              <div className="pt-2">
                <PixelButton
                  size="md"
                  variant="primary"
                  onClick={() => navigate(`/admin/events/${eventId}/edit`)}
                >
                  ADD CLASSES IN EVENTS › EDIT
                </PixelButton>
              </div>
            </div>
          ) : (
            <>
              {/* Session Selector */}
              <Field label="Target Class Session" required>
                <select
                  value={selectedSessionId}
                  disabled={isUploading}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full min-h-[44px] px-2 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-1)] text-[var(--text-1)]"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.seq} {s.date} ({s.start} - {s.end}) {s.venue ? `@ ${s.venue}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          {/* File Picker with multiple files support */}
          <Field
            label={type === 'video' ? 'Select Video File(s) (One or More)' : 'Select MP3 File(s)'}
            required
          >
            <input
              type="file"
              multiple
              accept={type === 'video' ? 'video/mp4,video/*,.mov,.mp4' : 'audio/mp3,audio/*,.mp3'}
              disabled={isUploading}
              onChange={handleFileChange}
              className="w-full min-h-[44px] p-2 border-2 border-[var(--outline)] font-mono text-base bg-[var(--night-1)] text-[var(--text-1)]"
            />
          </Field>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="space-y-1.5 p-2 bg-[var(--night-1)] border-2 border-[var(--outline)] max-h-44 overflow-y-auto">
              <div className="flex justify-between items-center text-xs font-display">
                <span>
                  {files.length} {files.length === 1 ? 'FILE' : 'FILES'} SELECTED:
                </span>
                <span className="font-mono text-[12px] text-[var(--text-2)]">
                  {(totalBytes / (1024 * 1024)).toFixed(1)} MB total
                </span>
              </div>
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-1.5 bg-[var(--night-2)] border border-[var(--outline)] font-mono text-xs"
                >
                  <span className="truncate max-w-[220px] font-bold text-[var(--text-1)]">
                    #{idx + 1} {f.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--text-2)]">
                      {(f.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="text-[var(--neon-red)] font-bold px-1 hover:bg-[var(--violet-1)] cursor-pointer"
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Video Format Warning Alert */}
          {formatWarning && !warningIgnored && (
            <div className="p-3 bg-[var(--violet-2)] border-2 border-[var(--neon-orange)] text-[var(--text-1)] space-y-2 text-xs">
              <p className="font-bold text-[var(--neon-gold)]">VIDEO FORMAT WARNING</p>
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
                    setFiles([]);
                    setFormatWarning(null);
                  }}
                >
                  CHOOSE OTHER FILES
                </PixelButton>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="p-4 bg-[var(--night-1)] border-2 border-[var(--outline)] space-y-2">
              <div className="flex justify-between font-display text-xs text-[var(--text-1)]">
                <span className="truncate max-w-[300px]">{uploadStatus}</span>
                <span className="font-bold text-[var(--neon-cyan)]">{progressPercent}%</span>
              </div>
              <div className="w-full h-4 bg-[var(--night-2)] border-2 border-[var(--outline)] overflow-hidden">
                <div
                  className="h-full bg-[var(--neon-green)] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {files.length > 1 && (
                <div className="flex justify-between font-mono text-xs text-[var(--text-2)]">
                  <span>
                    File {currentFileIndex + 1} of {files.length}
                  </span>
                  <span>
                    {Math.round(((currentFileIndex + progressPercent / 100) / files.length) * 100)}% overall
                  </span>
                </div>
              )}
              <div className="p-2 bg-[var(--neon-gold)] border border-[var(--outline)] text-center font-display text-[8px] text-[var(--on-neon)] font-bold animate-pulse">
                UPLOADING TO GOOGLE DRIVE · SCREEN WAKE LOCK ACTIVE
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t-2 border-[var(--outline)]">
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
              disabled={isUploading || checkingFormat || files.length === 0 || (Boolean(formatWarning) && !warningIgnored)}
              onClick={handleStartUpload}
            >
              {isUploading
                ? `UPLOADING (${currentFileIndex + 1}/${files.length})...`
                : files.length > 1
                ? `START UPLOAD (${files.length} ${type === 'video' ? 'VIDEOS' : 'TRACKS'})`
                : 'START UPLOAD'}
            </PixelButton>
          </div>
        </Panel>
      </div>
    </div>
  );
};
