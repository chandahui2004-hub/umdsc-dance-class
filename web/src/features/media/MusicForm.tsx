import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseMusicLink, type ClassSession, type DanceStyle, type ResolvedLink } from '@umdsc/shared';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { SpotifyPicker, type SpotifyChoice } from './SpotifyPicker';

interface MusicFormProps {
  style: DanceStyle;
  eventId: string;
  sessions: ClassSession[];
  initialSessionId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const RESOLVE_DEBOUNCE_MS = 500;
const NOT_EMBEDDABLE_WARNING =
  "This video blocks playback outside YouTube, so dancers can't practise with it. Try the 'Official Audio' version.";

type LinkStatus = 'idle' | 'checking' | 'ready' | 'error';

/** The server prefixes its messages with an error code ("LINK_INVALID: ..."); admins only need the sentence. */
function readableError(err: unknown): string {
  return errorMessage(err).replace(/^[A-Z_]{3,}: /, '');
}

function suggestedTitle(resolved: ResolvedLink): string {
  return resolved.kind === 'spotify' ? `${resolved.title} - ${resolved.artist}` : resolved.title;
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
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [sessionId, setSessionId] = useState<string>(initialSessionId || (sessions[0]?.id || ''));
  const [status, setStatus] = useState<LinkStatus>('idle');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);
  const [choice, setChoice] = useState<SpotifyChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const titleEdited = useRef(false); // a title the admin typed is never overwritten by the link's title
  const latestLookup = useRef(0);

  useEffect(() => {
    // Any change to the link (even clearing it) makes a lookup that is still running out of date.
    const lookup = ++latestLookup.current;
    setResolved(null);
    setChoice(null);
    setLinkError(null);

    const text = link.trim();
    if (!text) {
      setStatus('idle');
      return;
    }

    const parsed = parseMusicLink(text);
    if (parsed.kind === 'rejected') {
      setStatus('error');
      setLinkError(parsed.reason);
      return;
    }

    setStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post<ResolvedLink>('music.resolveLink', { url: text });
        if (lookup !== latestLookup.current) return;
        setResolved(res.data);
        setStatus('ready');
        const suggestion = suggestedTitle(res.data);
        if (suggestion && !titleEdited.current) setTitle(suggestion);
      } catch (err) {
        if (lookup !== latestLookup.current) return;
        setStatus('error');
        setLinkError(readableError(err));
      }
    }, RESOLVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [link]);

  const needsChoice = resolved?.kind === 'spotify' && choice === null;
  const canSave = status === 'ready' && !!title.trim() && !needsChoice;

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const payload: Record<string, unknown> = {
        styleId: style.id,
        eventId,
        sessionId,
        title: title.trim(),
        url: link.trim()
      };
      if (resolved?.kind === 'spotify' && choice) {
        if (choice.type === 'candidate') payload.chosenYoutubeId = choice.youtubeId;
        if (choice.type === 'practiceUrl') payload.practiceUrl = choice.url;
        if (choice.type === 'listenOnly') payload.listenOnly = true;
      }
      return await api.post('music.create', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music'] });
      onSuccess();
    },
    onError: err => {
      setError(readableError(err));
    }
  });

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
        <Panel title="ADD MUSIC TRACK" className="px-corners bg-[var(--c-panel)] space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-2 border-[var(--c-red)] p-3 text-[var(--c-red)] font-bold text-xs"
            >
              {error}
            </div>
          )}

          <Field
            label="Music link"
            hint="YouTube, Spotify, SoundCloud, or a Google Drive MP3. Spotify songs are matched to a YouTube version for practice."
            required
          >
            <input
              type="text"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="Paste a YouTube, Spotify, SoundCloud or Drive MP3 link"
              className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
            />
          </Field>

          {status === 'checking' && (
            <p className="font-body text-xs text-[var(--c-darkgrey)] animate-pulse">Checking link…</p>
          )}
          {status === 'error' && linkError && (
            <p role="alert" className="font-body text-xs font-bold text-[var(--c-red)]">
              {linkError}
            </p>
          )}
          {resolved?.kind === 'youtube' && !resolved.embeddable && (
            <p role="alert" className="border-2 border-[var(--c-orange)] bg-[var(--c-peach)] p-2 text-xs font-bold text-[var(--c-ink)]">
              {NOT_EMBEDDABLE_WARNING}
            </p>
          )}
          {resolved?.kind === 'spotify' && (
            <SpotifyPicker resolved={resolved} choice={choice} onChoose={setChoice} />
          )}

          <Field label="Track Title" required>
            <input
              type="text"
              value={title}
              onChange={e => {
                titleEdited.current = true;
                setTitle(e.target.value);
              }}
              placeholder="e.g. Uptown Funk - Bruno Mars"
              className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
              required
            />
          </Field>

          <p className="font-body text-xs text-[var(--c-darkgrey)]">
            Tip: upload an MP3 for the most reliable practice playback (works offline, on every phone).
          </p>

          <Field label="Link to Session">
            <select
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
              className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
            >
              <option value="">-- General Month Practice Track --</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  #{s.seq} {s.date} ({s.start} - {s.end})
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
            <PixelButton size="md" variant="secondary" disabled={createMutation.isPending} onClick={onClose}>
              CANCEL
            </PixelButton>
            <PixelButton
              size="md"
              variant="primary"
              className="flex-1"
              disabled={createMutation.isPending || !canSave}
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
