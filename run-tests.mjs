// Run with:  node tests/run-tests.mjs
// Tests the scoring engine, retrieval agents, cryptography and Passport verification.

import { readFileSync } from "node:fs";
import { computeScore, gradeFor, topRisks, simulateFixes, actionPlan } from "./scoring.js";
import { documentAgent, ruleMappingAgent, suggestFromDocument, checkingAgent } from "./agents.js";
import { merkleTree, merkleProof, merkleVerify, packJSON, unpackJSON, canonicalize } from "./crypto.js";
import { issuePassport, verifyPayload, createDisclosures, revokePassport } from "./credential.js";
import { verifyChain, tamper, reset } from "./ledger.js";
import { NOVAPAY } from "./presets.js";
import { QUESTIONS, GUIDES } from "./rules.js";

let pass = 0, fail = 0;
const t = (name, cond, info = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, info); }
};
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;

console.log("Scoring engine");
const all = Object.fromEntries(QUESTIONS.map(q => [q.id, "yes"]));
const allCrypto = Object.fromEntries(QUESTIONS.map(q => [q.id, { level: "crypto" }]));
t("all Yes + proven = 100", computeScore(all, allCrypto).total === 100);
t("all Yes self-declared = 60", computeScore(all, {}).total === 60);
t("nothing answered = 0", computeScore({}, {}).total === 0);
t("grade bands", gradeFor(80).grade === "A" && gradeFor(79.9).grade === "B" && gradeFor(50).grade === "C" && gradeFor(49.9).grade === "D");
const na = { ...all, q13: "na", q15: "na" };
t("N/A agent questions do not lower the score", computeScore(na, allCrypto).total === 100);
const d1 = computeScore(NOVAPAY.day1, {});
console.log("    NovaPay day 1:", d1.total, d1.grade);
t("NovaPay day 1 is grade D", d1.grade === "D");
const ev6 = {};
NOVAPAY.month6Crypto.forEach(q => ev6[q] = { level: "crypto" });
NOVAPAY.month6Docs.forEach(q => ev6[q] = { level: "document" });
const m6 = computeScore(NOVAPAY.month6, ev6);
console.log("    NovaPay month 6:", m6.total, m6.grade);
t("NovaPay month 6 is grade A", m6.grade === "A");
const shapSum = m6.controls.reduce((s, c) => s + c.contribution, 0);
t("Shapley contributions add up to the score", near(shapSum, m6.total));
t("top risks are the biggest gaps", topRisks(d1, 3).length === 3);
t("fixing top risks raises the score", simulateFixes(NOVAPAY.day1, {}, topRisks(d1).map(r => r.qid)).total > d1.total);

t("action plan lists every gap", actionPlan(d1).length === d1.controls.filter(c => !c.na && c.gap > 0.01).length);
t("every question has step-by-step guidance", QUESTIONS.every(q => GUIDES[q.id]?.steps?.length >= 2 && GUIDES[q.id].proofFile));

console.log("Agents");
const policy = readFileSync(new URL("./novapay-ai-policy.txt", import.meta.url), "utf8");
const doc = documentAgent(policy);
console.log("    findings:", doc.findings.map(f => f.qid).join(", "));
t("document agent finds evidence for Q1, Q3, Q5, Q7", ["q1", "q3", "q5", "q7"].every(q => doc.findings.some(f => f.qid === q)));
t("document agent does not invent evidence for Q8 (bias)", !doc.findings.some(f => f.qid === "q8"));
const run = suggestFromDocument(policy, {}, {});
const q12 = run.gaps.find(g => g.qid === "q12");
t("checking agent turns 'not yet run a red-team' into a gap", q12 && q12.action === "set-no", JSON.stringify(q12));
const q5 = run.found.find(f => f.qid === "q5");
t("prohibition clause for Q5 counts as evidence", q5 && q5.action === "set-yes");
t("unanswered questions get suggested 'Yes'", run.found.length >= 10 && run.found.every(f => f.action === "set-yes"));
const run2 = suggestFromDocument(policy, { q1: "yes", q12: "yes" }, { q1: { level: "crypto" } });
t("already-proven answer needs no change", run2.found.find(f => f.qid === "q1").action === "none");
t("a 'Yes' contradicted by the document is flagged", run2.gaps.find(g => g.qid === "q12").action === "set-no");
t("questions not in the document are listed", run.notMentioned.includes("q8"));
for (const q of QUESTIONS) {
  const r = ruleMappingAgent(q.id);
  if (r.length < 1) t("rule mapping for " + q.id, false);
}
t("rule mapping returns clauses for all 20 controls", QUESTIONS.every(q => ruleMappingAgent(q.id).length >= 1));
console.log("    sample mappings:", ["q1", "q5", "q13", "q17"].map(q => q + "→" + ruleMappingAgent(q).map(c => c.id).join("+")).join("  "));
t("contradiction detected", checkingAgent({ q13: "yes", q15: "no" }, {}).some(f => f.type === "contradiction"));

console.log("Cryptography");
const leaves = ["a", "b", "c", "d", "e"];
const tree = await merkleTree(leaves);
t("Merkle proofs verify for every leaf", (await Promise.all(leaves.map((l, i) => merkleVerify(l, merkleProof(tree, i), tree.root)))).every(Boolean));
t("Merkle proof fails for wrong leaf", !(await merkleVerify("x", merkleProof(tree, 0), tree.root)));
t("pack/unpack round trip", canonicalize(await unpackJSON(await packJSON({ a: 1, b: [2, 3] }))) === '{"a":1,"b":[2,3]}');

console.log("Passport issue and verify");
reset();
const rec = await issuePassport({ company: "NovaPay Ltd", result: m6, answers: NOVAPAY.month6, evidence: ev6, analyst: "Analyst" });
console.log("    QR payload length:", rec.payload.length, "chars");
let v = await verifyPayload(rec.payload);
t("fresh Passport verifies", v.status === "valid", v.status);
const vc2 = structuredClone(rec.vc); vc2.credentialSubject.trustScore = 99;
v = await verifyPayload(await packJSON(vc2));
t("full (non-compact) credential also verifies", (await verifyPayload(await packJSON(rec.vc), null, { logToLedger: false })).status === "valid");
t("edited score is rejected (signature)", v.status === "invalid");
const disc = await createDisclosures(rec, ["q5", "q8"]);
v = await verifyPayload(rec.payload, disc);
t("selective disclosure verifies", v.status === "valid" && v.disclosures.length === 2 && v.disclosures.every(d => d.ok));
const badDisc = await unpackJSON(disc); badDisc[0].a = "no";
v = await verifyPayload(rec.payload, await packJSON(badDisc));
t("altered disclosure is rejected", v.status === "invalid");
v = await verifyPayload(rec.payload, null, { now: new Date(Date.now() + 3 * 365 * 86400000) });
t("expired Passport is rejected", v.status === "expired");
await revokePassport(rec.id);
v = await verifyPayload(rec.payload);
t("revoked Passport is rejected", v.status === "revoked");
t("ledger chain intact", (await verifyChain()).ok);
await tamper();
t("tampering is detected", !(await verifyChain()).ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
