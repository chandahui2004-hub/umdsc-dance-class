import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AudioPlayer } from './dancecue/components/AudioPlayer';
import { YouTubePlayer } from './dancecue/components/YouTubePlayer';
import { SoundCloudPlayer } from './dancecue/components/SoundCloudPlayer';
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
import { VideoPanel } from './sync/VideoPanel';
import { FullscreenStudio } from './FullscreenStudio';
import { canPractise, type MusicItem, type Section, type VideoItem } from '@umdsc/shared';
import './dancecue/dancecue.css';

export const Studio: React.FC = () => {
  const [searchParams] = useSearchParams();
  const musicParam = searchParams.get('music');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const videosList: VideoItem[] = (bootstrapData as any)?.videos || [];

  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(musicParam);
  const [activeMusicTitle, setActiveMusicTitle] = useState<string | null>(null);
  const [currentSourceKey, setCurrentSourceKey] = useState<string>('default');

  const [markerDraftRange, setMarkerDraftRange] = useState<{ start: number; end: number } | null>(
    null
  );
  const [isMarkerDraftActive, setIsMarkerDraftActive] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [soundcloudUrl, setSoundcloudUrl] = useState<string | null>(null);

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
    markers: markerEngine.markers,
    draftRange: markerDraftRange
  });

  const preloadedMusicRef = useRef<string | null>(null);

  const { loadUrl, loadYouTube, loadSoundCloud } = player;

  // Handle music selection
  const handleSelectClassMusic = useCallback(
    (item: MusicItem) => {
      if (!canPractise(item)) return; // a listen-only Spotify song has nothing to play here

      setSelectedMusicId(item.id);
      setActiveMusicTitle(item.title);

      if (item.sourceType === 'mp3') {
        const key = sourceKey({ type: 'drive', fileId: item.driveFileId });
        setCurrentSourceKey(key);
        setYoutubeVideoId(null);
        setSoundcloudUrl(null);
        loadUrl(streamUrl(item.driveFileId), item.title);
      } else if (item.sourceType === 'soundcloud') {
        const url = item.soundcloudUrl || '';
        setCurrentSourceKey(sourceKey({ type: 'sc', url }));
        setYoutubeVideoId(null);
        setSoundcloudUrl(url);
        loadSoundCloud(url);
      } else {
        const key = sourceKey({ type: 'yt', videoId: item.youtubeId });
        setCurrentSourceKey(key);
        setYoutubeVideoId(item.youtubeId);
        setSoundcloudUrl(null);
        loadYouTube(item.youtubeId);
      }
    },
    [loadUrl, loadYouTube, loadSoundCloud]
  );

  // Preload music if ?music=<id> is present in URL
  useEffect(() => {
    if (musicParam && musicList.length > 0 && preloadedMusicRef.current !== musicParam) {
      const match = musicList.find((m: MusicItem) => m.id === musicParam);
      if (match) {
        preloadedMusicRef.current = musicParam;
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

  const activeMusic = useMemo(
    () => musicList.find((m: MusicItem) => m.id === selectedMusicId) || null,
    [musicList, selectedMusicId]
  );

  // Synced Class Video / Local Practice Video state
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [localVideoFile, setLocalVideoFile] = useState<{ name: string; url: string; file: File } | null>(null);
  const [videoStart, setVideoStart] = useState<number>(0);

  const handleSelectLocalVideo = useCallback((file: File) => {
    setLocalVideoFile(prev => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      const url = URL.createObjectURL(file);
      return { name: file.name, url, file };
    });
    setSelectedVideoId('local');
    setVideoStart(0);
  }, []);

  const handleClearLocalVideo = useCallback(() => {
    setLocalVideoFile(prev => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
    setSelectedVideoId('');
    setVideoStart(0);
  }, []);

  // Cleanup object url on unmount
  useEffect(() => {
    return () => {
      if (localVideoFile?.url) {
        URL.revokeObjectURL(localVideoFile.url);
      }
    };
  }, [localVideoFile?.url]);

  // Synchronize from loop marker when an active marker specifies a video
  useEffect(() => {
    if (player.loopMarker) {
      if (player.loopMarker.videoId) {
        setSelectedVideoId(player.loopMarker.videoId);
      }
      if (typeof player.loopMarker.videoStart === 'number') {
        setVideoStart(player.loopMarker.videoStart);
      }
    }
  }, [player.loopMarker]);

  const activeDanceVideo = useMemo(() => {
    if (selectedVideoId === 'local' || !selectedVideoId) {
      return null;
    }
    return videosList.find(v => v.id === selectedVideoId) || null;
  }, [videosList, selectedVideoId]);

  const activeDanceVideoUrl = useMemo(() => {
    if (selectedVideoId === 'local' && localVideoFile) {
      return localVideoFile.url;
    }
    if (activeDanceVideo) {
      return streamUrl(activeDanceVideo.driveFileId);
    }
    return null;
  }, [selectedVideoId, localVideoFile, activeDanceVideo]);

  return (
    <div className="dancecue-root w-full">
      {isFullscreen && (
        <FullscreenStudio
          master={player.master}
          activeMusicTitle={activeMusicTitle}
          currentTime={player.currentTime}
          duration={player.duration}
          isPlaying={player.isPlaying}
          isLooping={player.isLooping}
          loopMarker={player.loopMarker}
          markerDraftRange={markerDraftRange}
          playbackRate={player.playbackRate}
          speedDisabled={player.speedDisabled}
          activeSource={player.activeSource}
          youtubeVideoId={youtubeVideoId}
          danceVideoUrl={activeDanceVideoUrl}
          videoCurrentTime={player.currentTime}
          videoDuration={player.duration}
          videoStart={videoStart}
          markers={markerEngine.markers}
          classMarkers={markerEngine.classMarkers}
          myLoops={markerEngine.myLoops}
          onPlay={() => void player.play()}
          onPause={player.pause}
          onToggleLoop={player.toggleLoop}
          onSeek={player.seekTo}
          onSpeedChange={player.setSpeed}
          onSetInPoint={() =>
            setMarkerDraftRange(prev => {
              const cur = Math.round(player.currentTime * 10) / 10;
              const safeEnd = prev ? Math.max(cur + 0.1, Math.round(prev.end * 10) / 10) : Math.min(Math.round(player.duration * 10) / 10, cur + 5);
              return {
                start: cur,
                end: safeEnd
              };
            })
          }
          onSetOutPoint={() =>
            setMarkerDraftRange(prev => {
              const cur = Math.round(player.currentTime * 10) / 10;
              const safeStart = prev ? Math.min(Math.round(prev.start * 10) / 10, Math.max(0, cur - 0.1)) : Math.max(0, cur - 5);
              return {
                start: safeStart,
                end: cur
              };
            })
          }
          onStartLoopMarker={player.startLoop}
          onStopLoopMarker={player.stopLoop}
          onAddLoopMarker={(name, start, end) => {
            markerEngine.addMyLoop(name, start, end);
            setMarkerDraftRange(null);
          }}
          onUpdateLoopMarker={markerEngine.updateMyLoop}
          onDeleteLoopMarker={markerEngine.deleteMyLoop}
          onJumpToMarker={player.jumpToMarker}
          onMarkerDraftChange={setMarkerDraftRange}
          onExitFullscreen={() => setIsFullscreen(false)}
          speechTranscript={speech.lastTranscript}
          speechListening={speech.isListening}
        />
      )}

      <main className="min-h-screen bg-[var(--night-1)] px-3 py-4 font-body text-[var(--text-1)] sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col border-4 border-[var(--outline)] bg-[var(--night-1)] shadow-[8px_8px_0_var(--outline)]">
          {/* Header */}
          <section className="border-b-4 border-[var(--outline)] bg-[var(--night-2)] px-4 pb-4 pt-5 text-[var(--text-1)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-[var(--neon-red)] border border-[var(--outline)] inline-block animate-pulse" />
                <p className="font-display text-[12px] uppercase tracking-wider text-[var(--neon-gold)]">
                  DanceCue Studio
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="px-2.5 py-1 bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[12px] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] hover:bg-[var(--text-1)] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer"
                >
                  ⛶ FULLSCREEN
                </button>
                <div className="flex items-center gap-1.5 font-mono text-[12px] text-[var(--neon-green)]">
                  <span className="w-2 h-2 bg-[var(--neon-green)] inline-block border border-[var(--outline)]" />
                  <span>READY</span>
                </div>
              </div>
            </div>
            <h1 className="mt-2 text-[24px] font-display leading-tight tracking-normal text-[var(--text-1)] px-glow-text">
              Rehearse in motion
            </h1>
            <p className="mt-2 text-[14px] leading-5 text-[var(--text-2)] font-mono">
              Practice club routines with synced class video, loops, and hands-free voice cues.
            </p>
          </section>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Source Picker */}
            <SourcePicker
              activeSource={player.activeSource}
              activeMusicTitle={activeMusicTitle}
              classMusic={musicList.filter(canPractise)}
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
                setSoundcloudUrl(null);
                player.loadFile(file);
              }}
              onYouTubeSelected={videoId => {
                setSelectedMusicId(null);
                setActiveMusicTitle('YouTube Track');
                const key = sourceKey({ type: 'yt', videoId });
                setCurrentSourceKey(key);
                setYoutubeVideoId(videoId);
                setSoundcloudUrl(null);
                player.loadYouTube(videoId);
              }}
              onSoundCloudSelected={url => {
                setSelectedMusicId(null);
                setActiveMusicTitle('SoundCloud Track');
                setCurrentSourceKey(sourceKey({ type: 'sc', url }));
                setYoutubeVideoId(null);
                setSoundcloudUrl(url);
                player.loadSoundCloud(url);
              }}
            />

            {/* YouTube Player */}
            <YouTubePlayer
              isVisible={player.activeSource === 'youtube'}
              videoId={youtubeVideoId}
              onReady={player.attachYouTubePlayer}
              onStateChange={player.handleYouTubeStateChange}
              needsTap={player.needsTap}
            />

            {/* SoundCloud Player */}
            <SoundCloudPlayer
              url={soundcloudUrl}
              isVisible={player.activeSource === 'soundcloud'}
              needsTap={player.needsTap}
              onReady={player.attachSoundCloudPlayer}
              onPlayState={player.handleSoundCloudPlayState}
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
              speedDisabled={player.speedDisabled}
            />

            {/* Synced Class Video Panel */}
            <VideoPanel
              master={player.master}
              videos={videosList}
              events={eventsList}
              styles={stylesList}
              activeMusic={activeMusic}
              activeLoopMarker={player.loopMarker}
              selectedVideoId={selectedVideoId}
              localVideoFile={localVideoFile}
              videoStart={videoStart}
              onSelectVideoId={setSelectedVideoId}
              onSelectLocalVideo={handleSelectLocalVideo}
              onClearLocalVideo={handleClearLocalVideo}
              onSetVideoStart={setVideoStart}
              onSaveLoopWithVideo={markerEngine.saveLoopWithVideo}
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
