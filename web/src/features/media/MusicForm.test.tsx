import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DanceStyle, ResolvedLink } from '@umdsc/shared';
import { MusicForm } from './MusicForm';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e))
}));

const post = vi.mocked(api.post);
const style = { id: 'st1', name: 'Locking' } as DanceStyle;
const YT = '4_KN-gA6uXY';
const SPOTIFY_URL = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';

const candidate = (youtubeId: string, title: string, channel: string, lengthMatch: boolean, durationSec = 214) => ({
  youtubeId,
  title,
  channel,
  durationSec,
  thumbnailUrl: `https://img/${youtubeId}.jpg`,
  lengthMatch
});

const spotifyResolved = (over: Partial<Extract<ResolvedLink, { kind: 'spotify' }>> = {}): ResolvedLink => ({
  kind: 'spotify',
  spotifyUrl: SPOTIFY_URL,
  title: 'Never Gonna Give You Up',
  artist: 'Rick Astley',
  durationSec: 214,
  candidates: [
    candidate('aaaaaaaaaaa', 'Never Gonna Give You Up', 'Rick Astley - Topic', true),
    candidate('bbbbbbbbbbb', 'Never Gonna Give You Up (Official Audio)', 'Rick Astley', true),
    candidate('ccccccccccc', 'Never Gonna Give You Up (Extended)', 'Some Label', false, 252)
  ],
  ...over
});

function scriptResolve(resolved: ResolvedLink | Error) {
  post.mockImplementation((async (action: string) => {
    if (action === 'music.resolveLink') {
      if (resolved instanceof Error) throw resolved;
      return { data: resolved, dataVersion: 1 };
    }
    return { data: { id: 'new' }, dataVersion: 2 };
  }) as never);
}

function renderForm(onSuccess = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MusicForm style={style} eventId="e1" sessions={[]} onClose={() => {}} onSuccess={onSuccess} />
    </QueryClientProvider>
  );
  return { onSuccess };
}

const paste = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Paste a YouTube, Spotify, SoundCloud or Drive MP3 link'), {
    target: { value }
  });

const saveButton = () => screen.getByRole('button', { name: 'ADD MUSIC' });
const createCalls = () => post.mock.calls.filter(c => c[0] === 'music.create');

