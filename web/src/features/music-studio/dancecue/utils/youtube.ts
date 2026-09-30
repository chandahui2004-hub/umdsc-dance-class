// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

export function getYouTubeVideoId(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (url.hostname.includes("youtube.com")) {
      const watchId = url.searchParams.get("v");

      if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) {
        return watchId;
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const embeddedId = pathParts.find((part) => /^[a-zA-Z0-9_-]{11}$/.test(part));

      return embeddedId ?? null;
    }
  } catch {
    return null;
  }

  return null;
}
