// Trust Passport = a W3C Verifiable Credential (Data Model 2.0 shape), signed by the
// issuing bank with ECDSA P-256. The Passport carries the score and grade, plus a
// Merkle root committing to all 20 control answers. Raw answers and evidence stay with
// the SME; it can later reveal chosen controls (selective disclosure) and any verifier
// can check them against the signed root.

import { ISSUER, ISSUER_PRIVATE_JWK, TRUSTED_ISSUERS, PASSPORT_VALID_MONTHS, RECHECK_DAYS } from "./config.js";
import { QUESTIONS } from "./rules.js";
import {
  canonicalize, importPrivate, importPublic, sign, verify, sha256Hex, sha256B64u,
  randomSalt, uuid, commit, merkleTree, merkleProof, merkleVerify, packJSON, unpackJSON,
} from "./crypto.js";
import * as ledger from "./ledger.js";

const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const isoDay = d => d.toISOString().slice(0, 10);
const isoSec = d => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// Compact form for QR codes: drops the fields every TrustPass credential shares and
// rebuilds them on verification, so the signed bytes are identical.
export function toCompact(vc) {
  return { v: 1, i: vc.id.replace("urn:uuid:", ""), f: vc.validFrom, u: vc.validUntil, s: vc.credentialSubject, c: vc.proof.created, p: vc.proof.proofValue };
}
export function fromCompact(o) {
  if (!o || o.v !== 1) return o; // already a full credential
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "AITrustPassport"],
    id: "urn:uuid:" + o.i,
    issuer: { id: ISSUER.id, name: ISSUER.name },
    validFrom: o.f, validUntil: o.u,
    credentialSubject: o.s,
    proof: { type: "DataIntegrityProof", cryptosuite: "ecdsa-jcs-2019", verificationMethod: ISSUER.keyId, proofPurpose: "assertionMethod", created: o.c, proofValue: o.p },
  };
}

// Build one salted leaf per control, in fixed question order.
export async function buildControlTree(answers, evidence) {
  const items = [];
  for (const q of QUESTIONS) {
    const salt = randomSalt();
    const answer = answers[q.id] || "no";
    const level = evidence[q.id]?.level || "self";
    const evidenceHash = evidence[q.id]?.hash || "";
    const leaf = await commit(salt, q.id, answer, level, evidenceHash);
    items.push({ qid: q.id, answer, level, evidenceHash, salt, leaf });
  }
  const tree = await merkleTree(items.map(i => i.leaf));
  return { items, tree };
}

export async function issuePassport({ company, result, answers, evidence, analyst, now = new Date() }) {
  now = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const { items, tree } = await buildControlTree(answers, evidence);
  const subjectId = "urn:trustpass:sme:" + (await sha256Hex(company + "|" + randomSalt())).slice(0, 16);
  const domains = Object.fromEntries(result.domains.map(d => [d.key, d.points]));

  const vc = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "AITrustPassport"],
    id: "urn:uuid:" + uuid(),
    issuer: { id: ISSUER.id, name: ISSUER.name },
    validFrom: isoSec(now),
    validUntil: isoSec(addMonths(now, PASSPORT_VALID_MONTHS)),
    credentialSubject: {
      id: subjectId,
      name: company,
      trustScore: result.total,
      grade: result.grade,
      domains,
      evidence: result.evidenceMix,
      controlsRoot: tree.root,
      controlCount: items.length,
      nextReview: isoDay(addDays(now, RECHECK_DAYS)),
      analystSignOff: true,
    },
  };

  const key = await importPrivate(ISSUER_PRIVATE_JWK);
  const proofValue = await sign(key, canonicalize(vc));
  vc.proof = {
    type: "DataIntegrityProof",
    cryptosuite: "ecdsa-jcs-2019",
    verificationMethod: ISSUER.keyId,
    proofPurpose: "assertionMethod",
    created: isoSec(now),
    proofValue,
  };

  const credentialHash = await sha256Hex(canonicalize(vc));
  const block = await ledger.append("ISSUE", vc.id, {
    credentialHash, grade: result.grade, trustScore: result.total,
    controlsRoot: tree.root, reviewer: analyst ? "analyst" : null,
  });
  const payload = await packJSON(toCompact(vc));

  return {
    id: vc.id, vc, credentialHash, payload, block: block.index,
    holder: { items, levels: tree.levels }, // kept privately by the SME (the "wallet")
    issuedAt: isoSec(now),
  };
}

