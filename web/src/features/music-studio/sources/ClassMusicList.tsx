import React from 'react';
import type { MusicItem, DanceStyle, EventSummary } from '@umdsc/shared';

const SOURCE_LABEL: Record<MusicItem['sourceType'], string> = {
  mp3: 'MP3',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify'
};

interface ClassMusicListProps {
  music: MusicItem[];
  styles: DanceStyle[];
  events: EventSummary[];
  selectedMusicId: string | null;
  onSelectMusic: (music: MusicItem) => void;
}

export const ClassMusicList: React.FC<ClassMusicListProps> = ({
  music,
  styles,
  events,
  selectedMusicId,
  onSelectMusic
}) => {
  const stylesMap = new Map(styles.map(s => [s.id, s]));
  const eventsMap = new Map(events.map(e => [e.id, e]));

  if (!music || music.length === 0) {
    return (
      <div className="p-4 text-center border-2 border-dashed border-white/20 rounded-2xl bg-black/20">
        <p className="font-mono text-xs text-zinc-400 uppercase tracking-wider">
          No class music uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {music.map(item => {
        const style = stylesMap.get(item.styleId);
        const event = eventsMap.get(item.eventId);
        const isSelected = selectedMusicId === item.id;

        return (
          <div
            key={item.id}
            data-testid={`class-music-item-${item.id}`}
            onClick={() => onSelectMusic(item)}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
              isSelected
                ? 'border-cyan-300/80 bg-cyan-900/30 shadow-[0_0_14px_rgba(103,232,249,0.2)]'
                : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-sans text-sm font-black text-white truncate max-w-full">
                  {item.title}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-fuchsia-400/20 text-fuchsia-200 border border-fuchsia-400/30">
                  {SOURCE_LABEL[item.sourceType] ?? item.sourceType}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
                {style && <span className="truncate">{style.name}</span>}
                {style && event && <span>•</span>}
                {event && <span className="truncate">{event.name}</span>}
              </div>
            </div>

            <button
              type="button"
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition ${
                isSelected
                  ? 'bg-cyan-300 text-zinc-950 shadow-[0_0_10px_rgba(103,232,249,0.5)]'
                  : 'bg-white/10 text-cyan-200 hover:bg-cyan-200/20'
              }`}
            >
              {isSelected ? 'ACTIVE' : 'SELECT'}
            </button>
          </div>
        );
      })}
    </div>
  );
};
