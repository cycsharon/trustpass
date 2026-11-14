// Hash-chained audit ledger (a single-node stand-in for a permissioned blockchain).
// Each block stores only hashes and event metadata - never personal data or raw evidence.
// Changing any past block breaks every hash after it, which verifyChain() detects.

import { sha256Hex, canonicalize } from "./crypto.js";

const KEY = "trustpass.ledger.v1";

const memory = { data: null };
const store = {
  load() {
    try { if (globalThis.localStorage) return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* ignore */ }
    return memory.data;
  },
  save(chain) {
    try { if (globalThis.localStorage) { localStorage.setItem(KEY, JSON.stringify(chain)); return; } } catch { /* ignore */ }
    memory.data = chain;
  },
};

async function blockHash(b) {
  const { hash, ...body } = b;
  return sha256Hex(canonicalize(body));
}

export async function getChain() {
  let chain = store.load();
  if (!chain || !chain.length) {
    const genesis = { index: 0, ts: new Date().toISOString(), type: "GENESIS", ref: null, data: { note: "TrustPass ledger node" }, prev: "0".repeat(64) };
    genesis.hash = await blockHash(genesis);
    chain = [genesis];
    store.save(chain);
  }
  return chain;
}

export async function append(type, ref, data = {}) {
  const chain = await getChain();
  const last = chain[chain.length - 1];
  const block = { index: last.index + 1, ts: new Date().toISOString(), type, ref, data, prev: last.hash };
  block.hash = await blockHash(block);
  chain.push(block);
  store.save(chain);
  return block;
}

export async function verifyChain() {
  const chain = await getChain();
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    if (await blockHash(b) !== b.hash) return { ok: false, brokenAt: i, reason: "Block contents do not match its hash" };
    if (i > 0 && b.prev !== chain[i - 1].hash) return { ok: false, brokenAt: i, reason: "Link to previous block is broken" };
  }
  return { ok: true, length: chain.length };
}

export async function findByRef(ref) {
  return (await getChain()).filter(b => b.ref === ref);
}

// Demo helper: silently edit a past block to show tamper detection.
export async function tamper() {
  const chain = await getChain();
  const target = chain.find(b => b.type === "ISSUE") || chain[chain.length - 1];
  if (target.data) target.data = { ...target.data, grade: "A", trustScore: 99.9, tampered: true };
  store.save(chain);
  return target.index;
}

export function reset() { store.save(null); }
