import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { getAccessToken } from '../../lib/google/gis';
import { pickFolder, hasPickerGrant } from '../../lib/google/picker';
import { ensureClassFolder, ClassFolderTarget } from '../../lib/google/driveFolders';
import { uploadResumable, makePublic } from '../../lib/google/resumableUpload';
import { PixelButton } from '../../components/ui/PixelButton';
import type { ClassSession, DanceStyle } from '@umdsc/shared';

export interface UploadQueueItem {
  id: string;
  file: File;
  type: 'video' | 'mp3';
  eventId: string;
  eventName: string;
  style: DanceStyle;
  session: ClassSession;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progressPercent: number;
  statusText: string;
  error?: string;
}

interface UploadContextType {
  queue: UploadQueueItem[];
  enqueueFiles: (
    files: File[],
    params: {
      type: 'video' | 'mp3';
      eventId: string;
      eventName: string;
      style: DanceStyle;
      session: ClassSession;
    }
  ) => void;
  isUploading: boolean;
  clearCompleted: () => void;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
}

const UploadContext = createContext<UploadContextType | null>(null);

export const UploadManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  const isUploading = queue.some((item) => item.status === 'pending' || item.status === 'uploading');

  // Prevent accidental tab closure while uploading
  useEffect(() => {
    if (!isUploading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Videos are currently uploading. Leaving this site will cancel the upload!';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  // Screen wake lock
  useEffect(() => {
    if (isUploading) {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        (navigator as any).wakeLock.request('screen').then((lock: any) => {
          wakeLockRef.current = lock;
        }).catch(() => null);
      }
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => null);
        wakeLockRef.current = null;
      }
    }
  }, [isUploading]);

  const enqueueFiles = useCallback(
    (
      files: File[],
      params: {
        type: 'video' | 'mp3';
        eventId: string;
        eventName: string;
        style: DanceStyle;
        session: ClassSession;
      }
    ) => {
      const newItems: UploadQueueItem[] = files.map((file, idx) => ({
        id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        type: params.type,
        eventId: params.eventId,
        eventName: params.eventName,
        style: params.style,
        session: params.session,
        status: 'pending',
        progressPercent: 0,
        statusText: 'Waiting in queue...'
      }));

      setQueue((prev) => [...prev, ...newItems]);
    },
    []
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === 'pending' || item.status === 'uploading'));
  }, []);

  // Sequential queue processor
  const processNext = useCallback(async () => {
    if (isProcessingRef.current) return;
    const currentItem = queue.find((item) => item.status === 'pending');
    if (!currentItem) return;

    isProcessingRef.current = true;

    // Mark uploading
    setQueue((prev) =>
      prev.map((item) =>
        item.id === currentItem.id
          ? { ...item, status: 'uploading', statusText: 'Authenticating with Google...' }
          : item
      )
    );

    try {
      // 1. Get OAuth access token
      const token = await getAccessToken();

      // 2. Fetch target folder details from API
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, statusText: 'Resolving destination folder...' } : item
        )
      );
      const target = (await api.post<ClassFolderTarget>('videos.targetFolder', { sessionId: currentItem.session.id })).data;
      if (!target.videoMasterFolderId && !target.eventFolderId) {
        throw new Error('Video destination folder not configured.');
      }

      // 3. Picker grant if needed
      const grantFolder = target.eventFolderId || target.videoMasterFolderId;
      if (!hasPickerGrant(grantFolder)) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === currentItem.id ? { ...item, statusText: 'Authorizing Drive folder access...' } : item
          )
        );
        try {
          await pickFolder(token, grantFolder);
        } catch {
          // If cancelled, proceed and let Drive report any permission issue
        }
      }

      // 4. Ensure class subfolder exists
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, statusText: 'Ensuring Drive subfolders exist...' } : item
        )
      );
      const folders = await ensureClassFolder(token, target, currentItem.type);
      const parentFolderId = folders.musicFolderId || folders.classFolderId;

      // 5. Perform Resumable Upload
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, statusText: 'Uploading file to Google Drive...' } : item
        )
      );
      const uploaded = await uploadResumable({
        token,
        file: currentItem.file,
        parentId: parentFolderId,
        name: currentItem.file.name,
        onProgress: (sent, total) => {
          const pct = Math.round((sent / total) * 100);
          setQueue((prev) =>
            prev.map((item) =>
              item.id === currentItem.id
                ? { ...item, progressPercent: pct, statusText: `Uploading: ${pct}%` }
                : item
            )
          );
        }
      });

      // 6. Make public (anyone reader)
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, statusText: 'Setting permissions...' } : item
        )
      );
      await makePublic(token, uploaded.id);

      // 7. Register in backend database
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, statusText: 'Registering in club system...' } : item
        )
      );

      if (currentItem.type === 'video') {
        await api.post('videos.register', {
          driveFileId: uploaded.id,
          sessionId: currentItem.session.id,
          title: currentItem.file.name,
          eventFolderId: folders.eventFolderId
        });
      } else {
        await api.post('music.create', {
          styleId: currentItem.style.id,
          eventId: currentItem.eventId,
          sessionId: currentItem.session.id,
          title: currentItem.file.name,
          sourceType: 'mp3',
          driveFileId: uploaded.id
        });
      }

      // Success
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id
            ? { ...item, status: 'done', progressPercent: 100, statusText: 'Uploaded successfully!' }
            : item
        )
      );

      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['music'] });
    } catch (err: any) {
      const errText = errorMessage(err) || err.message || 'Upload failed';
      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id
            ? { ...item, status: 'error', statusText: errText, error: errText }
            : item
        )
      );
    } finally {
      isProcessingRef.current = false;
    }
  }, [queue, queryClient]);

  useEffect(() => {
    if (!isProcessingRef.current && queue.some((i) => i.status === 'pending')) {
      processNext();
    }
  }, [queue, processNext]);

  return (
    <UploadContext.Provider
      value={{
        queue,
        enqueueFiles,
        isUploading,
        clearCompleted,
        isMinimized,
        setIsMinimized
      }}
    >
      {children}
      {/* Floating in-app persistent background upload badge */}
      {queue.length > 0 && <UploadFloatingBadge />}
    </UploadContext.Provider>
  );
};

