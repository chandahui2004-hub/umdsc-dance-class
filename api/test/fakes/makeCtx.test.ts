import { describe, it, expect } from 'vitest';
import { makeCtx } from './makeCtx';
import { AppError } from '../../src/errors';

describe('makeCtx scriptable ports', () => {
  it('http fake answers by url prefix, logs each call, and is 404 for anything unscripted', () => {
    const ctx = makeCtx();
    ctx.http.respond('https://soundcloud.com/oembed', { status: 200, body: '{"title":"Flickermood by Forss"}' });

    const hit = ctx.http.fetch('https://soundcloud.com/oembed?format=json&url=x');
    const miss = ctx.http.fetch('https://example.com/nothing');

    expect(hit.status).toBe(200);
    expect(JSON.parse(hit.body).title).toBe('Flickermood by Forss');
    expect(miss.status).toBe(404);
    expect(ctx.http.calls).toEqual(['https://soundcloud.com/oembed?format=json&url=x', 'https://example.com/nothing']);
  });

  it('http fake prefers the longest matching prefix and passes followRedirects through', () => {
    const ctx = makeCtx();
    ctx.http.respond('https://on.soundcloud.com/', { status: 404 });
    ctx.http.respond('https://on.soundcloud.com/AbC', { status: 302, headers: { location: 'https://soundcloud.com/a/b' } });

    const res = ctx.http.fetch('https://on.soundcloud.com/AbC123', { followRedirects: false });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://soundcloud.com/a/b');
    expect(ctx.http.lastOptions).toEqual({ followRedirects: false });
  });

  it('youtube fake returns scripted results, logs searches, and can fail with QUOTA', () => {
    const ctx = makeCtx();
    ctx.youtube.setSearch([{ youtubeId: 'aaaaaaaaaaa', title: 'T', channel: 'C', thumbnailUrl: '' }]);
    ctx.youtube.setVideos({ aaaaaaaaaaa: { durationSec: 214, embeddable: true } });

    expect(ctx.youtube.search('rick astley never gonna', 10)).toHaveLength(1);
    expect(ctx.youtube.videos(['aaaaaaaaaaa', 'bbbbbbbbbbb'])).toEqual([
      { youtubeId: 'aaaaaaaaaaa', durationSec: 214, embeddable: true }
    ]);
    expect(ctx.youtube.searchCalls).toEqual([{ q: 'rick astley never gonna', max: 10 }]);

    ctx.youtube.failWith(new AppError('QUOTA', 'limit'));
    expect(() => ctx.youtube.search('x', 3)).toThrow(/limit/);
  });

  it('drive fake reports the mime type of a file it was told about', () => {
    const ctx = makeCtx();
    const id = ctx.drive.createFolder('root', 'f'); // any existing item
    (ctx.drive as any).setMimeType(id, 'audio/mpeg');
    expect(ctx.drive.info(id).mimeType).toBe('audio/mpeg');
  });
});
