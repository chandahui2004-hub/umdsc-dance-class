export function streamUrl(fileId: string): string {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
}

export function downloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function openInDriveUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
