#!/usr/bin/env node
/**
 * UMDSC Load Test (Task 32 / Spec §12.4)
 * Evaluates performance and concurrency limits under heavy realistic load:
 * - Scenario A: 100 dancer.bootstrap calls spread over 10 s
 * - Scenario B: 50 simultaneous dancer.bootstrap calls
 * - Scenario C: 2 simulated admins each sending 40 attendance.mark ticks concurrently
 *
 * Pass criteria: 0 lost ticks, 0 failures after retries, p95 < 4s.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';

function getApiUrl() {
  const envLocalPath = path.resolve('web/.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^VITE_API_URL=(.+)$/);
      if (match) return match[1].trim();
    }
  }
  return process.env.VITE_API_URL || null;
}

function promptHidden(query) {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        } else {
          const str = chunk.toString();
          if (str.includes('\n') || str.includes('\r')) {
            process.stdout.write('\n');
          } else {
            process.stdout.write('*');
          }
        }
        callback();
      }
    });

    process.stdout.write(query);
    muted = true;

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: process.stdin.isTTY || false
    });

    rl.question('', (val) => {
      rl.close();
      resolve(val.trim());
    });
  });
}

function promptText(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (value) => {
      rl.close();
      resolve(value.trim());
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDelayMs(attempt) {
  const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt));
  const jitter = Math.random() * 0.6 - 0.3; // ±30%
  return Math.max(100, Math.round(baseDelay * (1 + jitter)));
}

function newOpId() {
  return 'op_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
}

/**
 * Call API with the same retry policy as web/src/lib/api.ts
 */
async function callApi(apiUrl, action, payload, token, opts = {}) {
  const maxRetries = opts.retries ?? 4;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body = {
        action,
        token,
        payload,
        opId: opts.opId || newOpId(),
        sinceVersion: opts.sinceVersion
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });

      const json = await res.json();
      if (json.ok) {
        const duration = Date.now() - startTime;
        return { ok: true, duration, data: json.data, dataVersion: json.dataVersion, attempts: attempt + 1 };
      }

      if (json.error?.retryable && attempt < maxRetries) {
        await wait(getDelayMs(attempt));
        continue;
      }

      return {
        ok: false,
        duration: Date.now() - startTime,
        error: json.error,
        attempts: attempt + 1
      };
    } catch (err) {
      if (attempt < maxRetries) {
        await wait(getDelayMs(attempt));
        continue;
      }
      return {
        ok: false,
        duration: Date.now() - startTime,
        error: { code: 'NETWORK_ERROR', message: err.message, retryable: true },
        attempts: attempt + 1
      };
    }
  }

  return {
    ok: false,
    duration: Date.now() - startTime,
    error: { code: 'MAX_RETRIES', message: 'Exceeded max retries', retryable: false },
    attempts: maxRetries + 1
  };
}

