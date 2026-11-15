# Enabling Automatic YouTube Search for Spotify Tracks

## Overview & Scope Clarification

The system supports two distinct YouTube capabilities:
1. **Direct YouTube Playback & Unlisted URLs (Active & Free):**
   - Pasting any public or unlisted YouTube video URL into **Media** or the **Music Studio** works out of the box with zero setup.
   - Dancers can watch class recap videos and listen to practice tracks without consuming any YouTube API quotas.
2. **Automatic YouTube Search for Spotify Tracks (Advanced Service):**
   - When an administrator pastes a Spotify track link into **Media › + MUSIC LINK**, the system can query the YouTube Data API v3 to automatically locate and suggest the 3 closest matching video versions.
   - This optional feature requires enabling the YouTube Data API v3 in Google Apps Script and approving Google Cloud permissions once.

---

## Quota & Cost

- **Cost:** Free.
- **Daily Quota:** Google Cloud grants 10,000 units per day (approximately 100 Spotify track searches per day at 100 units per search).
- If the daily search quota is exceeded, the form gracefully falls back and informs the administrator, while manual URL pasting continues to work uninterrupted.

---

## Step-by-Step Activation

Activating Spotify auto-matching requires approximately 5 minutes using the club Google account (`umdancesportc@gmail.com`):

### Step 1: Enable the advanced service in manifest
In `api/appsscript.json`:
1. Under `dependencies.enabledAdvancedServices`, add:
   ```json
   { "userSymbol": "YouTube", "serviceId": "youtube", "version": "v3" }
   ```
2. Under `oauthScopes`, ensure the read-only scope is present:
   ```json
   "https://www.googleapis.com/auth/youtube.readonly"
   ```

### Step 2: Push backend updates
In the root directory, run:
```bash
npm run push -w api
```

### Step 3: Approve permissions in Google Apps Script
1. Open the Apps Script project editor for Script ID `1f3p4D-1zClfrSUmoa6g5zgw95c-MgTVQ8j0jKv7j1hVE1yNINQ5qw6iL` signed in as `umdancesportc@gmail.com`.
2. In the left sidebar, click **Services (+)**; if **YouTube Data API v3** is not listed, add it.
3. At the top function dropdown, select `authorizeOnce` and click **Run**.
4. Complete the Google OAuth consent dialog to grant read-only YouTube search access.

### Step 4: Verification
1. Log in to the website as an administrator.
2. Open **Media › + MUSIC LINK** and paste a valid Spotify track link.
3. Three matching YouTube candidate options should populate automatically with preview thumbnails.

---

## Routine Cache Warm-Up Verification

In the same Google Apps Script editor, run the `installWarmTrigger` function once if not already installed. It creates a recurring time-driven trigger (`warmDancerCaches`) that keeps active event caches warm, synchronizes Google Form registrations every 60 seconds, and checks style slot capacity limits every 10 minutes.
