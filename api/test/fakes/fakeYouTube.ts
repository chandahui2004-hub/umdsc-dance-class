import { YouTubePort, YouTubeSearchResult, YouTubeVideoInfo } from '../../src/ports';

export class FakeYouTube implements YouTubePort {
  searchCalls: { q: string; max: number }[] = [];
  videoCalls: string[][] = [];
  private results: YouTubeSearchResult[] = [];
  private info: Record<string, { durationSec: number; embeddable: boolean }> = {};
  private failure: Error | null = null;

  setSearch(results: YouTubeSearchResult[]): void {
    this.results = results;
  }

  setVideos(info: Record<string, { durationSec: number; embeddable: boolean }>): void {
    this.info = info;
  }

  failWith(error: Error): void {
    this.failure = error;
  }

  search(q: string, max: number): YouTubeSearchResult[] {
    this.searchCalls.push({ q, max });
    if (this.failure) throw this.failure;
    return this.results.slice(0, max);
  }

  videos(ids: string[]): YouTubeVideoInfo[] {
    this.videoCalls.push(ids);
    if (this.failure) throw this.failure;
    return ids.filter(id => this.info[id]).map(id => ({ youtubeId: id, ...this.info[id] }));
  }
}