function calcPercentiles(durations) {
  if (durations.length === 0) return { p50: 0, p95: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  return { p50, p95, min, max, avg };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           UMDSC DANCE CLASS SYSTEM — LOAD TEST SUITE         ║');
  console.log('║                  (Spec §12.4 & Acceptance Gate)             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const apiUrl = getApiUrl();
  if (!apiUrl) {
    console.error('ERROR: VITE_API_URL not found in web/.env.local or environment variable.');
    process.exit(1);
  }
  console.log(`API Target: ${apiUrl}\n`);

  // Credentials
  let adminToken = process.env.ADMIN_TOKEN;
  let dancerToken = process.env.DANCER_TOKEN;

  if (!adminToken) {
    const tokenFile = path.resolve('.admin-token');
    if (fs.existsSync(tokenFile)) {
      adminToken = fs.readFileSync(tokenFile, 'utf8').trim();
    }
  }

  if (!adminToken) {
    console.log('--- Admin Authentication ---');
    const username = process.env.ADMIN_USER || (await promptText('Enter Admin Username: '));
    const password = process.env.ADMIN_PASSWORD || (await promptHidden('Enter Admin Password: '));
    console.log('Authenticating Admin...');
    const loginRes = await callApi(apiUrl, 'auth.adminLogin', { username, password });
    if (!loginRes.ok) {
      console.error('Admin Login failed:', loginRes.error?.message);
      process.exit(1);
    }
    adminToken = loginRes.data.token;
    console.log('Admin authenticated successfully.\n');
  } else {
    console.log('Using existing Admin token.\n');
  }

  if (!dancerToken) {
    console.log('--- Test Dancer Authentication ---');
    const matric = process.env.TEST_DANCER_MATRIC || (await promptText('Enter Test Dancer Matric (e.g. 22004591): '));
    const fullName = process.env.TEST_DANCER_NAME || (await promptText('Enter Test Dancer Full Name: '));
    console.log('Authenticating Dancer...');
    const loginRes = await callApi(apiUrl, 'auth.dancerLogin', { matric, fullName });
    if (!loginRes.ok) {
      console.error('Dancer Login failed:', loginRes.error?.message);
      console.log('Note: If dancer is not registered for test month, loadtest can use admin token to simulate dancers.');
      dancerToken = adminToken;
    } else {
      dancerToken = loginRes.data.token;
      console.log('Dancer authenticated successfully.\n');
    }
  }

  // -------------------------------------------------------------
  // Scenario A: 100 dancer.bootstrap calls spread over 10 s
  // -------------------------------------------------------------
  console.log('================================================================');
  console.log('SCENARIO A: 100 dancer.bootstrap calls spread over 10 seconds');
  console.log('================================================================');

  const scenarioAResults = [];
  const totalCallsA = 100;
  const intervalMsA = 100; // 100 * 100ms = 10s

  const startA = Date.now();
  for (let i = 0; i < totalCallsA; i++) {
    const p = callApi(apiUrl, 'dancer.bootstrap', {}, dancerToken).then((res) => {
      scenarioAResults.push(res);
      process.stdout.write(res.ok ? '.' : 'x');
    });
    if (i < totalCallsA - 1) {
      await wait(intervalMsA);
    }
  }

  // Wait for all in-flight to finish
  while (scenarioAResults.length < totalCallsA) {
    await wait(100);
  }
  const totalDurationA = Date.now() - startA;
  console.log(`\nCompleted in ${(totalDurationA / 1000).toFixed(2)}s`);

  const durationsA = scenarioAResults.map((r) => r.duration);
  const failuresA = scenarioAResults.filter((r) => !r.ok);
  const statsA = calcPercentiles(durationsA);

  console.log(`\nScenario A Results:`);
  console.log(`  Total: ${totalCallsA} | Success: ${totalCallsA - failuresA.length} | Failures: ${failuresA.length}`);
  console.log(`  p50: ${statsA.p50} ms | p95: ${statsA.p95} ms | Avg: ${statsA.avg} ms | Max: ${statsA.max} ms\n`);

  // -------------------------------------------------------------
  // Scenario B: 50 simultaneous calls
  // -------------------------------------------------------------
  console.log('================================================================');
  console.log('SCENARIO B: 50 simultaneous dancer.bootstrap calls');
  console.log('================================================================');

  const totalCallsB = 50;
  const startB = Date.now();
  const promisesB = Array.from({ length: totalCallsB }).map(async () => {
    const res = await callApi(apiUrl, 'dancer.bootstrap', {}, dancerToken);
    process.stdout.write(res.ok ? '.' : 'x');
    return res;
  });

  const scenarioBResults = await Promise.all(promisesB);
  const totalDurationB = Date.now() - startB;
  console.log(`\nCompleted in ${(totalDurationB / 1000).toFixed(2)}s`);

  const durationsB = scenarioBResults.map((r) => r.duration);
  const failuresB = scenarioBResults.filter((r) => !r.ok);
  const statsB = calcPercentiles(durationsB);

  console.log(`\nScenario B Results:`);
  console.log(`  Total: ${totalCallsB} | Success: ${totalCallsB - failuresB.length} | Failures: ${failuresB.length}`);
  console.log(`  p50: ${statsB.p50} ms | p95: ${statsB.p95} ms | Avg: ${statsB.avg} ms | Max: ${statsB.max} ms\n`);

  // -------------------------------------------------------------
  // Scenario C: 2 simulated admins each sending 40 attendance marks
  // -------------------------------------------------------------
  console.log('================================================================');
  console.log('SCENARIO C: 2 simulated admins concurrently sending 40 attendance marks');
  console.log('================================================================');

  // Discover active test event/sessions for test
  console.log('Fetching test event and session data...');
  const bootRes = await callApi(apiUrl, 'admin.bootstrap', {}, adminToken);
  let testEventId = 'evt-oct';
  let testStyleId = 'style-hiphop';
  let testSessionId = 'sess-1';

  if (bootRes.ok && bootRes.data) {
    const events = bootRes.data.events || [];
    const targetEvent = events.find((e) => e.status === 'active') || events[0];
    if (targetEvent) {
      testEventId = targetEvent.id;
      if (targetEvent.styleIds?.length) testStyleId = targetEvent.styleIds[0];
    }
    const sessions = bootRes.data.sessions || [];
    const targetSession = sessions.find((s) => s.eventId === testEventId) || sessions[0];
    if (targetSession) {
      testSessionId = targetSession.id;
    }
  }

  console.log(`Target: eventId=${testEventId}, styleId=${testStyleId}, sessionId=${testSessionId}`);

  // 2 admins sending batches of 10 ticks (4 batches of 10 each = 40 per admin = 80 total)
  const simulateAdminMarks = async (adminId, count) => {
    const results = [];
    const batchSize = 10;
    const numBatches = Math.ceil(count / batchSize);

    for (let b = 0; b < numBatches; b++) {
      const marks = [];
      for (let i = 0; i < batchSize; i++) {
        const matric = `test-dancer-${adminId}-${b * batchSize + i}`;
        marks.push({
          matric,
          sessionId: testSessionId,
          present: true
        });
      }

      const res = await callApi(
        apiUrl,
        'attendance.markBatch',
        {
          eventId: testEventId,
          styleId: testStyleId,
          marks
        },
        adminToken
      );

      results.push(res);
      process.stdout.write(res.ok ? '✓' : '✗');
    }
    return results;
  };

  const startC = Date.now();
  const [admin1Results, admin2Results] = await Promise.all([
    simulateAdminMarks('adm1', 40),
    simulateAdminMarks('adm2', 40)
  ]);
  const totalDurationC = Date.now() - startC;
  console.log(`\nMarks dispatched in ${(totalDurationC / 1000).toFixed(2)}s`);

  const allCResults = [...admin1Results, ...admin2Results];
  const durationsC = allCResults.map((r) => r.duration);
  const failuresC = allCResults.filter((r) => !r.ok);
  const statsC = calcPercentiles(durationsC);

  // Read back attendance grid to verify tick persistence
  console.log('\nReading attendance grid back to verify tick persistence...');
  const gridRes = await callApi(
    apiUrl,
    'attendance.getGrid',
    { eventId: testEventId, styleId: testStyleId },
    adminToken
  );

  let recordedTicks = 0;
  if (gridRes.ok && gridRes.data?.present) {
    const presentMap = gridRes.data.present;
    for (const [memberKey, sessList] of Object.entries(presentMap)) {
      if (memberKey.startsWith('test-dancer-') && sessList.includes(testSessionId)) {
        recordedTicks++;
      }
    }
  }

  const expectedTicks = 80;
  const lostTicks = Math.max(0, expectedTicks - recordedTicks);

  console.log(`\nScenario C Results:`);
  console.log(`  Batches: ${allCResults.length} | Success: ${allCResults.length - failuresC.length} | Failures: ${failuresC.length}`);
  console.log(`  p50: ${statsC.p50} ms | p95: ${statsC.p95} ms | Avg: ${statsC.avg} ms | Max: ${statsC.max} ms`);
  console.log(`  Recorded Ticks: ${recordedTicks} / ${expectedTicks} | Lost Ticks: ${lostTicks}\n`);

  // -------------------------------------------------------------
  // Final Evaluation Gate
  // -------------------------------------------------------------
  const totalFailures = failuresA.length + failuresB.length + failuresC.length;
  const maxP95 = Math.max(statsA.p95, statsB.p95, statsC.p95);

  console.log('================================================================');
  console.log('FINAL ACCEPTANCE GATE SUMMARY');
  console.log('================================================================');
  console.log(`1. Lost ticks:          ${lostTicks} (Pass criteria: 0) -> ${lostTicks === 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`2. Failures:            ${totalFailures} (Pass criteria: 0) -> ${totalFailures === 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`3. Max p95 latency:     ${maxP95} ms (Pass criteria: < 4000 ms) -> ${maxP95 < 4000 ? 'PASS ✓' : 'FAIL ✗'}`);

  const passed = lostTicks === 0 && totalFailures === 0 && maxP95 < 4000;
  console.log(`\nOVERALL STATUS: ${passed ? 'PASSED ACCEPTANCE GATE ✓' : 'FAILED / NEEDS REVIEW ✗'}\n`);

  if (!passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during load test:', err);
  process.exit(1);
});
