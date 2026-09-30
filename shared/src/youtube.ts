/**
 * Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue)
 * Used with permission.
 */

export function getYouTubeVideoId(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  // youtu.be/<id>
  const youtuBeMatch = trimmedValue.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (youtuBeMatch) {
    return youtuBeMatch[1];
  }

  // youtube.com watch?v=<id>
  const watchMatch = trimmedValue.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) {
    return watchMatch[1];
  }

  // youtube.com/embed/<id> or /v/<id> or /shorts/<id>
  const embedMatch = trimmedValue.match(/youtube\.com\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) {
    return embedMatch[1];
  }

  return null;
}
