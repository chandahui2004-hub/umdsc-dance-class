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
  'rounded-3xl border border-white/15 bg-white/[0.08] p-4 shadow-[0_0_32px_rgba(235,178,255,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl';
const inputClass =
  'min-h-12 min-w-0 rounded-lg border border-white/10 bg-white/[0.07] px-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none placeholder:text-zinc-500 focus:border-cyan-200/55 focus:bg-white/[0.1] focus:ring-4 focus:ring-cyan-300/10';
const buttonClass =
  'min-h-12 shrink-0 rounded-lg border border-cyan-200/25 bg-cyan-200/12 px-4 text-sm font-black text-cyan-50 transition hover:border-cyan-100/50 hover:bg-cyan-200/18 active:translate-y-px';
const fileButtonClass =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-fuchsia-200/25 bg-fuchsia-200/12 px-4 text-sm font-black text-fuchsia-50 transition hover:border-fuchsia-100/50 hover:bg-fuchsia-200/18 active:translate-y-px';
const tabClass =
  'min-h-10 rounded-lg border px-3 text-xs sm:text-sm font-black transition active:translate-y-px';

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
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-100">
            Track Source
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Choose music source</h2>
          {activeMusicTitle && (
            <p className="mt-0.5 text-xs text-fuchsia-200 font-bold truncate">
              ♪ {activeMusicTitle}
            </p>
          )}
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-xs font-bold uppercase text-zinc-300">
          {activeSource ?? 'empty'}
        </span>
      </div>

      {/* Tabs: CLASS MUSIC | MY MP3 | LINK (YouTube or SoundCloud) */}
      <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-1">
        <button
          className={`${tabClass} ${
            sourceMode === 'class'
              ? 'border-yellow-100/50 bg-yellow-200/18 text-yellow-100 font-bold'
              : 'border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
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
              ? 'border-fuchsia-100/50 bg-fuchsia-200/18 text-fuchsia-50 font-bold'
              : 'border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
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
              ? 'border-cyan-100/50 bg-cyan-200/18 text-cyan-50 font-bold'
              : 'border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
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
            <p className="mt-2 px-1 text-xs font-bold text-rose-200" role="alert">
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
            <p className="px-1 text-xs font-bold text-rose-200" role="alert">
              {errorMessage}
            </p>
          )}
        </form>
      )}
    </section>
  );
};
