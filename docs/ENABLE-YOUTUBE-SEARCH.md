# Switching on automatic YouTube matches for Spotify songs

**Status:** the code is deployed (version 15), but the search is **off** until you approve one Google permission.
Everything else already works: pasting a Spotify link shows the song, and the admin can paste their own
YouTube/SoundCloud/MP3 link as the practice version or save the song as listen-only. With search on, the form
also shows the three closest YouTube versions to choose from.

**Cost:** free. YouTube allows about 100 Spotify searches per day (10,000 units, 100 per search); the form tells
the admin when the limit is reached and manual paste keeps working.

**Time:** about 5 minutes, once. It needs the club Google account (`umdancesportc@gmail.com`).

## Steps

1. **Add the service to the manifest.** In `api/appsscript.json`:
   - under `dependencies.enabledAdvancedServices` add
     `{ "userSymbol": "YouTube", "serviceId": "youtube", "version": "v3" }`
   - under `oauthScopes` add `"https://www.googleapis.com/auth/youtube.readonly"`
2. **Push it** from the `api/` folder:
   `npm run push`, then `npx clasp create-version "enable youtube search"` (note the version number it prints).
3. **Approve the permission.** Open the Apps Script project (script id is in `docs/SETUP-VALUES.md`) as the club
   account. In the left sidebar choose **Services**; if *YouTube Data API v3* is not listed, press **+** and add it.
   Then select the function `authorizeOnce` at the top and press **Run**, and accept the permission screen
   (it now lists YouTube).
4. **Switch the live site to that version** (replace `N` with the version number from step 2):
   `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -V N`
5. **Check it:** as an admin, Media → **+ MUSIC LINK**, paste a Spotify song link. Three YouTube matches should
   appear. If you still see "YouTube search isn't available right now", step 3 was not completed.

> Do **not** do step 4 before step 3. A version that asks for a permission nobody has approved can make the
> site refuse requests until it is approved.

## Also worth doing once: the cache warm-up job

In the same editor, select `installWarmTrigger` and press **Run**. It creates a job that keeps the dancer
calendar data ready every 5 minutes, so the first dancer after an edit does not wait about 7 seconds. It also
finishes upgrading existing dancer records so login stops opening the event member sheets.
