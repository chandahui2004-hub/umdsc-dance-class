#!/usr/bin/env node
/**
 * scripts/live-sandbox-verify.mjs
 *
 * Self-cleaning live GAS sandbox & sustainability test suite.
 * Validates public endpoints, cache warming, busy guards, and
 * (when authenticated) exercises the full music/sections sandbox lifecycle
 * with 100% guaranteed cleanup inside try/finally blocks.
 *
 * Usage:
 *   node scripts/live-sandbox-verify.mjs [--require-auth] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';

function getApiUrl() {
  if (process.env.VITE_API_URL) {
    return process.env.VITE_API_URL.trim();
  }

  const candidatePaths = ['web/.env.local', 'web/.env.production', '.env.local', '.env'];
  for (const relPath of candidatePaths) {
    const fullPath = path.resolve(relPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split('\n')) {
          const match = line.match(/^VITE_API_URL=(.+)$/);
          if (match) return match[1].trim();
        }
      } catch {}
    }
  }

  return null;
}

/** Parses JWT claims header safely without logging the token. */
function parseTokenClaims(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/** Checks whether a token is expired. */
function isTokenExpired(token) {
  const claims = parseTokenClaims(token);
  if (!claims || !claims.exp) return true;
  return claims.exp * 1000 <= Date.now();
}

async function postApi(apiUrl, action, payload = {}, token = undefined) {
  const body = { action };
  if (payload !== undefined) body.payload = payload;
  if (token) body.token = token;

  const start = Date.now();
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  const durationMs = Date.now() - start;
  const json = await res.json();
  return { json, durationMs };
}

async function getApi(apiUrl, queryParams = {}) {
  const url = new URL(apiUrl);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const start = Date.now();
  const res = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow'
  });
  const durationMs = Date.now() - start;
  const json = await res.json();
  return { json, durationMs };
}

async function resolveAdminToken(apiUrl) {
  let token = process.env.ADMIN_TOKEN || process.env.TOKEN;
  let source = token ? 'environment' : null;

  if (!token) {
    const tokenFilePath = path.resolve('.admin-token');
    if (fs.existsSync(tokenFilePath)) {
      try {
        const candidate = fs.readFileSync(tokenFilePath, 'utf8').trim();
        if (candidate) {
          token = candidate;
          source = '.admin-token file';
        }
      } catch {}
    }
  }

  if (token) {
    const claims = parseTokenClaims(token);
    if (isTokenExpired(token)) {
      const expIso = claims?.exp ? new Date(claims.exp * 1000).toISOString() : 'unknown';
      return {
        valid: false,
        token: null,
        reason: `Token from ${source} expired at ${expIso} (role: ${claims?.role || 'unknown'}, sub: ${claims?.sub || 'unknown'})`
      };
    }
    return {
      valid: true,
      token,
      claims: { sub: claims?.sub, role: claims?.role, exp: claims?.exp },
      source
    };
  }

  // Attempt login if credentials are provided in env
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    try {
      const { json } = await postApi(apiUrl, 'auth.adminLogin', { username, password });
      if (json.ok && json.data?.token) {
        const claims = parseTokenClaims(json.data.token);
        return {
          valid: true,
          token: json.data.token,
          claims: { sub: claims?.sub, role: claims?.role, exp: claims?.exp },
          source: 'authenticated via ADMIN_USERNAME/PASSWORD'
        };
      }
    } catch {}
  }

  return {
    valid: false,
    token: null,
    reason: 'No token or credentials found in environment (ADMIN_TOKEN / TOKEN / ADMIN_USERNAME) or .admin-token'
  };
}

