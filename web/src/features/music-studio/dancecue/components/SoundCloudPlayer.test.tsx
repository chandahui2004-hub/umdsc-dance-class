import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SoundCloudPlayer } from './SoundCloudPlayer';

const TRACK = 'https://soundcloud.com/forss/flickermood';

function installFakeWidget() {
  const handlers: Record<string, (data?: unknown) => void> = {};
  const widget = {
    bind: vi.fn((event: string, cb: (data?: unknown) => void) => {
      handlers[event] = cb;
    }),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getPosition: vi.fn((cb: (ms: number) => void) => cb(0)),
    getDuration: vi.fn((cb: (ms: number) => void) => cb(0)),
    load: vi.fn()
  };
  window.SC = {
    Widget: Object.assign(vi.fn(() => widget), {
      Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error' }
    })
  } as never;
  return { widget, handlers };
}

describe('SoundCloudPlayer', () => {
  let fake: ReturnType<typeof installFakeWidget>;

  beforeEach(() => {
    fake = installFakeWidget();
  });

  const show = (props: Partial<React.ComponentProps<typeof SoundCloudPlayer>> = {}) => {
    const onReady = vi.fn();
    const onPlayState = vi.fn();
    const view = render(
      <SoundCloudPlayer url={TRACK} isVisible={true} onReady={onReady} onPlayState={onPlayState} {...props} />
    );
    return { onReady, onPlayState, view };
  };

  it('embeds SoundCloud\'s own player for the track with auto-play off', async () => {
    show();
    await vi.waitFor(() => expect(window.SC?.Widget).toHaveBeenCalled());

    const frame = screen.getByTitle('SoundCloud player') as HTMLIFrameElement;
    expect(frame.src).toBe(
      'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&auto_play=false&visual=false&show_comments=false'
    );
  });

  it('hands the widget to the app once SoundCloud reports it is ready', async () => {
    const { onReady } = show();
    await vi.waitFor(() => expect(fake.handlers.ready).toBeDefined());
    expect(onReady).not.toHaveBeenCalled();

    act(() => fake.handlers.ready());

    expect(onReady).toHaveBeenCalledWith(fake.widget);
  });

  it('reports play, pause and finish', async () => {
    const { onPlayState } = show();
    await vi.waitFor(() => expect(fake.handlers.play).toBeDefined());

    act(() => fake.handlers.play());
    act(() => fake.handlers.pause());
    act(() => fake.handlers.play());
    act(() => fake.handlers.finish());

    expect(onPlayState.mock.calls.map(c => c[0])).toEqual([true, false, true, false]);
  });

  it('says the song is no longer available when SoundCloud reports an error', async () => {
    show();
    await vi.waitFor(() => expect(fake.handlers.error).toBeDefined());

    act(() => fake.handlers.error());

    expect(screen.getByText('This song is no longer available.')).toBeInTheDocument();
  });

  it('asks for one tap on the player only when needed', () => {
    const { view } = show({ needsTap: false });
    expect(screen.queryByText('Tap the SoundCloud player once to start')).toBeNull();

    view.rerender(
      <SoundCloudPlayer url={TRACK} isVisible={true} needsTap={true} onReady={vi.fn()} onPlayState={vi.fn()} />
    );
    expect(screen.getByText('Tap the SoundCloud player once to start')).toBeInTheDocument();
  });

  it('keeps the player on screen only while SoundCloud is the active source', () => {
    const { view } = show({ isVisible: true });
    expect(screen.getByTestId('soundcloud-player-box').className).not.toContain('opacity-0');

    view.rerender(<SoundCloudPlayer url={TRACK} isVisible={false} onReady={vi.fn()} onPlayState={vi.fn()} />);
    expect(screen.getByTestId('soundcloud-player-box').className).toContain('opacity-0');
  });

  it('renders nothing until a SoundCloud track is chosen', () => {
    show({ url: null });
    expect(screen.queryByTitle('SoundCloud player')).toBeNull();
  });
});