export async function revokePassport(id, reason = "Control failed at quarterly re-check") {
  return ledger.append("REVOKE", id, { reason });
}

// Selective disclosure: reveal chosen controls with Merkle inclusion proofs.
export async function createDisclosures(record, qids) {
  const tree = { levels: record.holder.levels };
  const out = [];
  for (const qid of qids) {
    const idx = record.holder.items.findIndex(i => i.qid === qid);
    if (idx < 0) continue;
    const it = record.holder.items[idx];
    out.push({ q: qid, a: it.answer, l: it.level, e: it.evidenceHash, s: it.salt, p: merkleProof(tree, idx) });
  }
  return packJSON(out);
}

export async function verifyPayload(payload, disclosurePayload = null, { logToLedger = true, now = new Date() } = {}) {
  const steps = [];
  const t0 = performance.now();
  const step = (name, ok, detail, level = ok ? "ok" : "fail") => steps.push({ name, ok, detail, level, ms: Math.round(performance.now() - t0) });
  let vc;
  let disclosures = [];

  try { vc = fromCompact(await unpackJSON(payload)); step("Decode credential", true, "W3C Verifiable Credential (AITrustPassport)"); }
  catch { step("Decode credential", false, "Not a readable TrustPass credential"); return finish("invalid"); }

  const { proof, ...unsigned } = vc;
  const issuer = TRUSTED_ISSUERS[proof?.verificationMethod];
  if (!issuer) { step("Trusted issuer", false, "Signing key is not in the trusted issuer registry"); return finish("invalid"); }
  step("Trusted issuer", true, issuer.name);

  const pub = await importPublic(issuer.publicJwk);
  const sigOk = await verify(pub, canonicalize(unsigned), proof.proofValue);
  step("Issuer signature (ECDSA P-256)", sigOk, sigOk ? "Signature matches - contents unchanged since issue" : "Signature does not match - credential was altered or forged");
  if (!sigOk) return finish("invalid");

  const from = new Date(vc.validFrom), until = new Date(vc.validUntil);
  const inWindow = now >= from && now <= until;
  step("Validity period", inWindow, `Valid ${vc.validFrom.slice(0, 10)} to ${vc.validUntil.slice(0, 10)}`);
  if (!inWindow) return finish("expired");

  const credentialHash = await sha256Hex(canonicalize(vc));
  const events = await ledger.findByRef(vc.id);
  const issued = events.find(e => e.type === "ISSUE" && e.data.credentialHash === credentialHash);
  if (issued) step("Ledger anchor", true, `Hash found in block #${issued.index}`);
  else step("Ledger anchor", true, "Not on this device's ledger node (demo runs one node per browser)", "warn");

  const revoked = events.find(e => e.type === "REVOKE");
  if (revoked) { step("Revocation check", false, `Revoked in block #${revoked.index}: ${revoked.data.reason}`); return finish("revoked"); }
  step("Revocation check", true, issued ? "Not revoked" : "No revocation found on this node", issued ? "ok" : "warn");

  if (disclosurePayload) {
    try {
      const list = await unpackJSON(disclosurePayload);
      for (const d of list) {
        const leaf = await commit(d.s, d.q, d.a, d.l, d.e || "");
        const ok = await merkleVerify(leaf, d.p, vc.credentialSubject.controlsRoot);
        disclosures.push({ qid: d.q, answer: d.a, level: d.l, evidenceHash: d.e, ok });
      }
      const allOk = disclosures.every(d => d.ok);
      step("Disclosed controls (Merkle proofs)", allOk, `${disclosures.filter(d => d.ok).length} of ${disclosures.length} controls proven against the signed root`);
      if (!allOk) return finish("invalid");
    } catch { step("Disclosed controls (Merkle proofs)", false, "Disclosure data unreadable"); return finish("invalid"); }
  }

  return finish(steps.some(s => s.level === "warn") ? "valid-unanchored" : "valid");

  async function finish(status) {
    if (logToLedger && vc?.id && status !== "invalid") await ledger.append("VERIFY", vc.id, { result: status });
    return { status, valid: status.startsWith("valid"), steps, vc, disclosures, ms: Math.round(performance.now() - t0) };
  }
}

export async function hashEvidenceFile(bytes) { return sha256B64u(bytes); }
