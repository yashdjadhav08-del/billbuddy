/**
 * Tests for the shared mock-state server (mock-server.mjs).
 *
 * Spawns the real server on an ephemeral port with a temp state file and
 * exercises the merge semantics end-to-end over HTTP — most importantly that
 * `remove.bills` actually deletes (regression test for the delete-bill flow).
 *
 * Run: node --test mock-server.test.mjs   (or: npm run test:srv)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 18700 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}/api/state`;
const STATE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'billbuddy-srv-')), 'state.json');

let server;
let baseUrl;

before(async () => {
  server = spawn(process.execPath, [path.join(HERE, 'mock-server.mjs')], {
    env: {
      ...process.env,
      MOCK_SERVER_PORT: String(PORT),
      MOCK_STATE_FILE: STATE_FILE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for the "listening" line.
  await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (String(chunk).includes('listening')) resolve();
    };
    server.stdout.on('data', onData);
    server.on('error', reject);
    setTimeout(() => reject(new Error('mock-server did not start in time')), 5000);
  });
  baseUrl = BASE;
});

after(async () => {
  server.kill();
  await new Promise((resolve) => server.on('exit', resolve));
});

async function get() {
  const res = await fetch(baseUrl);
  assert.equal(res.status, 200);
  return (await res.json()).state;
}

async function post(body) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  return (await res.json()).state;
}

const BILL = {
  id: 1,
  householdId: 1,
  title: 'Rent',
  category: 'rent',
  totalAmount: 5000,
  creator: 'G-OWNER',
  createdAt: 1,
  dueDate: 2,
  splitType: 'equal',
  shares: [],
  contributions: [],
  status: 'active',
};

test('starts empty', async () => {
  const state = await get();
  assert.equal(state.household, null);
  assert.deepEqual(state.bills, []);
  assert.deepEqual(state.settlements, []);
});

test('upsert unions bills by id without clobbering existing', async () => {
  const s1 = await post({ state: { bills: [BILL] } });
  assert.equal(s1.bills.length, 1);

  // Adding a second bill keeps the first (concurrent-writer safety).
  const s2 = await post({ state: { bills: [{ ...BILL, id: 2, title: 'Internet' }] } });
  assert.deepEqual(s2.bills.map((b) => b.id), [1, 2]);
});

test('upsert updates a bill with the same id', async () => {
  const state = await post({ state: { bills: [{ ...BILL, title: 'Renamed' }] } });
  assert.equal(state.bills.length, 2);
  const updated = state.bills.find((b) => b.id === 1);
  assert.equal(updated.title, 'Renamed');
});

test('remove.bills permanently deletes', async () => {
  const state = await post({ remove: { bills: [1] } });
  assert.deepEqual(state.bills.map((b) => b.id), [2]);
});

test('remove persists across reads', async () => {
  const state = await get();
  assert.deepEqual(state.bills.map((b) => b.id), [2]);
});

test('household is replaced wholesale', async () => {
  const household = {
    id: 1,
    name: 'Flat',
    owner: 'G-OWNER',
    createdAt: 0,
    active: true,
    periodClosed: false,
    periodLabel: 'Aug 2026',
    members: [],
  };
  const state = await post({ state: { household } });
  assert.equal(state.household.name, 'Flat');
});

test('DELETE resets state to empty and persists', async () => {
  const res = await fetch(baseUrl, { method: 'DELETE' });
  assert.equal(res.status, 200);
  const state = (await res.json()).state;
  assert.equal(state.household, null);
  assert.deepEqual(state.bills, []);
  assert.deepEqual(state.settlements, []);
  assert.deepEqual(await get(), state);
});
