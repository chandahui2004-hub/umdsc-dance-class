import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AudioPlayer } from './dancecue/components/AudioPlayer';
import { YouTubePlayer } from './dancecue/components/YouTubePlayer';
import { VoiceCommandPanel } from './dancecue/components/VoiceCommandPanel';
import { SourcePicker } from './sources/SourcePicker';
import { ClassSectionsList } from './markers/ClassSectionsList';
import { useAudioPlayer } from './dancecue/hooks/useAudioPlayer';
import { useSpeechCommands } from './dancecue/hooks/useSpeechCommands';
import { useMarkers, sourceKey } from './markers/useMarkers';
import { useBootstrap } from '../auth/useBootstrap';
import { session } from '../../lib/session';
import { streamUrl } from '../../lib/google/driveUrls';
import { api } from '../../lib/api';
import type { MusicItem, Section } from '@umdsc/shared';
import './dancecue/dancecue.css';

export const Studio: React.FC = () => {
  const [searchParams] = useSearchParams();
  const musicParam = searchParams.get('music');

  const currentSession = session.get();
  const claims = currentSession?.claims;
  const isAdmin = claims?.role === 'admin';
  const canPublishSections = isAdmin && (claims?.perms?.['sections.edit'] === '*' || !!claims?.perms?.['sections.edit']);

  // Load bootstrap data (music, styles, events, sections)
  const dancerBoot = useBootstrap('dancer');
  const adminBoot = useBootstrap('admin');

  const bootstrapData = isAdmin ? adminBoot.data : dancerBoot.data;
  const musicList = (bootstrapData as any)?.music || [];
  const stylesList = bootstrapData?.styles || [];
  const eventsList = (bootstrapData as any)?.events || [];
  const sectionsList: Section[] = (bootstrapData as any)?.sections || [];

  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(musicParam);
  const [activeMusicTitle, setActiveMusicTitle] = useState<string | null>(null);
  const [currentSourceKey, setCurrentSourceKey] = useState<string>('default');

  const [markerDraftRange, setMarkerDraftRange] = useState<{ start: number; end: number } | null>(
    null
  );
  const [isMarkerDraftActive, setIsMarkerDraftActive] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Relevant class sections for the active music
  const relevantSections = useMemo(() => {
    if (!selectedMusicId) return [];
    return sectionsList.filter(s => s.musicId === selectedMusicId);
  }, [sectionsList, selectedMusicId]);

  // Unified markers (class sections + personal loops stored by sourceKey)
  const markerEngine = useMarkers(currentSourceKey, relevantSections);

  // Audio player engine
  const player = useAudioPlayer({
    audioRef,
    markers: markerEngine.markers
  });

  // Handle music selection
  const handleSelectClassMusic = useCallback(
    (item: MusicItem) => {
      setSelectedMusicId(item.id);
      setActiveMusicTitle(item.title);

      if (item.sourceType === 'mp3') {
        const key = sourceKey({ type: 'drive', fileId: item.driveFileId });
        setCurrentSourceKey(key);
        setYoutubeVideoId(null);
        player.loadUrl(streamUrl(item.driveFileId), item.title);
      } else {
        const key = sourceKey({ type: 'yt', videoId: item.youtubeId });
        setCurrentSourceKey(key);
        setYoutubeVideoId(item.youtubeId);
        player.loadYouTube(item.youtubeId);
      }
    },
    [player]
  );

  // Preload music if ?music=<id> is present in URL
  useEffect(() => {
    if (musicParam && musicList.length > 0) {
      const match = musicList.find((m: MusicItem) => m.id === musicParam);
      if (match) {
        handleSelectClassMusic(match);
      }
    }
  }, [musicParam, musicList, handleSelectClassMusic]);

  // Voice commands
  const speech = useSpeechCommands({
    markers: markerEngine.markers,
    onForward: seconds => player.skipBy(seconds),
    onJumpToMarker: player.jumpToMarker,
    onLoopMarker: player.startLoop,
    onPause: player.pause,
    onPlay: () => {
      void player.play();
    },
    onRestart: player.restart,
    onRewind: seconds => player.skipBy(-seconds),
    onStopLoop: player.stopLoop
  });

  // Admin publish section handler
  const handlePublishClassSection = async (name: string, startSec: number, endSec: number) => {
    if (!selectedMusicId) throw new Error('No class music selected to attach section');
    await api.post('sections.create', {
      musicId: selectedMusicId,
      name,
      startSec,
      endSec
    });
    // Trigger refetch of bootstrap
    if (isAdmin) {
      await adminBoot.refetch();
    } else {
      await dancerBoot.refetch();
    }
  };

  return (
    <div className="dancecue-root w-full">
      <main className="min-h-screen bg-[#101114] px-4 py-5 font-sans text-zinc-100 sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#17181c] shadow-2xl shadow-black/40">
          {/* Header */}
          <section className="border-b border-white/10 bg-gradient-to-br from-fuchsia-500/18 via-[#1b1d24] to-cyan-400/14 px-5 pb-5 pt-6">
            <div>
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-cyan-200">
                DanceCue Studio
              </p>
              <h1 className="mt-2 whitespace-nowrap text-2xl font-black leading-tight tracking-normal text-white">
                Rehearse in motion
              </h1>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-300 font-mono">
              Practice club routines with synced sections, looping, and hands-free voice cues.
            </p>
          </section>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Source Picker */}
            <SourcePicker
              activeSource={player.activeSource}
              activeMusicTitle={activeMusicTitle}
              classMusic={musicList}
              styles={stylesList}
              events={eventsList}
              selectedMusicId={selectedMusicId}
              onSelectClassMusic={handleSelectClassMusic}
              onFileSelected={file => {
                setSelectedMusicId(null);
                setActiveMusicTitle(file.name);
                const key = sourceKey({ type: 'file', name: file.name, size: file.size });
                setCurrentSourceKey(key);
                setYoutubeVideoId(null);
                player.loadFile(file);
              }}
              onYouTubeSelected={videoId => {
                setSelectedMusicId(null);
                setActiveMusicTitle('YouTube Track');
                const key = sourceKey({ type: 'yt', videoId });
                setCurrentSourceKey(key);
                setYoutubeVideoId(videoId);
                player.loadYouTube(videoId);
              }}
            />

            {/* YouTube Player */}
            <YouTubePlayer
              isVisible={player.activeSource === 'youtube'}
              videoId={youtubeVideoId}
              onReady={player.attachYouTubePlayer}
              onStateChange={player.handleYouTubeStateChange}
            />

            {/* Audio Player Controls */}
            <AudioPlayer
              audioRef={audioRef}
              currentTime={player.currentTime}
              duration={player.duration}
              isMarkerDraftActive={isMarkerDraftActive}
              isLooping={player.isLooping}
              isPlaying={player.isPlaying}
              onLoopToggle={player.toggleLoop}
              markerDraftRange={markerDraftRange}
              onPause={player.pause}
              onPlay={() => {
                void player.play();
              }}
              onMarkerDraftChange={range => setMarkerDraftRange(range)}
              onSeek={player.seekTo}
              onSkip={player.skipBy}
              onSpeedChange={player.setSpeed}
              playbackRate={player.playbackRate}
            />

            {/* Sections & Loops List */}
            <ClassSectionsList
              activeMarker={player.activeMarker}
              currentTime={player.currentTime}
              duration={player.duration}
              isPlaying={player.isPlaying}
              markerDraftRange={markerDraftRange}
              markerPlaybackMarker={player.markerPlaybackMarker}
              loopMarker={player.loopMarker}
              markers={markerEngine.markers}
              classMarkers={markerEngine.classMarkers}
              myLoops={markerEngine.myLoops}
              canPublishSections={canPublishSections && !!selectedMusicId}
              onActivateMarkerDraft={range => {
                if (range) setMarkerDraftRange(range);
                setIsMarkerDraftActive(true);
              }}
              onAddMarker={(name, start, end) => {
                markerEngine.addMyLoop(name, start, end);
                setMarkerDraftRange(null);
                setIsMarkerDraftActive(false);
              }}
              onCancelMarkerDraft={() => {
                setMarkerDraftRange(null);
                setIsMarkerDraftActive(false);
              }}
              onJumpToMarker={player.jumpToMarker}
              onRemoveMarker={markerEngine.deleteMyLoop}
              onStartLoop={player.startLoop}
              onStopLoop={player.stopLoop}
              onUpdateMarker={markerEngine.updateMyLoop}
              onPublishClassSection={handlePublishClassSection}
            />

            {/* Voice Command Panel */}
            <VoiceCommandPanel
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              lastTranscript={speech.lastTranscript}
              status={speech.status}
              onSimulateCommand={command => {
                speech.runCommand(command);
              }}
              onToggleListening={speech.toggleListening}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Studio;
