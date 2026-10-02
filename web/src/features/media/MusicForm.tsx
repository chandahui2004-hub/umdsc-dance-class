import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import type { ClassSession, DanceStyle } from '@umdsc/shared';

interface MusicFormProps {
  style: DanceStyle;
  eventId: string;
  sessions: ClassSession[];
  initialSessionId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const MusicForm: React.FC<MusicFormProps> = ({
  style,
  eventId,
  sessions,
  initialSessionId,
  onClose,
  onSuccess
}) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [sessionId, setSessionId] = useState<string>(
    initialSessionId || (sessions[0]?.id || '')
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      return await api.post('music.create', {
        styleId: style.id,
        eventId,
        sessionId,
        title: title.trim(),
        sourceType: 'youtube',
        youtubeUrl: youtubeUrl.trim()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music'] });
      onSuccess();
    },
    onError: (err) => {
      setError(errorMessage(err));
    }
  });

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Panel title="ADD YOUTUBE MUSIC TRACK" className="px-corners bg-[var(--c-panel)] space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-2 border-[var(--c-red)] p-3 text-[var(--c-red)] font-bold text-xs"
            >
              {error}
            </div>
          )}

          <Field label="Track Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Uptown Funk - Bruno Mars"
              className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
              required
            />
          </Field>

          <Field
            label="YouTube URL"
            hint="Paste full YouTube watch link (https://www.youtube.com/watch?v=...) or short link"
            required
          >
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
              required
            />
          </Field>

          <p className="font-body text-xs text-[var(--c-darkgrey)]">
            Tip: upload an MP3 for the most reliable practice playback (works offline, on every phone).
          </p>

          <Field label="Link to Session">
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
            >
              <option value="">-- General Month Practice Track --</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.seq} {s.date} ({s.start} - {s.end})
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
            <PixelButton
              size="md"
              variant="secondary"
              disabled={createMutation.isPending}
              onClick={onClose}
            >
              CANCEL
            </PixelButton>
            <PixelButton
              size="md"
              variant="primary"
              className="flex-1"
              disabled={createMutation.isPending || !title.trim() || !youtubeUrl.trim()}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'ADDING...' : 'ADD MUSIC'}
            </PixelButton>
          </div>
        </Panel>
      </div>
    </div>
  );
};
