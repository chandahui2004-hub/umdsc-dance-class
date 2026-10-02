import { HttpPort } from '../../src/ports';

export interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** Answers by the longest scripted URL prefix; anything else is a 404. Logs every URL fetched. */
export class FakeHttp implements HttpPort {
  calls: string[] = [];
  lastOptions: { followRedirects?: boolean } | undefined;
  private scripted: { prefix: string; response: FakeResponse }[] = [];

  /** Scripts an answer for URLs starting with `prefix`; scripting the same prefix again replaces it. */
  respond(prefix: string, response: FakeResponse): void {
    this.scripted = this.scripted.filter(s => s.prefix !== prefix);
    this.scripted.push({ prefix, response });
  }

  fetch(url: string, opts?: { followRedirects?: boolean }) {
    this.calls.push(url);
    this.lastOptions = opts;
    const match = this.scripted
      .filter(s => url.startsWith(s.prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    const r = match?.response ?? { status: 404 };
    return { status: r.status, headers: r.headers ?? {}, body: r.body ?? '' };
  }
}
