import React, { useState } from 'react';
import { parseMusicLink, type MusicItem, type DanceStyle, type EventSummary } from '@umdsc/shared';
import { ClassMusicList } from './ClassMusicList';

interface SourcePickerProps {
  activeSource: 'file' | 'drive' | 'youtube' | 'soundcloud' | null;
  activeMusicTitle?: string | null;
  classMusic: MusicItem[];
  styles: DanceStyle[];
  events: EventSummary[];
  selectedMusicId: string | null;
  onSelectClassMusic: (music: MusicItem) => void;
  onFileSelected: (file: File) => void;
  onYouTubeSelected: (videoId: string) => void;
  onSoundCloudSelected: (url: string) => void;
}

const panelClass =
  'border-2 border-[var(--outline)] bg-[var(--night-2)] p-4 shadow-[4px_4px_0_var(--outline)]';
const inputClass =
  'min-h-12 min-w-0 border-2 border-[var(--outline)] bg-[var(--night-1)] px-4 text-[16px] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--neon-cyan)]';
const buttonClass =
  'min-h-12 shrink-0 border-2 border-[var(--outline)] bg-[var(--violet-2)] px-4 text-[14px] font-display text-[var(--text-1)] hover:bg-[var(--neon-cyan)] hover:text-[var(--on-neon)] active:translate-y-px';
const fileButtonClass =
  'inline-flex min-h-12 cursor-pointer items-center justify-center border-2 border-[var(--outline)] bg-[var(--violet-2)] px-4 text-[14px] font-display text-[var(--text-1)] hover:bg-[var(--neon-pink)] hover:text-[var(--on-neon)] active:translate-y-px';
const tabClass =
  'min-h-10 border-2 border-[var(--outline)] px-3 text-[12px] font-display uppercase active:translate-y-px';

export const SourcePicker: React.FC<SourcePickerProps> = ({
  activeSource,
  activeMusicTitle,
  classMusic,
  styles,
  events,
  selectedMusicId,
  onSelectClassMusic,
  onFileSelected,
  onYouTubeSelected,
  onSoundCloudSelected
}) => {
  const [sourceMode, setSourceMode] = useState<'class' | 'file' | 'link'>(
    selectedMusicId ? 'class' : 'class'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [linkText, setLinkText] = useState('');

  return (
    <section className={panelClass} aria-label="Track source">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--neon-cyan)]">
            Track Source
          </p>
          <h2 className="mt-1 text-[20px] font-display text-[var(--text-1)]">Choose music source</h2>
          {activeMusicTitle && (
            <p className="mt-0.5 text-[12px] text-[var(--neon-pink)] font-bold truncate">
              ♪ {activeMusicTitle}
            </p>
          )}
        </div>
        <span className="border-2 border-[var(--outline)] bg-[var(--violet-1)] px-3 py-1 font-mono text-[12px] font-bold uppercase text-[var(--text-2)]">
          {activeSource ?? 'empty'}
        </span>
      </div>

      {/* Tabs: CLASS MUSIC | MY MP3 | LINK (YouTube or SoundCloud) */}
      <div className="mt-4 grid grid-cols-3 gap-1.5 border-2 border-[var(--outline)] bg-[var(--night-1)] p-1">
        <button
          className={`${tabClass} ${
            sourceMode === 'class'
              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
              : 'border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--violet-1)] hover:text-[var(--text-1)]'
          }`}
          type="button"
          aria-pressed={sourceMode === 'class'}
          onClick={() => {
            setSourceMode('class');
            setErrorMessage('');
          }}
        >
          Class Music
        </button>
        <button
          className={`${tabClass} ${
            sourceMode === 'file'
              ? 'bg-[var(--neon-pink)] text-[var(--on-neon)] font-bold'
              : 'border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--violet-1)] hover:text-[var(--text-1)]'
          }`}
          type="button"
          aria-pressed={sourceMode === 'file'}
          onClick={() => {
            setSourceMode('file');
            setErrorMessage('');
          }}
        >
          My MP3
        </button>
        <button
          className={`${tabClass} ${
            sourceMode === 'link'
              ? 'bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold'
              : 'border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--violet-1)] hover:text-[var(--text-1)]'
          }`}
          type="button"
          aria-pressed={sourceMode === 'link'}
          onClick={() => {
            setSourceMode('link');
            setErrorMessage('');
          }}
        >
          Link
        </button>
      </div>

      {/* Class Music List Mode */}
      {sourceMode === 'class' && (
        <div className="mt-4">
          <ClassMusicList
            music={classMusic}
            styles={styles}
            events={events}
            selectedMusicId={selectedMusicId}
            onSelectMusic={onSelectClassMusic}
          />
        </div>
      )}

      {/* File Upload Mode */}
      {sourceMode === 'file' && (
        <div className="mt-4">
          <label className={fileButtonClass}>
            <input
              className="absolute size-0 opacity-0"
              accept=".mp3,audio/mpeg,audio/mp3,audio/*"
              type="file"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  const isVideo =
                    (file.type && file.type.startsWith('video/')) ||
                    /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv)$/i.test(file.name);
                  if (isVideo) {
                    setErrorMessage('Only MP3 or audio files are accepted. Video files (MP4) cannot be used as music.');
                    event.target.value = '';
                    return;
                  }
                  setErrorMessage('');
                  onFileSelected(file);
                }
              }}
            />
            Load MP3 or audio file
          </label>
          {errorMessage && (
            <p className="mt-2 px-1 text-[12px] font-bold text-[var(--neon-red)]" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Link mode: a YouTube or SoundCloud song of the dancer's own */}
      {sourceMode === 'link' && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={event => {
            event.preventDefault();
            const parsed = parseMusicLink(linkText);
            if (parsed.kind === 'youtube') {
              setErrorMessage('');
              onYouTubeSelected(parsed.id);
            } else if (parsed.kind === 'soundcloud') {
              setErrorMessage('');
              onSoundCloudSelected(parsed.url);
            } else if (parsed.kind === 'spotify') {
              setErrorMessage("Spotify songs can't be played here. Paste the YouTube version, or open it in Spotify.");
            } else if (parsed.kind === 'soundcloud-short') {
              setErrorMessage('Paste the full SoundCloud track link instead of the short link.');
            } else if (parsed.kind === 'drive') {
              setErrorMessage('Google Drive files cannot be played from a link here. Download the MP3 and use the My MP3 tab.');
            } else {
              setErrorMessage('Paste a YouTube or SoundCloud link to a single song.');
            }
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className={inputClass}
              aria-label="Music link"
              placeholder="Paste a YouTube or SoundCloud link"
              value={linkText}
              onChange={event => {
                setLinkText(event.target.value);
                setErrorMessage('');
              }}
            />
            <button className={buttonClass} type="submit">
              Use link
            </button>
          </div>
          {errorMessage && (
            <p className="px-1 text-[12px] font-bold text-[var(--neon-red)]" role="alert">
              {errorMessage}
            </p>
          )}
        </form>
      )}
    </section>
  );
};
