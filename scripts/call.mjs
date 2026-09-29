#!/usr/bin/env node
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
  if (process.env.VITE_API_URL) {
    return process.env.VITE_API_URL;
  }
  return null;
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

async function main() {
  const action = process.argv[2];
  if (!action) {
    console.error('Usage: node scripts/call.mjs <action> [jsonPayload]');
    process.exit(1);
  }

  const apiUrl = getApiUrl();
  if (!apiUrl) {
    console.error('ERROR: VITE_API_URL not found in web/.env.local or environment variable.');
    process.exit(1);
  }

  let payload = null;
  if (process.argv[3]) {
    try {
      payload = JSON.parse(process.argv[3]);
    } catch {
      payload = process.argv[3];
    }
  }

  if (action === 'setup.init' && !payload) {
    console.log('--- UMDSC First-Run Setup ---');
    const setupCode = (await promptHidden('Enter SETUP_CODE: ')).trim();
    const dbFolderUrl = (await promptText('Enter Club DB Folder URL or ID: ')).trim();
    const adminUsername = (await promptText('Enter Admin Username: ')).trim();
    const adminDisplayName = (await promptText('Enter Admin Display Name: ')).trim();
    const adminPassword = (await promptHidden('Enter Admin Password: ')).trim();

    payload = {
      setupCode,
      dbFolderUrl,
      adminUsername,
      adminDisplayName,
      adminPassword
    };
  }

  if (action === 'auth.adminLogin' && !payload) {
    console.log('--- UMDSC Admin Login ---');
    const username = (await promptText('Enter Admin Username: ')).trim();
    const password = (await promptHidden('Enter Admin Password: ')).trim();
    payload = { username, password };
  }

  const body = {
    action,
    payload
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(text);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    process.exit(1);
  }
}

main();
