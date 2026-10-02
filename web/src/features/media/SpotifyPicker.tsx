import React, { useState } from 'react';
import { parseMusicLink, type ResolvedLink } from '@umdsc/shared';
import { PixelButton } from '../../components/ui/PixelButton';

export type SpotifyResolved = Extract<ResolvedLink, { kind: 'spotify' }>;

/** What the admin picked as this Spotify song's practice version. */
export type SpotifyChoice =
  | { type: 'candidate'; youtubeId: string }
  | { type: 'practiceUrl'; url: string }
  | { type: 'listenOnly' };

interface SpotifyPickerProps {
  resolved: SpotifyResolved;
  choice: SpotifyChoice | null;
  onChoose: (choice: SpotifyChoice) => void;
}

const QUOTA_MESSAGE = 'Search limit reached for today. Paste the YouTube link yourself or try after 4 pm.';

function minutesAndSeconds(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = String(Math.round(totalSec % 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export const SpotifyPicker: React.FC<SpotifyPickerProps> = ({ resolved, choice, onChoose }) => {
  const [listeningId, setListeningId] = useState<string | null>(null);
  const [ownLink, setOwnLink] = useState('');
  const [ownLinkError, setOwnLinkError] = useState<string | null>(null);

  const useOwnLink = () => {
    const parsed = parseMusicLink(ownLink);
    if (parsed.kind === 'rejected') {
      setOwnLinkError(parsed.reason);
    } else if (parsed.kind === 'spotify') {
      setOwnLinkError('A Spotify link cannot be the practice version. Use a YouTube, SoundCloud or MP3 link.');
    } else {
      setOwnLinkError(null);
      onChoose({ type: 'practiceUrl', url: ownLink.trim() });
    }
  };

  return (
    <div className="space-y-3 border-2 border-[var(--c-ink)] bg-[var(--c-bg)] p-3">
      <div>
        <p className="font-display text-[10px] text-[var(--c-darkgrey)]">SPOTIFY SONG</p>
        <p className="font-body text-sm font-bold text-[var(--c-ink)]">
          {`${resolved.title} · ${resolved.artist} · ${minutesAndSeconds(resolved.durationSec)}`}
        </p>
        <p className="font-body text-xs text-[var(--c-darkgrey)]">
          Spotify cannot be practised with here. Pick the YouTube version that matches your choreography.
        </p>
      </div>

      {resolved.notice === 'SEARCH_QUOTA' && (
        <p role="alert" className="border-2 border-[var(--c-orange)] bg-[var(--c-peach)] p-2 text-xs font-bold text-[var(--c-ink)]">
          {QUOTA_MESSAGE}
        </p>
      )}

      {resolved.candidates.length === 0 && resolved.notice !== 'SEARCH_QUOTA' && (
        <p className="font-body text-xs text-[var(--c-darkgrey)]">No matching YouTube versions found. Paste your own below.</p>
      )}

      <ul className="space-y-2">
        {resolved.candidates.map(c => {
          const selected = choice?.type === 'candidate' && choice.youtubeId === c.youtubeId;
          return (
            <li
              key={c.youtubeId}
              className={`flex flex-col gap-2 border-2 p-2 sm:flex-row ${selected ? 'border-[var(--c-green)] bg-[var(--c-panel)]' : 'border-[var(--c-ink)]'}`}
            >
              <div className="aspect-video w-full shrink-0 overflow-hidden bg-black sm:aspect-auto sm:h-[68px] sm:w-[120px]">
                {listeningId === c.youtubeId ? (
                  <iframe
                    title={`Listen: ${c.title}`}
                    src={`https://www.youtube-nocookie.com/embed/${c.youtubeId}?autoplay=1`}
                    allow="autoplay; encrypted-media"
                    className="h-full w-full border-0"
                  />
                ) : (
                  <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-body text-xs font-bold text-[var(--c-ink)]">{c.title}</p>
                <p className="truncate font-body text-[11px] text-[var(--c-darkgrey)]">
                  {c.channel} · {minutesAndSeconds(c.durationSec)}
                </p>
                <p className={`font-mono text-[11px] ${c.lengthMatch ? 'text-[var(--c-darkgreen)]' : 'text-[var(--c-red)]'}`}>
                  {c.lengthMatch ? '✓ same length' : '✗ different length — check the version'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <PixelButton size="sm" variant="secondary" onClick={() => setListeningId(c.youtubeId)}>
                    ▶ LISTEN
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    variant="primary"
                    onClick={() => onChoose({ type: 'candidate', youtubeId: c.youtubeId })}
                  >
                    {selected ? 'SELECTED' : 'USE THIS'}
                  </PixelButton>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 border-t-2 border-[var(--c-ink)] pt-2">
        <p className="font-display text-[10px] text-[var(--c-darkgrey)]">PASTE MY OWN PRACTICE LINK</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={ownLink}
            onChange={e => setOwnLink(e.target.value)}
            placeholder="Paste a YouTube, SoundCloud or MP3 link"
            className="min-h-[40px] w-full border-2 border-[var(--c-ink)] bg-[var(--c-panel)] px-2 font-mono text-xs"
          />
          <PixelButton size="sm" variant="secondary" onClick={useOwnLink} disabled={!ownLink.trim()}>
            USE LINK
          </PixelButton>
        </div>
        {ownLinkError && (
          <p role="alert" className="text-xs font-bold text-[var(--c-red)]">
            {ownLinkError}
          </p>
        )}
        {choice?.type === 'practiceUrl' && (
          <p className="font-body text-xs text-[var(--c-darkgreen)]">Using your link: {choice.url}</p>
        )}
      </div>

      <div className="border-t-2 border-[var(--c-ink)] pt-2">
        <PixelButton
          size="sm"
          variant={choice?.type === 'listenOnly' ? 'primary' : 'secondary'}
          onClick={() => onChoose({ type: 'listenOnly' })}
        >
          SAVE AS LISTEN-ONLY
        </PixelButton>
        <p className="mt-1 font-body text-[11px] text-[var(--c-darkgrey)]">
          Dancers can open it in Spotify but cannot practise with it in the Studio.
        </p>
      </div>
    </div>
  );
};
