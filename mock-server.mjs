/**
 * BillBuddy shared mock-state server.
 *
 * A tiny, dependency-free HTTP JSON server that acts as the SHARED source of
 * truth for mock mode. Any user — on any browser or device — reads from and
 * writes to this same server, so bills/households created by one real account
 * are instantly visible to every other account. This simulates the shared
 * on-chain ledger without needing a deployed Soroban contract.
 *
 * Endpoints:
 *   GET    /api/state  ->  { "state": { household, bills, settlements } }
 *   DELETE /api/state  ->  reset to an empty state and persist.
 *   POST   /api/state  ->  merge body into state, persist, echo merged state.
 *     Body shape: { state?: { household?, bills?, settlements? },
 *                   remove?: { bills?: number[], settlements?: number[] } }
 *     `state` arrays are unioned by id (upsert) so concurrent writers don't
 *     clobber each other; `remove` then deletes the listed ids explicitly.
 *
 * State persists to mock-state.json so it survives server restarts.
 * Run: node mock-server.mjs   (default port 8787)
 * Env overrides: MOCK_SERVER_PORT, MOCK_STATE_FILE (used by tests)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE =
  process.env.MOCK_STATE_FILE ?? path.join(__dirname, 'mock-state.json');
const PORT = Number(process.env.MOCK_SERVER_PORT ?? 8787);

const EMPTY = { household: null, bills: [], settlements: [] };

function load() {
  if (!existsSync(STATE_FILE)) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return {
      household: parsed.household ?? null,
      bills: parsed.bills ?? [],
      settlements: parsed.settlements ?? [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

let state = load();

function save() {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Union arrays by `id` so concurrent writers don't clobber each other. */
function mergeById(prev = [], next = []) {
  const map = new Map();
  for (const x of prev) map.set(x.id, x);
  for (const x of next) {
    if (x && x.id != null) map.set(x.id, x);
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && req.url === '/api/state') {
    return send(200, { state });
  }

  if (req.method === 'DELETE' && req.url === '/api/state') {
    state = structuredClone(EMPTY);
    save();
    return send(200, { state });
  }

  if (req.method === 'POST' && req.url === '/api/state') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const incoming = parsed.state ?? parsed ?? {};
        const remove = parsed.remove ?? {};
        const removedBills = remove.bills ?? [];
        const removedSettlements = remove.settlements ?? [];
        const merged = {
          household: incoming.household ?? state.household ?? null,
          bills: mergeById(state.bills, incoming.bills ?? []).filter(
            (b) => !removedBills.includes(b.id),
          ),
          settlements: mergeById(state.settlements, incoming.settlements ?? []).filter(
            (s) => !removedSettlements.includes(s.id),
          ),
        };
        state = merged;
        save();
        return send(200, { state });
      } catch (err) {
        return send(400, { error: String(err) });
      }
    });
    return;
  }

  send(404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[billbuddy] shared state server listening on http://0.0.0.0:${PORT}`);
  console.log(`[billbuddy] state file: ${STATE_FILE}`);
});