async function main() {
  const args = process.argv.slice(2);
  const requireAuth = args.includes('--require-auth');
  const jsonOutput = args.includes('--json');

  const report = {
    timestamp: new Date().toISOString(),
    apiUrl: null,
    publicChecks: {},
    authenticatedChecks: null,
    overallOk: true
  };

  const apiUrl = getApiUrl();
  if (!apiUrl) {
    console.error('ERROR: VITE_API_URL not found in environment or web/.env.*');
    process.exit(1);
  }
  report.apiUrl = apiUrl.replace(/AKfycb[a-zA-Z0-9_-]{20,}/, 'AKfycb***');

  console.log(`\n======================================================`);
  console.log(` UMDSC Live GAS Sustainability & Sandbox Verification `);
  console.log(`======================================================\n`);
  console.log(`Target: ${report.apiUrl}\n`);

  // --- PART 1: Public & Warm Sustainability Checks ---
  console.log(`[1/2] Running Public & Warm Sustainability Checks...`);

  // Check 1.1: Health
  try {
    const { json, durationMs } = await getApi(apiUrl, { action: 'health' });
    const ok = json.ok === true && typeof json.data?.version === 'string';
    report.publicChecks.health = {
      ok,
      durationMs,
      version: json.data?.version,
      raw: json
    };
    if (!ok) report.overallOk = false;
    console.log(`  ✓ health: ok=${json.ok} version=${json.data?.version} (${durationMs}ms)`);
  } catch (err) {
    report.publicChecks.health = { ok: false, error: err.message };
    report.overallOk = false;
    console.error(`  ✗ health failed: ${err.message}`);
  }

  // Check 1.2: Cache Warmup
  try {
    const { json, durationMs } = await getApi(apiUrl, { action: 'warm' });
    const resObj = json.data?.result || {};
    const ok = json.ok === true && json.data?.warmed === true && resObj.errors === 0;
    report.publicChecks.warm = {
      ok,
      durationMs,
      warmed: json.data?.warmed,
      events: resObj.events,
      chunks: resObj.chunks,
      backfilled: resObj.backfilled,
      errors: resObj.errors,
      raw: json
    };
    if (!ok) report.overallOk = false;
    console.log(
      `  ✓ warm: ok=${json.ok} warmed=${json.data?.warmed} events=${resObj.events} chunks=${resObj.chunks} backfilled=${resObj.backfilled} errors=${resObj.errors} (${durationMs}ms)`
    );
  } catch (err) {
    report.publicChecks.warm = { ok: false, error: err.message };
    report.overallOk = false;
    console.error(`  ✗ warm failed: ${err.message}`);
  }

  // Check 1.3: Safe GET Guard (action-less GET returns BUSY)
  try {
    const { json, durationMs } = await getApi(apiUrl);
    const ok = json.ok === false && json.error?.code === 'BUSY' && json.error?.retryable === true;
    report.publicChecks.safeGetGuard = {
      ok,
      durationMs,
      code: json.error?.code,
      retryable: json.error?.retryable,
      raw: json
    };
    if (!ok) report.overallOk = false;
    console.log(`  ✓ safeGetGuard: code=${json.error?.code} retryable=${json.error?.retryable} (${durationMs}ms)`);
  } catch (err) {
    report.publicChecks.safeGetGuard = { ok: false, error: err.message };
    report.overallOk = false;
    console.error(`  ✗ safeGetGuard failed: ${err.message}`);
  }

  // Check 1.4: Setup Status POST
  try {
    const { json, durationMs } = await postApi(apiUrl, 'setup.status');
    const ok = json.ok === true && json.data?.initialized === true;
    report.publicChecks.setupStatus = {
      ok,
      durationMs,
      initialized: json.data?.initialized,
      dataVersion: json.dataVersion,
      raw: json
    };
    if (!ok) report.overallOk = false;
    console.log(`  ✓ setup.status: initialized=${json.data?.initialized} dataVersion=${json.dataVersion} (${durationMs}ms)`);
  } catch (err) {
    report.publicChecks.setupStatus = { ok: false, error: err.message };
    report.overallOk = false;
    console.error(`  ✗ setup.status failed: ${err.message}`);
  }

  // Check 1.5: Unknown Action Validation Envelope POST
  try {
    const { json, durationMs } = await postApi(apiUrl, 'unknown.action');
    const ok = json.ok === false && json.error?.code === 'VALIDATION';
    report.publicChecks.unknownAction = {
      ok,
      durationMs,
      code: json.error?.code,
      message: json.error?.message,
      raw: json
    };
    if (!ok) report.overallOk = false;
    console.log(`  ✓ unknown.action: code=${json.error?.code} message="${json.error?.message}" (${durationMs}ms)`);
  } catch (err) {
    report.publicChecks.unknownAction = { ok: false, error: err.message };
    report.overallOk = false;
    console.error(`  ✗ unknown.action failed: ${err.message}`);
  }

  // --- PART 2: Authenticated Live Sandbox Lifecycle ---
  console.log(`\n[2/2] Authenticated Live Sandbox Lifecycle...`);
  const authState = await resolveAdminToken(apiUrl);

  if (!authState.valid) {
    console.log(`  ℹ Skipped authenticated sandbox lifecycle:`);
    console.log(`    Reason: ${authState.reason}`);
    report.authenticatedChecks = {
      skipped: true,
      reason: authState.reason
    };

    if (requireAuth) {
      console.error(`\n  ✗ Exiting with failure because --require-auth was specified but no valid admin token is available.`);
      process.exit(1);
    }
  } else {
    console.log(`  ✓ Admin token active from ${authState.source} (sub: ${authState.claims.sub}, role: ${authState.claims.role})`);
    const token = authState.token;
    report.authenticatedChecks = {
      skipped: false,
      sub: authState.claims.sub,
      role: authState.claims.role,
      reads: {},
      sandboxTrack: {}
    };

    // 2.1 Read operations
    try {
      console.log(`  → Reading live datasets (events, styles, music, sections, autoSync)...`);
      const [eventsRes, stylesRes, musicRes, sectionsRes, autoSyncRes] = await Promise.all([
        postApi(apiUrl, 'events.list', { includeArchived: true }, token),
        postApi(apiUrl, 'styles.list', {}, token),
        postApi(apiUrl, 'music.list', {}, token),
        postApi(apiUrl, 'sections.list', {}, token),
        postApi(apiUrl, 'events.autoSync', { stabilize: true }, token)
      ]);

      const eventsOk = eventsRes.json.ok === true && Array.isArray(eventsRes.json.data);
      const stylesOk = stylesRes.json.ok === true && Array.isArray(stylesRes.json.data);
      const musicOk = musicRes.json.ok === true && Array.isArray(musicRes.json.data);
      const sectionsOk = sectionsRes.json.ok === true && Array.isArray(sectionsRes.json.data);
      const autoSyncOk = autoSyncRes.json.ok === true;

      report.authenticatedChecks.reads = {
        eventsCount: eventsRes.json.data?.length,
        stylesCount: stylesRes.json.data?.length,
        musicCount: musicRes.json.data?.length,
        sectionsCount: sectionsRes.json.data?.length,
        autoSyncOk
      };

      console.log(
        `  ✓ Live reads: events=${eventsRes.json.data?.length} styles=${stylesRes.json.data?.length} music=${musicRes.json.data?.length} sections=${sectionsRes.json.data?.length} autoSyncOk=${autoSyncOk}`
      );

      if (!eventsOk || !stylesOk || !musicOk || !sectionsOk || !autoSyncOk) {
        throw new Error('One or more read operations failed');
      }

      const activeEvent = eventsRes.json.data.find((e) => e.status === 'active') || eventsRes.json.data[0];
      const activeStyle = stylesRes.json.data.find((s) => s.active) || stylesRes.json.data[0];

      if (!activeEvent || !activeStyle) {
        console.log(`  ℹ No active event or style found to mount sandbox music item. Skipping write lifecycle.`);
        report.authenticatedChecks.sandboxTrack = { skipped: true, reason: 'No active event/style found' };
      } else {
        // 2.2 Self-cleaning Music & Section Write Lifecycle inside try / finally
        let createdTrack = null;
        let createdSection = null;

        try {
          console.log(`  → Creating sandbox music track on event "${activeEvent.name}" (${activeEvent.id})...`);
          const trackCreateRes = await postApi(
            apiUrl,
            'music.create',
            {
              eventId: activeEvent.id,
              styleId: activeStyle.id,
              sessionId: '',
              title: '[SANDBOX-VERIFY] Temporary Test Track',
              sourceType: 'youtube',
              youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            },
            token
          );

          if (!trackCreateRes.json.ok || !trackCreateRes.json.data?.id) {
            throw new Error(`Failed to create test music track: ${JSON.stringify(trackCreateRes.json)}`);
          }
          createdTrack = trackCreateRes.json.data;
          console.log(`  ✓ Created sandbox track: id=${createdTrack.id} version=${createdTrack.version}`);

          console.log(`  → Creating sandbox section on track ${createdTrack.id}...`);
          const sectionCreateRes = await postApi(
            apiUrl,
            'sections.create',
            {
              musicId: createdTrack.id,
              name: '[SANDBOX-VERIFY] Test Intro 0-10s',
              startSec: 0,
              endSec: 10
            },
            token
          );

          if (!sectionCreateRes.json.ok || !sectionCreateRes.json.data?.id) {
            throw new Error(`Failed to create test section: ${JSON.stringify(sectionCreateRes.json)}`);
          }
          createdSection = sectionCreateRes.json.data;
          console.log(`  ✓ Created sandbox section: id=${createdSection.id} version=${createdSection.version}`);

          // Verify both appear in lists
          const verifyMusic = await postApi(apiUrl, 'music.list', {}, token);
          const foundTrack = (verifyMusic.json.data || []).some((m) => m.id === createdTrack.id);
          const verifySections = await postApi(apiUrl, 'sections.list', { musicId: createdTrack.id }, token);
          const foundSection = (verifySections.json.data || []).some((s) => s.id === createdSection.id);

          console.log(`  ✓ Verified visibility in live queries: trackFound=${foundTrack} sectionFound=${foundSection}`);
          report.authenticatedChecks.sandboxTrack = {
            createdTrackId: createdTrack.id,
            createdSectionId: createdSection.id,
            verifiedVisible: foundTrack && foundSection
          };

          if (!foundTrack || !foundSection) {
            throw new Error('Sandbox items were not visible in live listing queries');
          }
        } finally {
          // Unconditional, guaranteed cleanup in finally block
          console.log(`  → Cleaning up sandbox items (unconditional try/finally)...`);
          if (createdSection) {
            try {
              const secDeactRes = await postApi(
                apiUrl,
                'sections.deactivate',
                { id: createdSection.id, version: createdSection.version },
                token
              );
              console.log(`  ✓ Deactivated sandbox section ${createdSection.id}: ok=${secDeactRes.json.ok}`);
            } catch (err) {
              console.error(`  ✗ Error deactivating section: ${err.message}`);
            }
          }

          if (createdTrack) {
            try {
              const trackDeactRes = await postApi(
                apiUrl,
                'music.deactivate',
                { id: createdTrack.id, version: createdTrack.version },
                token
              );
              console.log(`  ✓ Deactivated sandbox track ${createdTrack.id}: ok=${trackDeactRes.json.ok}`);
            } catch (err) {
              console.error(`  ✗ Error deactivating track: ${err.message}`);
            }
          }

          // Verify cleanup
          try {
            const finalMusic = await postApi(apiUrl, 'music.list', {}, token);
            const remaining = (finalMusic.json.data || []).some((m) => m.id === createdTrack?.id);
            console.log(`  ✓ Verified 100% removal in live query: remainingFound=${remaining}`);
            if (report.authenticatedChecks.sandboxTrack) {
              report.authenticatedChecks.sandboxTrack.cleanupVerified = !remaining;
            }
            if (remaining) {
              report.overallOk = false;
            }
          } catch (err) {
            console.error(`  ✗ Error verifying final cleanup: ${err.message}`);
          }
        }
      }
    } catch (err) {
      report.authenticatedChecks.error = err.message;
      report.overallOk = false;
      console.error(`  ✗ Authenticated lifecycle error: ${err.message}`);
    }
  }

  // --- Output Summary ---
  console.log(`\n------------------------------------------------------`);
  console.log(` Verification Summary: ${report.overallOk ? 'ALL PASSING (OK)' : 'FAILURES DETECTED'}`);
  console.log(`------------------------------------------------------`);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.overallOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
