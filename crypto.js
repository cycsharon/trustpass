// Cryptographic primitives, all using the browser's built-in Web Crypto API.
//   - SHA-256 hashing
//   - ECDSA P-256 signatures (issuer signs the Passport)
//   - Salted hash commitments + Merkle tree (selective disclosure of controls)
//   - JSON canonicalisation (stable bytes to sign)
//   - Deflate compression for compact QR payloads

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export function b64uEncode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(data) {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return new Uint8Array(await subtle.digest("SHA-256", bytes));
}
export async function sha256Hex(data) {
  return [...await sha256(data)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256B64u(data) { return b64uEncode(await sha256(data)); }

export function randomSalt(n = 16) {
  return b64uEncode(globalThis.crypto.getRandomValues(new Uint8Array(n)));
}
export function uuid() { return globalThis.crypto.randomUUID(); }

// JSON canonicalisation (sorted keys, no whitespace) - simplified RFC 8785 (JCS).
export function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
}

// ---- ECDSA P-256 ----
const ALG = { name: "ECDSA", namedCurve: "P-256" };
const SIG = { name: "ECDSA", hash: "SHA-256" };

export async function importPrivate(jwk) {
  return subtle.importKey("jwk", jwk, ALG, false, ["sign"]);
}
export async function importPublic(jwk) {
  const { kty, crv, x, y } = jwk;
  return subtle.importKey("jwk", { kty, crv, x, y }, ALG, false, ["verify"]);
}
export async function sign(privateKey, message) {
  return b64uEncode(new Uint8Array(await subtle.sign(SIG, privateKey, enc.encode(message))));
}
export async function verify(publicKey, message, sigB64u) {
  try {
    return await subtle.verify(SIG, publicKey, b64uDecode(sigB64u), enc.encode(message));
  } catch { return false; }
}

// ---- Salted commitments & Merkle tree ----
// A commitment hides a value: H(salt | field | value). Without the salt nobody can
// guess the value; with it, anyone can check it matches the signed root.
export async function commit(salt, ...fields) {
  return sha256B64u([salt, ...fields].join("|"));
}

async function hashPair(a, b) { return sha256B64u("node|" + a + "|" + b); }

export async function merkleTree(leaves) {
  if (!leaves.length) throw new Error("no leaves");
  const levels = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(await hashPair(cur[i], cur[i + 1] ?? cur[i]));
    }
    levels.push(next);
  }
  return { root: levels[levels.length - 1][0], levels };
}

export function merkleProof(tree, index) {
  const path = [];
  for (let l = 0; l < tree.levels.length - 1; l++) {
    const level = tree.levels[l];
    const isRight = index % 2 === 1;
    const sib = isRight ? level[index - 1] : (level[index + 1] ?? level[index]);
    path.push([isRight ? "L" : "R", sib]);
    index = Math.floor(index / 2);
  }
  return path;
}

export async function merkleVerify(leaf, path, root) {
  let h = leaf;
  for (const [side, sib] of path) h = side === "L" ? await hashPair(sib, h) : await hashPair(h, sib);
  return h === root;
}

// ---- Compression for QR codes / links ----
async function streamBytes(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function packJSON(obj) {
  const raw = enc.encode(JSON.stringify(obj));
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + b64uEncode(await streamBytes(raw, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
  }
  return "j" + b64uEncode(raw);
}
export async function unpackJSON(str) {
  const kind = str[0], body = b64uDecode(str.slice(1));
  if (kind === "z") return JSON.parse(dec.decode(await streamBytes(body, new DecompressionStream("deflate-raw"))));
  if (kind === "j") return JSON.parse(dec.decode(body));
  throw new Error("Unknown payload format");
}