describe('MusicForm', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('recommends MP3 for the most reliable practice playback', () => {
    renderForm();
    expect(
      screen.getByText('Tip: upload an MP3 for the most reliable practice playback (works offline, on every phone).')
    ).toBeInTheDocument();
  });

  it('fills the title from a YouTube link and saves with just the link', async () => {
    scriptResolve({ kind: 'youtube', youtubeId: YT, title: 'Never Gonna Give You Up', embeddable: true });
    renderForm();

    paste(`https://youtu.be/${YT}`);
    expect(await screen.findByDisplayValue('Never Gonna Give You Up')).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    await waitFor(() => expect(createCalls()).toHaveLength(1));
    const payload = createCalls()[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      styleId: 'st1',
      eventId: 'e1',
      title: 'Never Gonna Give You Up',
      url: `https://youtu.be/${YT}`
    });
    expect(payload).not.toHaveProperty('sourceType');
  });

  it('keeps a title the admin typed instead of overwriting it with the link title', async () => {
    scriptResolve({ kind: 'youtube', youtubeId: YT, title: 'Never Gonna Give You Up', embeddable: true });
    renderForm();

    fireEvent.change(screen.getByPlaceholderText('e.g. Uptown Funk - Bruno Mars'), { target: { value: 'My own name' } });
    paste(`https://youtu.be/${YT}`);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.getByDisplayValue('My own name')).toBeInTheDocument();
  });

  it('warns before saving a YouTube video that blocks playback outside YouTube', async () => {
    scriptResolve({ kind: 'youtube', youtubeId: YT, title: '', embeddable: false });
    renderForm();

    paste(`https://youtu.be/${YT}`);

    expect(
      await screen.findByText(
        "This video blocks playback outside YouTube, so dancers can't practise with it. Try the 'Official Audio' version."
      )
    ).toBeInTheDocument();
  });

  it('shows the Spotify song and three matches, and cannot save until one is chosen', async () => {
    scriptResolve(spotifyResolved());
    renderForm();

    paste(SPOTIFY_URL);

    expect(await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'USE THIS' })).toHaveLength(3);
    expect(screen.getAllByText('✓ same length')).toHaveLength(2);
    expect(screen.getByText('✗ different length — check the version')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the YouTube version the admin picked, together with the Spotify link', async () => {
    scriptResolve(spotifyResolved());
    renderForm();
    paste(SPOTIFY_URL);
    await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34');

    fireEvent.click(screen.getAllByRole('button', { name: 'USE THIS' })[1]);
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    await waitFor(() => expect(createCalls()).toHaveLength(1));
    expect(createCalls()[0][1]).toMatchObject({ url: SPOTIFY_URL, chosenYoutubeId: 'bbbbbbbbbbb' });
  });

  it('plays a match in a small player when the admin taps Listen', async () => {
    scriptResolve(spotifyResolved());
    renderForm();
    paste(SPOTIFY_URL);
    await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34');

    fireEvent.click(screen.getAllByRole('button', { name: /LISTEN/ })[0]);

    const player = document.querySelector('iframe[src*="youtube-nocookie.com/embed/aaaaaaaaaaa"]');
    expect(player).not.toBeNull();
  });

  it('saves a Spotify song as listen-only when the admin chooses that', async () => {
    scriptResolve(spotifyResolved());
    renderForm();
    paste(SPOTIFY_URL);
    await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34');

    fireEvent.click(screen.getByRole('button', { name: 'SAVE AS LISTEN-ONLY' }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    await waitFor(() => expect(createCalls()).toHaveLength(1));
    expect(createCalls()[0][1]).toMatchObject({ url: SPOTIFY_URL, listenOnly: true });
  });

  it('saves a practice link the admin pasted instead of a match', async () => {
    scriptResolve(spotifyResolved());
    renderForm();
    paste(SPOTIFY_URL);
    await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34');

    fireEvent.change(screen.getByPlaceholderText('Paste a YouTube, SoundCloud or MP3 link'), {
      target: { value: 'https://soundcloud.com/forss/flickermood' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'USE LINK' }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    await waitFor(() => expect(createCalls()).toHaveLength(1));
    expect(createCalls()[0][1]).toMatchObject({ url: SPOTIFY_URL, practiceUrl: 'https://soundcloud.com/forss/flickermood' });
  });

  it('refuses a pasted practice link that is not YouTube, SoundCloud or Drive', async () => {
    scriptResolve(spotifyResolved());
    renderForm();
    paste(SPOTIFY_URL);
    await screen.findByText('Never Gonna Give You Up · Rick Astley · 3:34');

    fireEvent.change(screen.getByPlaceholderText('Paste a YouTube, SoundCloud or MP3 link'), {
      target: { value: 'https://tiktok.com/@x/video/1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'USE LINK' }));

    expect(await screen.findByText(/Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('explains when the YouTube search limit is used up, and manual paste still works', async () => {
    scriptResolve(spotifyResolved({ candidates: [], notice: 'SEARCH_QUOTA' }));
    renderForm();

    paste(SPOTIFY_URL);

    expect(
      await screen.findByText('Search limit reached for today. Paste the YouTube link yourself or try after 4 pm.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'USE THIS' })).toBeNull();
    expect(screen.getByPlaceholderText('Paste a YouTube, SoundCloud or MP3 link')).toBeInTheDocument();
  });

  it('explains when YouTube search is not available, and the admin can still save listen-only', async () => {
    scriptResolve(spotifyResolved({ candidates: [], notice: 'SEARCH_UNAVAILABLE' }));
    renderForm();

    paste(SPOTIFY_URL);

    expect(
      await screen.findByText(
        "YouTube search isn't available right now. Paste the YouTube link yourself, or save as listen-only."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('No matching YouTube versions found. Paste your own below.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'SAVE AS LISTEN-ONLY' }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it('ignores a lookup that finishes after the admin cleared the link', async () => {
    let finishLookup!: (value: unknown) => void;
    post.mockImplementation((async (action: string) =>
      action === 'music.resolveLink'
        ? new Promise(resolve => {
            finishLookup = resolve;
          })
        : { data: {}, dataVersion: 1 }) as never);
    renderForm();

    paste(SPOTIFY_URL);
    await waitFor(() => expect(post).toHaveBeenCalledWith('music.resolveLink', expect.anything()));
    paste('');
    await act(async () => {
      finishLookup({ data: spotifyResolved(), dataVersion: 1 });
    });

    expect(screen.queryByText(/Rick Astley/)).toBeNull();
    expect(screen.getByPlaceholderText('e.g. Uptown Funk - Bruno Mars')).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });

  it('shows why a link is unsupported and cannot be saved', async () => {
    renderForm();

    paste('https://tiktok.com/@x/video/1');

    expect(await screen.findByText(/Use a YouTube, Spotify, SoundCloud or Google Drive MP3 link/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(post).not.toHaveBeenCalled(); // the shared parser already knows it is unsupported
  });

  it('shows the server reason when a link cannot be used', async () => {
    scriptResolve(new Error("LINK_INVALID: This SoundCloud track can't be played on other websites."));
    renderForm();

    paste('https://soundcloud.com/forss/gone');

    expect(await screen.findByText(/can't be played on other websites/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});
