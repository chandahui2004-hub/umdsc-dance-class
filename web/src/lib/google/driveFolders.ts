export async function ensureFolderPath(
  token: string,
  rootId: string,
  names: string[]
): Promise<string> {
  let currentParentId = rootId;

  for (const name of names) {
    if (!name.trim()) continue;

    // 1. Search for existing folder under currentParentId
    const safeName = name.replace(/'/g, "\\'");
    const q = `'${currentParentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;

    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list folders under ${currentParentId} (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const existing = data.files && data.files.length > 0 ? data.files[0] : null;

    if (existing) {
      currentParentId = existing.id;
    } else {
      // 2. Create subfolder
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParentId]
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create subfolder "${name}" (${createRes.status}): ${errText}`);
      }

      const createdData = await createRes.json();
      currentParentId = createdData.id;
    }
  }

  return currentParentId;
}
