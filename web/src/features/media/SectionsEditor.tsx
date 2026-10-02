import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import type { Music, MusicSection } from '@umdsc/shared';

interface SectionsEditorProps {
  music: Music;
  onClose: () => void;
}

function formatSecToMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SectionsEditor: React.FC<SectionsEditorProps> = ({ music, onClose }) => {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [startMin, setStartMin] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endMin, setEndMin] = useState(0);
  const [endSec, setEndSec] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const {
    data: sections = [],
    isLoading,
    refetch
  } = useQuery<MusicSection[]>({
    queryKey: ['sections', music.id],
    queryFn: async () => {
      const res = await api.post<MusicSection[]>('sections.list', {
        musicId: music.id
      });
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const totalStart = startMin * 60 + startSec;
      const totalEnd = endMin * 60 + endSec;

      if (totalEnd <= totalStart) {
        throw new Error('End time must be greater than start time');
      }

      return await api.post('sections.create', {
        musicId: music.id,
        name: name.trim(),
        startSec: totalStart,
        endSec: totalEnd
      });
    },
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['sections', music.id] });
      refetch();
    },
    onError: (err) => {
      setError(errorMessage(err));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      return await api.post('sections.deactivate', { id, version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections', music.id] });
      refetch();
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col">
        <Panel
          title={`PRACTICE SECTIONS: ${music.title}`}
          className="px-corners bg-[var(--night-2)] flex-1 overflow-y-auto space-y-4"
        >
          <p className="font-body text-xs text-[var(--text-2)]">
            Define loopable choreo sections for the DanceCue Practice Studio.
          </p>

          {error && (
            <div
              role="alert"
              className="bg-[var(--violet-2)] border-2 border-[var(--neon-red)] p-3 text-[var(--neon-red)] font-bold text-xs"
            >
              {error}
            </div>
          )}

          {/* New Section Form */}
          <div className="p-3 border-2 border-[var(--outline)] bg-[var(--night-1)] space-y-3">
            <h4 className="font-display text-xs text-[var(--text-1)] uppercase">
              + Add Section
            </h4>

            <Field label="Section Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Intro / Routine 1 / Bridge"
                className="w-full min-h-[44px] px-2 border-2 border-[var(--outline)] font-body text-base bg-[var(--night-2)] text-[var(--text-1)]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-display text-[8px] text-[var(--text-1)] uppercase block mb-1">
                  Start (MM : SS)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={startMin}
                    onChange={(e) => setStartMin(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-16 min-h-[44px] px-2 border-2 border-[var(--outline)] font-mono text-center text-base bg-[var(--night-2)] text-[var(--text-1)]"
                  />
                  <span className="text-[var(--text-1)] font-bold">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={startSec}
                    onChange={(e) => setStartSec(Math.min(59, Math.max(0, parseInt(e.target.value || '0', 10))))}
                    className="w-16 min-h-[44px] px-2 border-2 border-[var(--outline)] font-mono text-center text-base bg-[var(--night-2)] text-[var(--text-1)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-display text-[8px] text-[var(--text-1)] uppercase block mb-1">
                  End (MM : SS)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={endMin}
                    onChange={(e) => setEndMin(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-16 min-h-[44px] px-2 border-2 border-[var(--outline)] font-mono text-center text-base bg-[var(--night-2)] text-[var(--text-1)]"
                  />
                  <span className="text-[var(--text-1)] font-bold">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={endSec}
                    onChange={(e) => setEndSec(Math.min(59, Math.max(0, parseInt(e.target.value || '0', 10))))}
                    className="w-16 min-h-[44px] px-2 border-2 border-[var(--outline)] font-mono text-center text-base bg-[var(--night-2)] text-[var(--text-1)]"
                  />
                </div>
              </div>
            </div>

            <PixelButton
              size="md"
              variant="primary"
              disabled={createMutation.isPending || !name.trim()}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'SAVING...' : 'SAVE SECTION'}
            </PixelButton>
          </div>

          {/* Sections List */}
          <div className="space-y-2">
            <h4 className="font-display text-xs text-[var(--text-1)] uppercase">
              Current Sections ({sections.length})
            </h4>

            {isLoading ? (
              <p className="font-display text-xs text-[var(--text-1)] animate-pulse">Loading sections...</p>
            ) : sections.length === 0 ? (
              <p className="font-body text-xs text-[var(--text-2)] italic">
                No sections defined yet. Dancers will loop the full song in Studio.
              </p>
            ) : (
              <div className="space-y-2">
                {sections.map((sec) => (
                  <div
                    key={sec.id}
                    className="p-3 border-2 border-[var(--outline)] bg-[var(--night-1)] flex justify-between items-center gap-2"
                  >
                    <div>
                      <span className="font-display text-xs text-[var(--text-1)] font-bold">
                        {sec.name}
                      </span>
                      <span className="font-mono text-xs text-[var(--neon-cyan)] ml-2">
                        {formatSecToMMSS(sec.startSec)} → {formatSecToMMSS(sec.endSec)}
                      </span>
                    </div>

                    <PixelButton
                      size="md"
                      variant="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() =>
                        deleteMutation.mutate({
                          id: sec.id,
                          version: sec.version
                        })
                      }
                    >
                      DELETE
                    </PixelButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t-2 border-[var(--outline)] flex justify-end">
            <PixelButton size="md" variant="secondary" onClick={onClose}>
              DONE
            </PixelButton>
          </div>
        </Panel>
      </div>
    </div>
  );
};