export const useUploadManager = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error('useUploadManager must be used within an UploadManagerProvider');
  }
  return ctx;
};

/**
 * 8-Bit Retro Floating Upload Badge: stays visible at the bottom of the screen
 * while the admin navigates between Today, Calendar, Attendance, Events, etc.
 */
const UploadFloatingBadge: React.FC = () => {
  const { queue, clearCompleted } = useUploadManager();
  const [expanded, setExpanded] = useState(false);

  const activeIndex = queue.findIndex((i) => i.status === 'uploading');
  const activeItem = activeIndex >= 0 ? queue[activeIndex] : null;
  const pendingCount = queue.filter((i) => i.status === 'pending').length;
  const doneCount = queue.filter((i) => i.status === 'done').length;
  const errorCount = queue.filter((i) => i.status === 'error').length;
  const isFinished = pendingCount === 0 && !activeItem;

  return (
    <div
      role="region"
      aria-label="Background Uploads"
      className="fixed bottom-14 md:bottom-4 right-2 md:right-6 z-50 max-w-sm w-[calc(100vw-1rem)] sm:w-96 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] select-none text-[var(--text-1)]"
    >
      {/* Header */}
      <div
        className={`px-3 py-2 flex items-center justify-between border-b-2 border-[var(--c-ink)] cursor-pointer ${
          isFinished
            ? errorCount > 0
              ? 'bg-[var(--c-peach)]'
              : 'bg-[var(--c-green)]'
            : 'bg-[var(--c-yellow)]'
        }`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2 font-display text-[10px] md:text-xs">
          {isFinished ? (
            errorCount > 0 ? (
              <span>⚠ UPLOADS FINISHED WITH ERRORS</span>
            ) : (
              <span>✓ ALL {doneCount} UPLOADS COMPLETE</span>
            )
          ) : (
            <span className="animate-pulse">⯈ UPLOADING ({doneCount + 1}/{queue.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold">{expanded ? '▼ CLOSE' : '▲ DETAILS'}</span>
        </div>
      </div>

      {/* Progress Bar (visible always if active) */}
      {activeItem && !expanded && (
        <div className="p-2 space-y-1">
          <div className="flex justify-between font-mono text-[10px] truncate">
            <span className="truncate max-w-[200px]">{activeItem.file.name}</span>
            <span className="font-bold">{activeItem.progressPercent}%</span>
          </div>
          <div className="w-full bg-[var(--c-bg)] border-2 border-[var(--c-ink)] h-3">
            <div
              className="bg-[var(--c-orange)] h-full transition-all duration-150"
              style={{ width: `${activeItem.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded details list */}
      {expanded && (
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {queue.map((item, idx) => (
            <div
              key={item.id}
              className="p-2 bg-[var(--c-bg)] border border-[var(--c-ink)] text-xs font-mono space-y-1"
            >
              <div className="flex justify-between items-center font-bold">
                <span className="truncate max-w-[180px]">
                  #{idx + 1} {item.file.name}
                </span>
                <span
                  className={`text-[9px] px-1 font-display border ${
                    item.status === 'done'
                      ? 'bg-[var(--c-green)] text-[var(--on-neon)]'
                      : item.status === 'error'
                      ? 'bg-[var(--c-red)] text-[var(--on-neon)]'
                      : item.status === 'uploading'
                      ? 'bg-[var(--c-yellow)] text-[var(--on-neon)]'
                      : 'bg-[var(--c-panel)] text-[var(--text-2)]'
                  }`}
                >
                  {item.status.toUpperCase()}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-2)]">
                {item.style.name} · Class #{item.session.seq} ({item.session.date})
              </div>
              {item.status === 'uploading' && (
                <div className="w-full bg-[var(--c-panel)] border border-[var(--c-ink)] h-2 mt-1">
                  <div
                    className="bg-[var(--c-orange)] h-full"
                    style={{ width: `${item.progressPercent}%` }}
                  />
                </div>
              )}
              {item.error && <p className="text-[10px] text-[var(--c-red)] font-bold">{item.error}</p>}
            </div>
          ))}

          {isFinished && (
            <div className="pt-1">
              <PixelButton size="sm" variant="secondary" className="w-full" onClick={clearCompleted}>
                DISMISS ALL
              </PixelButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
