import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarkers, sourceKey } from './useMarkers';
import type { Section } from '@umdsc/shared';

describe('useMarkers & sourceKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const CLASS_SECTIONS: Section[] = [
    {
      id: 'sec-1',
      musicId: 'm-1',
      name: 'Chorus Section',
      startSec: 30,
      endSec: 60,
      videoId: '',
      videoStartSec: null,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    },
    {
      id: 'sec-2',
      musicId: 'm-1',
      name: 'Verse Section',
      startSec: 10,
      endSec: 25,
      videoId: '',
      videoStartSec: null,
      version: 1,
      updatedBy: 'admin',
      updatedAt: '2026-10-01T00:00:00.000Z',
      active: true
    }
  ];

  it('generates consistent source keys for drive, youtube, and file', () => {
    expect(sourceKey({ type: 'drive', fileId: 'file-123' })).toBe('drive:file-123');
    expect(sourceKey({ type: 'yt', videoId: 'yt-abc' })).toBe('yt:yt-abc');
    expect(sourceKey({ type: 'file', name: 'song.mp3', size: 1024 })).toBe('file:song.mp3:1024');
    expect(sourceKey({ type: 'sc', url: 'https://soundcloud.com/forss/flickermood' })).toBe(
      'sc:https://soundcloud.com/forss/flickermood'
    );
  });

  it('loads class sections as read-only markers mapped to DanceCue Marker interface', () => {
    const { result } = renderHook(() => useMarkers('drive:file-123', CLASS_SECTIONS));

    expect(result.current.classMarkers).toHaveLength(2);
    expect(result.current.classMarkers[0]).toEqual({
      id: 'class-sec-2',
      name: 'Verse Section',
      time: 10,
      endTime: 25,
      isReadOnly: true
    });
    expect(result.current.classMarkers[1]).toEqual({
      id: 'class-sec-1',
      name: 'Chorus Section',
      time: 30,
      endTime: 60,
      isReadOnly: true
    });
  });

  it('persists my loops per sourceKey across reloads', () => {
    const key = 'drive:file-123';
    const { result, unmount } = renderHook(() => useMarkers(key, []));

    act(() => {
      result.current.addMyLoop('Practice Routine', 15, 45);
    });

    expect(result.current.myLoops).toHaveLength(1);
    expect(result.current.myLoops[0].name).toBe('Practice Routine');
    expect(result.current.myLoops[0].time).toBe(15);
    expect(result.current.myLoops[0].endTime).toBe(45);

    unmount();

    // Reload with same source key
    const { result: reloaded } = renderHook(() => useMarkers(key, []));
    expect(reloaded.current.myLoops).toHaveLength(1);
    expect(reloaded.current.myLoops[0].name).toBe('Practice Routine');
  });

  it('throws an error if attempting to update a read-only class section', () => {
    const { result } = renderHook(() => useMarkers('drive:file-123', CLASS_SECTIONS));

    const classMarker = result.current.classMarkers[0];
    expect(() => {
      result.current.updateMyLoop({
        ...classMarker,
        name: 'Hacked Name'
      });
    }).toThrow(/read-only/i);
  });

  it('switches personal loop lists when sourceKey changes', () => {
    const keyA = 'drive:file-A';
    const keyB = 'yt:video-B';

    const { result: hookA } = renderHook(() => useMarkers(keyA, []));
    act(() => {
      hookA.current.addMyLoop('Loop for Track A', 5, 20);
    });

    const { result: hookB } = renderHook(() => useMarkers(keyB, []));
    expect(hookB.current.myLoops).toHaveLength(0);

    act(() => {
      hookB.current.addMyLoop('Loop for Track B', 10, 30);
    });

    expect(hookB.current.myLoops).toHaveLength(1);
    expect(hookB.current.myLoops[0].name).toBe('Loop for Track B');

    // Re-verify Track A still has only its own loop
    const { result: hookAReload } = renderHook(() => useMarkers(keyA, []));
    expect(hookAReload.current.myLoops).toHaveLength(1);
    expect(hookAReload.current.myLoops[0].name).toBe('Loop for Track A');
  });

  it('allows updating and deleting personal loops', () => {
    const { result } = renderHook(() => useMarkers('drive:file-edit', []));

    let createdId = '';
    act(() => {
      const created = result.current.addMyLoop('Initial', 0, 10);
      createdId = created.id;
    });

    act(() => {
      result.current.updateMyLoop({
        id: createdId,
        name: 'Updated Name',
        time: 2,
        endTime: 12
      });
    });

    expect(result.current.myLoops[0].name).toBe('Updated Name');
    expect(result.current.myLoops[0].time).toBe(2);

    act(() => {
      result.current.deleteMyLoop(createdId);
    });

    expect(result.current.myLoops).toHaveLength(0);
  });
});
