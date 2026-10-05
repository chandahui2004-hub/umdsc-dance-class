/**
 * Moves a Drive file to the trash (recoverable for 30 days) with the signed-in user's token.
 * Works for files this app uploaded with that account; returns false if Drive refuses.
 */
export async function trashDriveFile(token: string, fileId: string): Promise<boolean> {
  if (!token || !fileId) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      }
    );
    // 404 means the file is already gone (or trashed for good), which is what we want.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
