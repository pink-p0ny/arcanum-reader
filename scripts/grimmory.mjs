#!/usr/bin/env node
// Read-only look at a Grimmory/Booklore catalog from the terminal. Nothing is stored: the password is
// typed at a hidden prompt and the token lives only in this process.
//
//   node scripts/grimmory.mjs dupes [server] [username]   near-duplicate titles with raw metadata
//   node scripts/grimmory.mjs dump  [server] [username]   every record as JSON lines
//
// Pass the server and username as arguments or answer the prompts.

import readline from 'node:readline';

import { editionKey } from '../src/lib/editions.ts';

const [cmd = 'dupes', serverArg, userArg] = process.argv.slice(2);

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    if (hidden) {
      rl.stdoutMuted = true;
      rl._writeToOutput = (s) => {
        if (!rl.stdoutMuted || /\n/.test(s)) process.stderr.write(s.replace(/[^\n]/g, ''));
      };
    }
    process.stderr.write(q);
    rl.question('', (a) => {
      rl.close();
      if (hidden) process.stderr.write('\n');
      resolve(a.trim());
    });
  });
}

async function login() {
  let server = serverArg || (await ask('Server: '));
  if (!/^https?:\/\//.test(server)) server = `https://${server}`;
  server = server.replace(/\/+$/, '');
  const username = userArg || (await ask('Username: '));
  const password = await ask('Password: ', true);
  const res = await fetch(`${server}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`);
  const { accessToken } = await res.json();
  return { server, headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } };
}

async function allBooks({ server, headers }) {
  const out = [];
  for (let page = 0; ; page++) {
    const res = await fetch(`${server}/api/v1/app/books?page=${page}&size=200&sort=title&dir=asc`, { headers });
    if (!res.ok) throw new Error(`List failed: HTTP ${res.status}`);
    const body = await res.json();
    out.push(...body.content);
    if (!body.hasNext) break;
  }
  return out;
}

/** Title words only, articles and punctuation gone: the loosest plausible "same book" key. */
const looseKey = (b) =>
  (b.title ?? '')
    .toLowerCase()
    .replace(/[:–—-].*$/, ' ')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '');

const line = (b) =>
  `  #${b.id} ${JSON.stringify(b.title)} by ${JSON.stringify(b.authors ?? [])} ` +
  `${b.primaryFileType ?? '?'} file=${JSON.stringify(b.primaryFileName ?? '')}` +
  (b.seriesName ? ` series=${JSON.stringify(b.seriesName)}#${b.seriesNumber ?? ''}` : '') +
  (b.readProgress ? ` ${b.readProgress}%` : '');

const books = await allBooks(await login());
console.error(`${books.length} records`);

if (cmd === 'dump') {
  for (const b of books) console.log(JSON.stringify(b));
} else {
  const groups = new Map();
  for (const b of books) {
    const k = looseKey(b);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  let shown = 0;
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    // Already one card in the app when every strict key matches.
    if (new Set(g.map(editionKey)).size === 1) continue;
    shown++;
    console.log(`\n${k}`);
    for (const b of g) console.log(line(b));
  }
  console.error(`\n${shown} groups the app shows as separate cards`);
}
