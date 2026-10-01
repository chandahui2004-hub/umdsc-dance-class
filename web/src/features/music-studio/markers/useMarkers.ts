import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Section } from '@umdsc/shared';
import type { Marker } from '../dancecue/types/marker';

export type SourceDescriptor =
  | { type: 'drive'; fileId: string }
  | { type: 'yt'; videoId: string }
  | { type: 'file'; name: string; size: number }
  | string;

export function sourceKey(src: SourceDescriptor): string {
  if (typeof src === 'string') {
    return src;
  }
  if (src.type === 'drive') {
    return `drive:${src.fileId}`;
  }
  if (src.type === 'yt') {
    return `yt:${src.videoId}`;
  }
  return `file:${src.name}:${src.size}`;
}

const STORAGE_PREFIX = 'studio:loops:';

function readLoopsFromStorage(key: string): Marker[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m: any) =>
          m &&
          typeof m.id === 'string' &&
          typeof m.name === 'string' &&
          typeof m.time === 'number' &&
          typeof m.endTime === 'number'
      )
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        time: m.time,
        endTime: m.endTime,
        isReadOnly: m.isReadOnly,
        videoId: typeof m.videoId === 'string' ? m.videoId : undefined,
        videoStart: typeof m.videoStart === 'number' ? m.videoStart : undefined,
      }));
  } catch {
    return [];
  }
}

function saveLoopsToStorage(key: string, loops: Marker[]) {
  if (!key) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(loops));
  } catch (err) {
    console.error('Failed to persist studio loops', err);
  }
}

export function useMarkers(sourceKeyStr: string, classSections: Section[] = []) {
  const [myLoops, setMyLoops] = useState<Marker[]>(() =>
    readLoopsFromStorage(sourceKeyStr)
  );

  // Sync state whenever sourceKeyStr changes
  useEffect(() => {
    setMyLoops(readLoopsFromStorage(sourceKeyStr));
  }, [sourceKeyStr]);

  const classMarkers: Marker[] = useMemo(() => {
    return (classSections || [])
      .map(s => ({
        id: `class-${s.id}`,
        name: s.name,
        time: s.startSec,
        endTime: s.endSec,
        isReadOnly: true,
        videoId: s.videoId || undefined,
        videoStart: s.videoStartSec !== null && s.videoStartSec !== undefined ? s.videoStartSec : undefined,
      }))
      .sort((a, b) => a.time - b.time);
  }, [classSections]);

  const addMyLoop = useCallback(
    (name: string, startTime: number, endTime: number, videoId?: string, videoStart?: number): Marker => {
      const newLoop: Marker = {
        id: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        time: startTime,
        endTime,
        videoId,
        videoStart,
      };
      setMyLoops(prev => {
        const next = [...prev, newLoop].sort((a, b) => a.time - b.time);
        saveLoopsToStorage(sourceKeyStr, next);
        return next;
      });
      return newLoop;
    },
    [sourceKeyStr]
  );

  const updateMyLoop = useCallback(
    (updatedMarker: Marker) => {
      if (
        updatedMarker.id.startsWith('class-') ||
        classMarkers.some(m => m.id === updatedMarker.id)
      ) {
        throw new Error('Class sections are read-only and cannot be updated.');
      }

      setMyLoops(prev => {
        const next = prev
          .map(m => (m.id === updatedMarker.id ? updatedMarker : m))
          .sort((a, b) => a.time - b.time);
        saveLoopsToStorage(sourceKeyStr, next);
        return next;
      });
    },
    [classMarkers, sourceKeyStr]
  );

  const saveLoopWithVideo = useCallback(
    (markerId: string, videoId: string, videoStart: number) => {
      setMyLoops(prev => {
        const existing = prev.find(m => m.id === markerId);
        let next: Marker[];
        if (existing) {
          next = prev.map(m => (m.id === markerId ? { ...m, videoId, videoStart } : m));
        } else {
          // If markerId is a class section, create a personal loop copy with the video alignment
          const classMarker = classMarkers.find(m => m.id === markerId);
          if (classMarker) {
            const newLoop: Marker = {
              id: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: `${classMarker.name} (with video)`,
              time: classMarker.time,
              endTime: classMarker.endTime,
              videoId,
              videoStart,
            };
            next = [...prev, newLoop].sort((a, b) => a.time - b.time);
          } else {
            return prev;
          }
        }
        saveLoopsToStorage(sourceKeyStr, next);
        return next;
      });
    },
    [classMarkers, sourceKeyStr]
  );

  const deleteMyLoop = useCallback(
    (markerId: string) => {
      if (
        markerId.startsWith('class-') ||
        classMarkers.some(m => m.id === markerId)
      ) {
        throw new Error('Class sections are read-only and cannot be deleted.');
      }

      setMyLoops(prev => {
        const next = prev.filter(m => m.id !== markerId);
        saveLoopsToStorage(sourceKeyStr, next);
        return next;
      });
    },
    [classMarkers, sourceKeyStr]
  );

  const markers: Marker[] = useMemo(() => {
    return [...classMarkers, ...myLoops].sort((a, b) => a.time - b.time);
  }, [classMarkers, myLoops]);

  return {
    classMarkers,
    myLoops,
    markers,
    addMyLoop,
    updateMyLoop,
    saveLoopWithVideo,
    deleteMyLoop
  };
}
