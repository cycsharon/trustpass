// TrustPass - single-page app (no framework, no build step).

import { DOMAINS, EVIDENCE, ISSUER, GRADES } from "./config.js";
import { QUESTIONS, questionById } from "./rules.js";
import { computeScore, topRisks, simulateFixes, creditTerms, gradeFor } from "./scoring.js";
import { runDocumentPipeline, ruleMappingAgent, checkingAgent } from "./agents.js";
import { issuePassport, revokePassport, createDisclosures, verifyPayload, hashEvidenceFile } from "./credential.js";
import { commit, randomSalt } from "./crypto.js";
import * as ledger from "./ledger.js";
import { gauge, radar, waterfall, bars, gradeColor } from "./charts.js";
import { NOVAPAY } from "./presets.js";
import { qrSvg as makeQr } from "./vendor/qrcode.js";
import { CLAUSES } from "./rules.js";

// ---------------- state ----------------
const KEY = "trustpass.state.v1";
const fresh = () => ({ company: "", profile: "", answers: {}, evidence: {}, baseline: null, passports: [], docRun: null, policyText: "" });
let S = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full or blocked */ } };

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hkd = n => "HK$" + Math.round(n).toLocaleString("en-HK");
const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const pill = level => `<span class="pill ${level}">${EVIDENCE[level].label}</span>`;
const short = (s, n = 10) => s ? s.slice(0, n) + "…" : "";
const domainOf = key => DOMAINS.find(d => d.key === key);
const result = () => computeScore(S.answers, S.evidence);

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400);
}
function qrSvg(text) {
  try { return makeQr(text); } catch { return null; }
}
const baseUrl = () => location.origin + location.pathname;
const verifyLink = (payload, disc) => `${baseUrl()}#/verify?c=${payload}${disc ? "&d=" + disc : ""}`;

function setBaselineIfNone() {
  const r = result();
  if (!S.baseline && r.answered >= 10) { S.baseline = { label: "First scan", values: r.domains.map(d => d.pct), total: r.total }; save(); }
}

// ---------------- router ----------------
const routes = { "": home, scan, evidence, results, review, passport, verify: verifyView, bank, credit, ledger: ledgerView, tech };

async function render() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query || "");
  const view = routes[path] || home;
  document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active", a.dataset.route === path || (path === "verify" && a.dataset.route === "bank")));
  app.innerHTML = await view(params);
  after[path]?.(params);
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
const go = r => { location.hash = "#/" + r; };
const after = {};

// ---------------- HOME ----------------
function home() {
  return `
  <section class="hero">
    <div>
      <div class="eyebrow">AI Trust Passport · FinTech</div>
      <h1>Prove your AI is safe.<br>Borrow for less.</h1>
      <p class="lead">Hong Kong's tech start-ups run on AI, but they can't prove it is well run without handing customer data to the bank.
      TrustPass scans your AI governance against Hong Kong rules, lets you <b>prove controls without sharing the data behind them</b>,
      and issues a signed <b>AI Trust Passport</b> any bank can verify in seconds. A better grade means a cheaper loan.</p>
      <div class="row" style="margin-top:18px">
        <input type="text" id="company" placeholder="Your company name" value="${esc(S.company)}" style="max-width:260px">
        <button class="btn primary" data-act="start">Start free Trust Scan →</button>
      </div>
      <div class="row" style="margin-top:12px">
        <span class="muted">Demo company:</span>
        <button class="btn small" data-act="preset" data-p="day1">NovaPay · Day 1</button>
        <button class="btn small" data-act="preset" data-p="month6">NovaPay · Month 6</button>
      </div>
    </div>
    <div>${samplePassportHtml()}</div>
  </section>

  <section class="grid g4" style="margin-bottom:30px">
    <div class="stat" style="background:var(--navy)"><b>73.1%</b><span>of surveyed HK FinTechs already use AI</span></div>
    <div class="stat" style="background:var(--red)"><b>×2</b><span>cyber incidents handled by HKCERT, 2023 → 2025 (15,877)</span></div>
    <div class="stat" style="background:var(--teal)"><b>140</b><span>questions in a typical bank AI questionnaire, answered again for every bank</span></div>
    <div class="stat" style="background:var(--violet)"><b>0</b><span>products today that turn good AI governance into a cheaper loan</span></div>
  </section>

  <section class="card" style="margin-bottom:22px">
    <h2>How it works</h2>
    <div class="flow">
      ${[["Scan", "20 questions mapped to HKMA, SFC and PCPD rules", "var(--teal)", "scan"],
         ["Fix", "Top-3 risks and a fix plan, ranked by points gained", "#5cb8c2", "results"],
         ["Prove", "AI reads your policies; files are hashed, never uploaded", "var(--violet)", "evidence"],
         ["Passport", "Analyst signs off; bank-signed credential with QR", "var(--navy)", "passport"],
         ["Borrow", "Grade A pays 25 bp less on its loan", "var(--red)", "credit"]]
        .map(([t, d, c, r], i) => `<a class="stepbox card flat" href="#/${r}" style="text-decoration:none;color:inherit"><span class="num" style="background:${c}">${i + 1}</span><h3>${t}</h3><small>${d}</small></a>`).join("")}
    </div>
  </section>

  <section class="grid g2">
    <div class="card"><div class="eyebrow">For start-ups</div><h3>Answer once, show every bank</h3>
      <p class="muted">Stop filling in a new AI questionnaire for each bank, investor and platform. Share one Passport, revealing only the controls you choose.</p></div>
    <div class="card"><div class="eyebrow">For banks</div><h3>See AI risk before it becomes credit risk</h3>
      <p class="muted">Verify a Passport in under two seconds: signature, validity, ledger anchor, revocation. Price the loan with one more verified input.</p></div>
  </section>`;
}

function samplePassportHtml() {
  return `<div class="passport mini-passport" aria-hidden="true">
    <div class="band">AI Trust Passport · ${esc(ISSUER.name)}</div>
    <div class="body"><div><div class="company">NovaPay Ltd</div><small class="muted">AI fraud checks · 25 staff · Kowloon Bay</small>
      <div class="row" style="margin-top:10px"><span class="score" style="color:var(--red)">82</span><div><b>Grade A</b><br><small class="muted">valid to 06/2028</small></div></div></div>
      <div class="stamp" style="color:var(--red)">Verified<small>2026</small></div></div></div>`;
}

// ---------------- SCAN ----------------
function scan() {
  const r = result();
  return `
  <div class="page-head"><div class="eyebrow">Step 1 · Trust Scan</div><h1>Your free 15-minute AI Trust Scan</h1>
  <p class="lead">Twenty questions across six domains. Each one maps to a Hong Kong rule or international standard. Answers start as <i>self-declared</i>; you can back them with evidence in step 2.</p></div>
  <div class="split">
    <div>${DOMAINS.map(d => `
      <div class="domain-block">
        <div class="domain-title"><span class="swatch" style="background:${d.color}"></span><h3 style="margin:0">${d.name}</h3><span class="muted">· ${d.weight}% of score</span></div>
        ${QUESTIONS.filter(q => q.domain === d.key).map(q => questionRow(q)).join("")}
      </div>`).join("")}
    </div>
    <aside class="card sticky" id="scan-side">${scanSide(r)}</aside>
  </div>`;
}
function questionRow(q) {
  const a = S.answers[q.id];
  const opts = [["yes", "Yes"], ["partly", "Partly"], ["no", "No"]];
  if (q.agent) opts.push(["na", "No agents"]);
  return `<div class="q" id="row-${q.id}">
    <div class="qn">${q.id.toUpperCase()}</div>
    <div><div class="qt">${esc(q.text)}</div><div class="qe">Full credit: ${esc(q.evidence)}</div></div>
    <div class="seg" role="group" aria-label="Answer ${q.id}">${opts.map(([v, l]) => `<button data-act="answer" data-q="${q.id}" data-v="${v}" class="${a === v ? "on" : ""}" aria-pressed="${a === v}">${l}</button>`).join("")}</div>
  </div>`;
}
function scanSide(r) {
  return `
    <label class="field">Company<input type="text" id="company" value="${esc(S.company)}" placeholder="Company name"></label>
    <div style="margin-top:12px">${gauge(r.total, r.grade)}</div>
    <div class="row" style="justify-content:center"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span>
      <div><b>${r.gradeInfo.meaning}</b><br><small class="muted">${r.answered} of 20 answered</small></div></div>
    <p class="cite" style="margin-top:10px">Score = Σ weight × raw score × evidence factor. Self-declared answers count at 0.60.</p>
    <div class="stack"><button class="btn primary" style="width:100%;justify-content:center" data-act="go" data-r="evidence">Next: prove it →</button>
    <button class="btn" style="width:100%;justify-content:center" data-act="go" data-r="results">See full score</button></div>`;
}

// ---------------- EVIDENCE ----------------
function evidence() {
  const r = result();
  const run = S.docRun;
  const provable = QUESTIONS.filter(q => ["yes", "partly"].includes(S.answers[q.id]));
  return `
  <div class="page-head"><div class="eyebrow">Step 2 · Prove it</div><h1>Back your answers with evidence</h1>
  <p class="lead">Evidence raises your score: documents count at 0.85, cryptographic proofs at 1.00. Everything is processed <b>in your browser</b>. Your files never leave this device.</p></div>

  <div class="card" style="margin-bottom:18px">
    <div class="spread"><div><h2 style="margin:0">Trust Score now: <span style="color:${gradeColor(r.grade)}">${r.total.toFixed(1)} · ${r.grade}</span></h2>
      <small class="muted">${r.evidenceMix.self} self-declared · ${r.evidenceMix.document} document-backed · ${r.evidenceMix.crypto} proven</small></div>
      <button class="btn primary" data-act="go" data-r="results">See score breakdown →</button></div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="eyebrow">A · AI engine</div><h2>Upload a policy. The AI engine reads it for you.</h2>
    <p class="muted">The Document Agent finds evidence sentences, the Rule-mapping Agent cites the matching HK rule, and the Checking Agent rejects weak or negative evidence ("we have not yet…").</p>
    <div class="pipeline" id="pipeline" style="margin:14px 0">
      ${["Upload|policy text", "Read|split into claims", "Retrieve|BM25 over 20 controls", "Map & cite|HK rule clauses", "AI checks AI|negation & strength", "Human sign-off|step 4"]
        .map((s, i) => { const [a, b] = s.split("|"); return `<div class="pipe ${run && i < 5 ? "done" : ""}" data-i="${i}"><b>${a}</b>${b}</div>`; }).join("")}
    </div>
    <div class="grid g2">
      <div>
        <div class="dropzone" id="drop"><b>Drop a .txt or .md policy here</b><br><small class="muted">or</small><br>
          <input type="file" id="policy-file" accept=".txt,.md,text/plain" style="margin-top:6px"></div>
        <div class="row" style="margin-top:10px"><button class="btn" data-act="sample-policy">Load NovaPay sample policy</button></div>
      </div>
      <div><textarea id="policy-text" placeholder="…or paste your AI policy, model card or procedures here">${esc(S.policyText)}</textarea>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="run-engine">Run AI engine</button><span class="muted" id="engine-status"></span></div></div>
    </div>
    <div id="engine-results">${run ? engineResults(run) : ""}</div>
  </div>

  <div class="card">
    <div class="eyebrow">B · Evidence Vault</div><h2>Prove controls without sharing the data</h2>
    <p class="muted">Attach a file and the browser computes its SHA-256 fingerprint. Only that hash, sealed with a random salt, goes into your Passport.
      For threshold controls (e.g. fairness ratio ≥ 0.8) you commit to the value and the Passport records only <i>pass</i>.</p>
    <div class="callout violet" style="margin:10px 0">The bank learns <b>that</b> the evidence exists and has not changed, never <b>what</b> is in it. Production uses zero-knowledge proofs in a secure enclave; this prototype uses salted hash commitments in a Merkle tree, the same commit-then-reveal idea.</div>
    <div class="row" style="margin-bottom:10px"><button class="btn small" data-act="demo-proofs">Demo: prove 3 key controls with sample files</button></div>
    ${provable.length ? `<table><thead><tr><th>Control</th><th>Evidence status</th><th>Prove it</th></tr></thead><tbody>
      ${provable.map(q => vaultRow(q)).join("")}</tbody></table>` : `<p class="muted">Answer "Yes" or "Partly" to some questions first.</p>`}
  </div>`;
}
function vaultRow(q) {
  const e = S.evidence[q.id] || {};
  const level = e.level || "self";
  let action;
  if (level === "crypto") action = `<span class="mono" title="${esc(e.hash)}">#${esc(short(e.hash, 12))}</span>`;
  else if (q.proof === "threshold") action = `<div class="row"><input type="number" step="0.01" id="th-${q.id}" placeholder="${esc(q.threshold.label)}" style="width:150px">
      <button class="btn small" data-act="prove-threshold" data-q="${q.id}">Prove ${q.threshold.op} ${q.threshold.value}</button></div>`;
  else action = `<label class="btn small">Attach evidence file<input type="file" hidden data-act-change="prove-file" data-q="${q.id}"></label>`;
  return `<tr><td><b>${q.id.toUpperCase()}</b> ${esc(q.text)}<br><small class="muted">${esc(q.evidence)}</small>
    ${e.citation ? `<div class="quote">"${esc(e.citation)}"</div>` : ""}${e.claim ? `<div class="cite">${esc(e.claim)}</div>` : ""}</td>
    <td>${pill(level)}</td><td>${action}</td></tr>`;
}
function engineResults(run) {
  const accepted = run.findings.filter(f => f.check.ok).length;
  return `<div style="margin-top:16px">
    <div class="row" style="margin-bottom:8px"><span class="pill ok">${accepted} accepted</span><span class="pill fail">${run.findings.length - accepted} rejected by Checking Agent</span>
      <span class="muted">${run.sentences} sentences read · read ${run.timings.read} ms · retrieve ${run.timings.retrieve} ms · check ${run.timings.check} ms</span></div>
    <table><thead><tr><th>Control</th><th>Evidence found</th><th>Rule cited</th><th>Result</th></tr></thead><tbody>
    ${run.findings.map(f => `<tr><td><b>${f.qid.toUpperCase()}</b><br><small class="muted">${esc(questionById[f.qid].text)}</small></td>
      <td><div class="quote">"${esc(f.sentence)}"</div><span class="cite">matched terms: ${f.matched.map(esc).join(", ")} · confidence ${Math.round(f.confidence * 100)}%</span></td>
      <td>${f.rules.map(c => `<div class="cite"><b>${esc(c.source.short)}</b>: ${esc(c.title)}</div>`).join("")}</td>
      <td>${f.check.ok ? `<span class="pill ok">Accepted</span>` : `<span class="pill fail">Rejected</span><div class="cite">${esc(f.check.reason)}</div>`}</td></tr>`).join("")}
    </tbody></table>
    ${run.suggestions.length ? `<div class="callout warn" style="margin-top:10px">${run.suggestions.map(s => `<div><b>${s.qid.toUpperCase()}</b>: ${esc(s.msg)}</div>`).join("")}</div>` : ""}
  </div>`;
}
after.evidence = () => {
  const drop = document.getElementById("drop");
  const loadFile = f => f && f.text().then(t => { document.getElementById("policy-text").value = t; S.policyText = t; save(); toast(`Loaded ${f.name}`); });
  document.getElementById("policy-file").addEventListener("change", e => loadFile(e.target.files[0]));
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => loadFile(e.dataTransfer.files[0]));
};

async function runEngine() {
  const text = document.getElementById("policy-text").value.trim();
  if (text.length < 40) return toast("Paste or load a policy first");
  S.policyText = text;
  const before = result().total;
  const run = runDocumentPipeline(text, S.answers, S.evidence);
  const pipes = [...document.querySelectorAll("#pipeline .pipe")];
  pipes.forEach(p => p.classList.remove("done", "run"));
  for (let i = 0; i < 5; i++) {
    pipes[i].classList.add("run");
    document.getElementById("engine-status").textContent = pipes[i].querySelector("b").textContent + "…";
    await new Promise(r => setTimeout(r, 380));
    pipes[i].classList.remove("run"); pipes[i].classList.add("done");
  }
  for (const [qid, u] of Object.entries(run.updates)) S.evidence[qid] = u;
  S.docRun = run; save();
  await render();
  toast(`Score ${before.toFixed(1)} → ${result().total.toFixed(1)}`);
}

async function proveFile(qid, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await hashEvidenceFile(bytes);
  const before = result().total;
  S.evidence[qid] = { level: "crypto", hash, claim: `File fingerprint (SHA-256) sealed · ${file.size.toLocaleString()} bytes · file kept on your device`, at: new Date().toISOString() };
  save(); await render();
  toast(`${qid.toUpperCase()} proven · score ${before.toFixed(1)} → ${result().total.toFixed(1)}`);
}
async function proveThreshold(qid, value) {
  const q = questionById[qid];
  if (!Number.isFinite(value)) return toast("Enter the measured value");
  if (!(value >= q.threshold.value)) return toast(`${value} does not meet ${q.threshold.op} ${q.threshold.value}. Not proven.`);
  const salt = randomSalt();
  const hash = await commit(salt, qid, String(value));
  const before = result().total;
  S.evidence[qid] = { level: "crypto", hash, claim: `Commitment to measured value; Passport shows only "${q.threshold.label} ${q.threshold.op} ${q.threshold.value}: PASS"`, at: new Date().toISOString() };
  save(); await render();
  toast(`${qid.toUpperCase()} proven · score ${before.toFixed(1)} → ${result().total.toFixed(1)}`);
}
async function demoProofs() {
  for (const qid of ["q1", "q5", "q7"]) {
    if (!["yes", "partly"].includes(S.answers[qid])) continue;
    const text = `Sample evidence for ${qid}: ${questionById[qid].evidence}. Generated ${new Date().toISOString()}`;
    const hash = await hashEvidenceFile(new TextEncoder().encode(text));
    S.evidence[qid] = { level: "crypto", hash, claim: `Sample file "${questionById[qid].evidence}" fingerprinted (SHA-256)`, at: new Date().toISOString() };
  }
  if (S.answers.q8 === "no" || !S.answers.q8) S.answers.q8 = "yes";
  const salt = randomSalt();
  S.evidence.q8 = { level: "crypto", hash: await commit(salt, "q8", "0.86"), claim: `Commitment to fairness ratio; Passport shows only "≥ 0.8: PASS"` };
  save(); await render(); toast("Sample proofs added for Q1, Q5, Q7 and Q8");
}

// ---------------- RESULTS ----------------
function results() {
  const r = result();
  if (!r.answered) return emptyState("No scan yet", "Answer the Trust Scan questions to see your score.", "scan", "Start the scan");
  setBaselineIfNone();
  const risks = topRisks(r, 3);
  const sim = simulateFixes(S.answers, S.evidence, risks.map(x => x.qid), "document");
  const now = creditTerms(r.grade), then = creditTerms(sim.grade);
  const flags = checkingAgent(S.answers, S.evidence);
  const labels = r.domains.map(d => d.short);
  const series = [];
  if (S.baseline) series.push({ name: `${S.baseline.label} (${S.baseline.total.toFixed(0)})`, color: "#d1293d", values: S.baseline.values });
  series.push({ name: `Now (${r.total.toFixed(0)})`, color: "#0f9aa8", values: r.domains.map(d => d.pct) });
  const ranked = r.controls.filter(c => !c.na).sort((a, b) => b.contribution - a.contribution);

  return `
  <div class="page-head spread"><div><div class="eyebrow">Step 3 · AI Trust Score</div><h1>${esc(S.company || "Your company")}: ${r.total.toFixed(1)} / 100</h1></div>
    <button class="btn primary" data-act="go" data-r="review">Send for analyst sign-off →</button></div>

  <div class="grid g3" style="margin-bottom:18px">
    <div class="card" style="text-align:center">${gauge(r.total, r.grade)}
      <div class="row" style="justify-content:center"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span><div style="text-align:left"><b>${r.gradeInfo.meaning}</b><br>
      <small class="muted">${r.gradeInfo.marginBp == null ? "Fix plan first" : r.gradeInfo.marginBp === 0 ? "Standard loan pricing" : `${r.gradeInfo.marginBp} bp off the loan margin`}</small></div></div>
      <div class="row" style="justify-content:center;margin-top:12px">${pill("self")} ${r.evidenceMix.self} ${pill("document")} ${r.evidenceMix.document} ${pill("crypto")} ${r.evidenceMix.crypto}</div></div>
    <div class="card"><h3>By domain</h3>${radar(series, labels)}</div>
    <div class="card"><h3>Evidence matters</h3>
      <div class="compact">${bars(r.domains.map(d => ({ label: d.short, value: d.points, max: d.weight, color: d.color, note: `${d.points.toFixed(1)} / ${d.weight}` })))}</div>
      <p class="cite" style="margin-top:10px">Points = weight × raw score × evidence factor (0.60 self · 0.85 documents · 1.00 proven).</p></div>
  </div>

  <div class="card" style="margin-bottom:18px"><h3>How your score adds up</h3>${waterfall(r.domains, r.total)}</div>

  <div class="grid g2" style="margin-bottom:18px">
    <div class="card"><div class="eyebrow">Top 3 risks</div><h2>Your fix plan</h2><div class="stack">
      ${risks.map((c, i) => { const q = questionById[c.qid]; const rules = ruleMappingAgent(c.qid);
        return `<div class="risk"><div class="spread"><b>${i + 1}. ${esc(q.text)}</b><span class="gain">+${c.gap.toFixed(1)} pts</span></div>
        <div class="row" style="margin:4px 0"><span class="pill ${c.answer === "yes" ? "ok" : c.answer === "partly" ? "warn" : "fail"}">${c.answer ? c.answer.toUpperCase() : "UNANSWERED"}</span>${pill(c.level)}</div>
        <p style="margin:6px 0">${esc(q.fix)}</p>
        ${rules.map(cl => `<div class="cite"><b>${esc(cl.source.short)}</b>: ${esc(cl.title)}. ${esc(cl.text)}</div>`).join("")}</div>`; }).join("")}
    </div></div>
    <div class="card"><div class="eyebrow">What-if</div><h2>Fix these 3 and document them</h2>
      <div class="grid g2" style="margin:12px 0">
        <div><div class="kpi" style="color:${gradeColor(r.grade)}">${r.total.toFixed(1)} · ${r.grade}</div><div class="kpi-label">today</div></div>
        <div><div class="kpi" style="color:${gradeColor(sim.grade)}">${sim.total.toFixed(1)} · ${sim.grade}</div><div class="kpi-label">after the fix plan</div></div>
      </div>
      <table><tbody>
        <tr><td>Loan margin on a HK$3M facility</td><td class="num">${now.eligible ? now.marginBp + " bp" : "fix first"}</td><td class="num"><b>${then.eligible ? then.marginBp + " bp" : "fix first"}</b></td></tr>
        <tr><td>Interest saved per year</td><td class="num">${hkd(now.smeSaving)}</td><td class="num"><b>${hkd(then.smeSaving)}</b></td></tr>
      </tbody></table>
      <p class="cite" style="margin-top:8px">Proven evidence (step 2) adds more: each proof counts at 1.00 instead of 0.85.</p>
      <h3 style="margin-top:18px">Checking Agent flags</h3>
      ${flags.length ? flags.map(f => `<div class="callout ${f.type === "contradiction" || f.type === "rejected-evidence" ? "bad" : "warn"}" style="margin-bottom:8px">${esc(f.msg)}</div>`).join("") : `<div class="callout">No contradictions found.</div>`}
    </div>
  </div>

  <div class="card"><div class="eyebrow">Explainability</div><h2>Reason codes: what moved your score</h2>
    <p class="muted">The score is additive, so each control's contribution is exactly its Shapley (SHAP) value against an all-"No" baseline. Grey = points still available.</p>
    <div class="hbars">${ranked.map(c => { const q = questionById[c.qid]; const d = domainOf(c.domain);
      return `<div class="hbar"><div class="hbar-label" title="${esc(q.text)}">${c.qid.toUpperCase()} · ${esc(q.text)}</div>
      <div class="hbar-track" style="background:#eef0f4"><div class="hbar-fill" style="width:${(c.contribution / c.max) * 100}%;background:${d.color}"></div></div>
      <div class="hbar-val">+${c.contribution.toFixed(2)} / ${c.max.toFixed(2)}</div></div>`; }).join("")}</div>
  </div>`;
}

function emptyState(title, text, route, btn) {
  return `<div class="card empty"><h2>${title}</h2><p class="muted">${text}</p><a class="btn primary" href="#/${route}">${btn}</a></div>`;
}

// ---------------- REVIEW (human sign-off) ----------------
function review() {
  const r = result();
  if (!r.answered) return emptyState("Nothing to review", "Complete a Trust Scan first.", "scan", "Start the scan");
  const flags = checkingAgent(S.answers, S.evidence);
  return `
  <div class="page-head"><div class="eyebrow">Step 4 · People decide</div><h1>Analyst sign-off</h1>
  <p class="lead">AI drafts and scores, but no Passport is issued until a person approves it. The analyst sees the evidence trail and every flag raised by the Checking Agent.</p></div>
  <div class="split">
    <div class="card"><h3>Evidence trail</h3>
      <table><thead><tr><th>#</th><th>Control</th><th>Answer</th><th>Evidence</th><th class="num">Points</th></tr></thead><tbody>
      ${r.controls.map(c => { const q = questionById[c.qid];
        return `<tr><td><b>${c.qid.toUpperCase()}</b></td><td>${esc(q.text)}</td><td>${c.na ? "N/A" : (c.answer || "—")}</td><td>${c.na ? "" : pill(c.level)}</td><td class="num">${c.na ? "" : c.contribution.toFixed(2)}</td></tr>`; }).join("")}
      </tbody></table></div>
    <aside class="card sticky">
      <div class="row"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span><div><b>${r.total.toFixed(1)} / 100</b><br><small class="muted">${esc(S.company || "Company")}</small></div></div>
      <h3 style="margin-top:16px">Flags (${flags.length})</h3>
      ${flags.map(f => `<div class="callout ${f.type === "contradiction" ? "bad" : "warn"}" style="margin-bottom:6px;font-size:.84rem">${esc(f.msg)}</div>`).join("") || `<p class="muted">None</p>`}
      <div class="check-list" style="margin-top:12px">
        <label><input type="checkbox" class="chk"> I reviewed every flag above</label>
        <label><input type="checkbox" class="chk"> Evidence citations match the source documents</label>
        <label><input type="checkbox" class="chk"> The company consents to issuing a Passport</label>
      </div>
      <label class="field" style="margin-top:8px">Analyst name<input type="text" id="analyst" placeholder="e.g. Analyst A. Chan"></label>
      ${r.grade === "D" ? `<div class="callout bad" style="margin-top:10px;font-size:.85rem">Grade D: the Passport will show "fix plan first" and no credit discount.</div>` : ""}
      <button class="btn dark" style="width:100%;justify-content:center;margin-top:12px" id="approve" data-act="approve" disabled>Approve & issue Passport</button>
    </aside>
  </div>`;
}
after.review = () => {
  const update = () => {
    const ok = [...document.querySelectorAll(".chk")].every(c => c.checked) && document.getElementById("analyst").value.trim().length > 1;
    document.getElementById("approve").disabled = !ok;
  };
  app.querySelectorAll(".chk").forEach(c => c.addEventListener("change", update));
  document.getElementById("analyst").addEventListener("input", update);
};
async function approve() {
  const r = result();
  const analyst = document.getElementById("analyst").value.trim();
  const rec = await issuePassport({ company: S.company || "Unnamed company", result: r, answers: S.answers, evidence: S.evidence, analyst });
  rec.company = S.company || "Unnamed company"; rec.profile = S.profile; rec.analyst = analyst;
  rec.proofs = r.evidenceMix.crypto; rec.firstScan = S.baseline?.total ?? r.total;
  S.passports.unshift(rec); save();
  toast("Passport issued and anchored on the ledger");
  go("passport");
}

// ---------------- PASSPORT ----------------
async function passport() {
  const rec = S.passports[0];
  if (!rec) return emptyState("No Passport yet", "Complete the scan and analyst sign-off to receive your AI Trust Passport.", "review", "Go to sign-off");
  const revoked = (await ledger.findByRef(rec.id)).find(b => b.type === "REVOKE");
  const sub = rec.vc.credentialSubject;
  const link = verifyLink(rec.payload);
  const qr = qrSvg(link);
  return `
  <div class="page-head spread"><div><div class="eyebrow">Step 5 · Your AI Trust Passport</div><h1>${esc(rec.company)}</h1></div>
    <div class="row"><a class="btn primary" href="${esc(link)}">Open bank verification →</a>
      <button class="btn" data-act="copy" data-text="${esc(link)}">Copy link</button>
      <button class="btn" data-act="download-vc">Download credential</button></div></div>

  <div class="grid g2" style="margin-bottom:18px;align-items:start">
    <div class="passport">
      <div class="band">AI Trust Passport · ${esc(rec.vc.issuer.name)}</div>
      <div class="body">
        <div><div class="company">${esc(rec.company)}</div><small class="muted">${esc(sub.id)}</small>
          <div class="row" style="margin-top:12px"><span class="score" style="color:${gradeColor(sub.grade)}">${Math.round(sub.trustScore)}</span>
            <div><b style="font-size:1.2rem">Grade ${sub.grade}</b><br><small class="muted">valid to ${fmtDate(rec.vc.validUntil)}</small><br><small class="muted">next re-check ${fmtDate(sub.nextReview)}</small></div></div></div>
        <div class="qr">${qr || `<small>QR unavailable offline. Use the link.</small>`}</div>
      </div>
      <div class="stamps">
        <div class="stamp" style="color:#2b59c3">Scan<small>${(rec.firstScan ?? sub.trustScore).toFixed(0)} · ${gradeFor(rec.firstScan ?? sub.trustScore).grade}</small></div>
        <div class="stamp" style="color:var(--violet)">Vault<small>${sub.evidence.crypto} proofs</small></div>
        <div class="stamp" style="color:#555">Reviewed<small>analyst sign-off</small></div>
        <div class="stamp" style="color:var(--red)">Grade ${sub.grade}<small>${sub.trustScore.toFixed(1)} · ${fmtDate(rec.issuedAt)}</small></div>
        <div class="stamp" style="color:var(--teal)">Ledger<small>block #${rec.block}</small></div>
        ${revoked ? `<div class="stamp" style="color:var(--red);font-size:1rem">Revoked</div>` : ""}
      </div>
    </div>
    <div class="card">
      <h3>What the bank sees vs what stays with you</h3>
      <div class="grid g2" style="gap:12px">
        <div class="callout"><b>In the Passport</b><br>Score, grade, six domain scores, evidence mix, validity, Merkle root of all 20 controls, issuer signature</div>
        <div class="callout violet"><b>Stays on your device</b><br>Your answers, documents, evidence files and the salts that unlock each control</div>
      </div>
      <h3 style="margin-top:16px">Share chosen controls (selective disclosure)</h3>
      <p class="muted" style="font-size:.88rem">Pick controls to reveal to one bank. Each comes with a Merkle proof that it is part of the signed Passport. Nothing else is revealed.</p>
      <div class="check-list" style="max-height:180px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px">
        ${rec.holder.items.map(i => `<label><input type="checkbox" class="disc" value="${i.qid}"> <b>${i.qid.toUpperCase()}</b> ${esc(questionById[i.qid].text)} ${pill(i.level)}</label>`).join("")}
      </div>
      <button class="btn" style="margin-top:10px" data-act="disclose">Create share link</button>
      <div id="disc-out"></div>
      <div class="row" style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
        <button class="btn danger" data-act="revoke" ${revoked ? "disabled" : ""}>${revoked ? "Revoked" : "Simulate failed re-check: revoke"}</button>
        <small class="muted">Revocation is written to the ledger; every bank check fails from then on.</small></div>
    </div>
  </div>
  <details class="card"><summary>Show the signed credential (W3C Verifiable Credential JSON)</summary>
    <pre class="json">${esc(JSON.stringify(rec.vc, null, 2))}</pre>
    <p class="cite">QR payload: ${rec.payload.length} characters (deflate-compressed). Credential hash on ledger: <span class="mono">${esc(rec.credentialHash)}</span></p></details>
  ${S.passports.length > 1 ? `<div class="card" style="margin-top:18px"><h3>Earlier Passports</h3>${S.passports.slice(1).map(p => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(p.company)}</b> <span>${p.vc.credentialSubject.trustScore} · ${p.vc.credentialSubject.grade}</span> <small class="muted">${fmtDate(p.issuedAt)}</small> <a href="${esc(verifyLink(p.payload))}">verify</a></div>`).join("")}</div>` : ""}`;
}
async function disclose() {
  const rec = S.passports[0];
  const qids = [...document.querySelectorAll(".disc:checked")].map(c => c.value);
  if (!qids.length) return toast("Tick at least one control");
  const d = await createDisclosures(rec, qids);
  const link = verifyLink(rec.payload, d);
  const qr = link.length <= 900 ? qrSvg(link) : null;
  document.getElementById("disc-out").innerHTML = `<div class="callout" style="margin-top:10px">
    <div class="row"><a class="btn small primary" href="${esc(link)}">Open as bank →</a><button class="btn small" data-act="copy" data-text="${esc(link)}">Copy link</button>
    <small class="muted">${qids.length} control(s) revealed${qr ? "" : " · send as a link (too long for a reliable QR)"}</small></div>
    ${qr ? `<div style="width:170px;margin-top:8px;background:#fff;padding:6px;border-radius:8px">${qr}</div>` : ""}</div>`;
}

// ---------------- VERIFY (bank side) ----------------
async function verifyView(params) {
  const c = params.get("c");
  if (!c) { go("bank"); return ""; }
  const res = await verifyPayload(c, params.get("d"));
  const vc = res.vc, sub = vc?.credentialSubject;
  const labels = { valid: "Valid Passport", "valid-unanchored": "Valid Passport", invalid: "Invalid credential", revoked: "Passport revoked", expired: "Passport expired" };
  const terms = sub ? creditTerms(sub.grade) : null;
  return `
  <div class="page-head"><div class="eyebrow">Bank view · Verification</div><h1>Checking an AI Trust Passport</h1></div>
  <div class="split verify-split">
    <div class="stack">
      <div class="card"><h3>Checks</h3>
        ${res.steps.map((s, i) => `<div class="vstep" style="animation-delay:${i * 0.28}s"><span class="ic ${s.level}">${s.level === "ok" ? "✓" : s.level === "warn" ? "!" : "✕"}</span>
          <div><b>${esc(s.name)}</b><br><small class="muted">${esc(s.detail)}</small></div><small class="muted mono">${s.ms} ms</small></div>`).join("")}
        <p class="cite" style="margin-top:8px">Total verification time: <b>${res.ms} ms</b> (target: under 2 seconds).</p></div>
      ${res.disclosures.length ? `<div class="card"><h3>Controls the company chose to reveal</h3><table><tbody>
        ${res.disclosures.map(d => `<tr><td><b>${d.qid.toUpperCase()}</b> ${esc(questionById[d.qid]?.text || "")}</td><td>${esc(d.answer)}</td><td>${pill(d.level)}</td><td>${d.ok ? `<span class="pill ok">Merkle proof ✓</span>` : `<span class="pill fail">Proof fails</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      ${sub ? `<div class="card"><h3>Domain scores</h3>${bars(DOMAINS.map(d => ({ label: d.short, value: sub.domains[d.key] ?? 0, max: d.weight, color: d.color, note: `${(sub.domains[d.key] ?? 0).toFixed(1)} / ${d.weight}` })))}</div>` : ""}
    </div>
    <aside class="stack sticky">
      <div class="verdict ${res.valid ? "valid" : res.status}" style="animation:fadein .4s ${res.steps.length * 0.28}s both"><span style="font-size:2rem">${res.valid ? "✓" : "✕"}</span><div><b>${labels[res.status]}</b><br><small style="color:#fff;opacity:.9">${res.valid ? "Signed by " + esc(vc.issuer.name) : "Do not rely on this credential"}</small></div></div>
      ${sub ? `<div class="card"><div class="row"><span class="grade-badge" style="background:${gradeColor(sub.grade)}">${sub.grade}</span><div><b>${esc(sub.name)}</b><br><small class="muted">Trust Score ${sub.trustScore}</small></div></div>
        <table style="margin-top:10px"><tbody>
          <tr><td>Valid until</td><td class="num">${fmtDate(vc.validUntil)}</td></tr>
          <tr><td>Next re-check</td><td class="num">${fmtDate(sub.nextReview)}</td></tr>
          <tr><td>Proven controls</td><td class="num">${sub.evidence.crypto}</td></tr>
          <tr><td>Document-backed</td><td class="num">${sub.evidence.document}</td></tr>
        </tbody></table></div>
      ${res.valid ? `<div class="card"><div class="eyebrow">Trust-Linked Credit</div><h3>${terms.eligible ? (terms.marginBp ? `${terms.marginBp} bp margin step-down` : "Standard pricing") : "Fix plan first"}</h3>
        <small class="muted">On a HK$3M facility: SME saves ${hkd(terms.smeSaving)} a year; bank's expected loss falls by ${hkd(terms.bankElSaving)}.</small><br>
        <a href="#/credit" class="btn small" style="margin-top:8px">Open credit calculator</a></div>` : ""}` : ""}
    </aside>
  </div>`;
}

// ---------------- BANK DASHBOARD ----------------
async function bank() {
  const chain = await ledger.getChain();
  const rows = S.passports.map(p => {
    const ev = chain.filter(b => b.ref === p.id);
    return { p, revoked: ev.some(b => b.type === "REVOKE"), checks: ev.filter(b => b.type === "VERIFY").length };
  });
  const valid = rows.filter(r => !r.revoked).length;
  return `
  <div class="page-head"><div class="eyebrow">Bank view</div><h1>Relationship manager dashboard</h1>
  <p class="lead">Every Passport on this ledger node, with live status. If a Passport is revoked or downgraded, the bank hears about it before it shows up as late payments.</p></div>
  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi">${rows.length}</div><div class="kpi-label">Passports issued</div></div>
    <div class="card"><div class="kpi" style="color:var(--ok)">${valid}</div><div class="kpi-label">Valid</div></div>
    <div class="card"><div class="kpi" style="color:var(--red)">${rows.length - valid}</div><div class="kpi-label">Revoked (alert)</div></div>
    <div class="card"><div class="kpi">${chain.filter(b => b.type === "VERIFY").length}</div><div class="kpi-label">Verifications logged</div></div>
  </div>
  <div class="card" style="margin-bottom:18px"><h3>Portfolio</h3>
    ${rows.length ? `<table><thead><tr><th>Company</th><th>Grade</th><th class="num">Score</th><th>Issued</th><th>Next re-check</th><th>Status</th><th class="num">Checks</th><th></th></tr></thead><tbody>
    ${rows.map(({ p, revoked, checks }) => { const s = p.vc.credentialSubject; return `<tr><td><b>${esc(p.company)}</b></td>
      <td><span class="pill" style="background:${gradeColor(s.grade)};color:#fff">${s.grade}</span></td><td class="num">${s.trustScore}</td>
      <td>${fmtDate(p.issuedAt)}</td><td>${fmtDate(s.nextReview)}</td>
      <td>${revoked ? `<span class="pill fail">Revoked</span>` : `<span class="pill ok">Valid</span>`}</td><td class="num">${checks}</td>
      <td><a class="btn small" href="${esc(verifyLink(p.payload))}">Verify</a></td></tr>`; }).join("")}
    </tbody></table>` : `<p class="muted">No Passports issued on this node yet.</p>`}</div>
  <div class="card"><h3>Verify a Passport link</h3><div class="row"><input type="text" id="paste-link" placeholder="Paste a TrustPass verification link"><button class="btn primary" data-act="verify-paste">Verify</button></div></div>`;
}

// ---------------- CREDIT ----------------
function credit(params) {
  const latest = S.passports[0]?.vc.credentialSubject.grade;
  const grade = params.get("g") || latest || (result().answered ? result().grade : "A");
  const facility = Number(params.get("f")) || 3_000_000;
  const t = creditTerms(grade, facility), c = creditTerms("C", facility);
  return `
  <div class="page-head"><div class="eyebrow">Trust-Linked Credit</div><h1>From score to loan</h1>
  <p class="lead">Banks price loans on expected loss = PD × LGD × exposure. The Trust grade adjusts the probability of default (PD) on top of the bank's normal credit assessment. It never replaces it.</p></div>
  <div class="split">
    <div class="stack">
      <div class="card"><h3>Pricing grid</h3><table><thead><tr><th>Grade</th><th class="num">PD</th><th class="num">Expected loss</th><th class="num">Saving vs C</th><th class="num">Margin change</th></tr></thead><tbody>
        ${GRADES.map(g => { const x = creditTerms(g.grade, facility); return `<tr class="${g.grade === grade ? "hl" : ""}"><td>${g.grade}</td><td class="num">${(x.pd * 100).toFixed(2)}%</td><td class="num">${x.elBp} bp</td><td class="num">${g.grade === "C" ? "–" : x.elSavingBp + " bp"}</td><td class="num">${x.eligible ? x.marginBp + " bp" : "Fix plan first"}</td></tr>`; }).join("")}
      </tbody></table><p class="cite" style="margin-top:8px">Assumptions: base PD 3.0% for an unrated tech SME; LGD 45% (Basel foundation-IRB, senior unsecured); PD multipliers A 0.80, B 0.90, C 1.00, D 1.15. To be calibrated in a pilot.</p></div>
      <div class="card"><h3>Worked example: ${hkd(facility)} facility at grade ${grade}</h3><table><tbody>
        <tr><td>Expected loss at grade C</td><td>${hkd(facility)} × 3.00% × 45%</td><td class="num">${hkd(c.elHkd)} / yr</td></tr>
        <tr><td>Expected loss at grade ${grade}</td><td>${hkd(facility)} × ${(t.pd * 100).toFixed(2)}% × 45%</td><td class="num">${hkd(t.elHkd)} / yr</td></tr>
        <tr><td>Lower expected loss for the bank</td><td></td><td class="num">${hkd(t.bankElSaving)} / yr</td></tr>
        <tr class="hl"><td>Margin cut passed to the SME</td><td>${t.eligible ? `${hkd(facility)} × ${(-t.marginBp / 100).toFixed(2)}%` : "—"}</td><td class="num">${hkd(t.smeSaving)} / yr</td></tr>
        <tr><td>Kept by the bank as a buffer</td><td></td><td class="num">${hkd(t.bankBuffer)} / yr</td></tr>
      </tbody></table><p class="cite" style="margin-top:8px">Works like the ratchet in a sustainability-linked loan: re-checked every quarter; if the grade drops, the discount drops with it.</p></div>
    </div>
    <aside class="card sticky">
      <label class="field">Trust grade<select id="cr-grade">${GRADES.map(g => `<option ${g.grade === grade ? "selected" : ""}>${g.grade}</option>`).join("")}</select></label>
      <label class="field" style="margin-top:10px">Facility (HK$)<input type="number" id="cr-fac" value="${facility}" step="100000" min="100000"></label>
      <div style="margin-top:16px"><div class="kpi" style="color:${gradeColor(grade)}">${t.eligible ? (t.marginBp ? t.marginBp + " bp" : "0 bp") : "Fix first"}</div><div class="kpi-label">margin change</div></div>
      <div style="margin-top:10px"><div class="kpi">${hkd(t.smeSaving)}</div><div class="kpi-label">interest saved per year</div></div>
      ${latest ? `<p class="cite" style="margin-top:10px">Defaulted to your latest Passport grade (${latest}).</p>` : ""}
    </aside>
  </div>`;
}
after.credit = () => {
  const upd = () => { location.hash = `#/credit?g=${document.getElementById("cr-grade").value}&f=${document.getElementById("cr-fac").value}`; };
  document.getElementById("cr-grade").addEventListener("change", upd);
  document.getElementById("cr-fac").addEventListener("change", upd);
};

// ---------------- LEDGER ----------------
async function ledgerView() {
  const chain = await ledger.getChain();
  const status = await ledger.verifyChain();
  const colors = { GENESIS: "#8792a6", ISSUE: "var(--teal)", VERIFY: "var(--navy)", REVOKE: "var(--red)" };
  return `
  <div class="page-head"><div class="eyebrow">Trust layer</div><h1>Audit ledger</h1>
  <p class="lead">Every issue, verification and revocation is a block. Each block stores the hash of the one before it, so changing history breaks the chain. Only hashes and event data are stored, never personal data.</p></div>
  <div class="card" style="margin-bottom:18px"><div class="spread">
    <div>${status.ok ? `<span class="pill ok">Chain intact · ${status.length} blocks</span>` : `<span class="pill fail">Chain broken at block #${status.brokenAt}: ${esc(status.reason)}</span>`}</div>
    <div class="row"><button class="btn" data-act="verify-chain">Re-verify chain</button><button class="btn danger" data-act="tamper">Simulate tampering</button><button class="btn danger" data-act="reset">Reset all demo data</button></div></div></div>
  <div style="max-width:760px;margin:0 auto">
    ${chain.slice().reverse().map((b, i, arr) => `
      <div class="block ${!status.ok && b.index >= status.brokenAt ? "broken" : ""}">
        <div class="spread"><b style="color:${colors[b.type] || "inherit"}">#${b.index} ${b.type}</b><span class="muted">${new Date(b.ts).toLocaleString("en-GB")}</span></div>
        ${b.ref ? `<div>ref: ${esc(b.ref)}</div>` : ""}
        <div>data: ${esc(JSON.stringify(b.data))}</div>
        <div class="muted">prev: ${esc(short(b.prev, 24))} · hash: ${esc(short(b.hash, 24))}</div>
      </div>${i < arr.length - 1 ? `<div class="chain-link">⛓</div>` : ""}`).join("")}
  </div>`;
}

// ---------------- TECH ----------------
function tech() {
  const L = (name, boxes) => `<div class="layer"><div class="lname">${name}</div><div class="boxes">${boxes.map(([t, d]) => `<div class="box"><b>${t}</b>${d}</div>`).join("")}</div></div>`;
  return `
  <div class="page-head"><div class="eyebrow">Under the hood</div><h1>How TrustPass works</h1>
  <p class="lead">Five layers, with governance and security running through all of them. Everything below runs in this prototype, in the browser, with no server and no data leaving the device.</p></div>
  <div class="card" style="margin-bottom:18px"><div class="arch">
    ${L("Channels", [["SME web app", "Scan, Prove, Passport"], ["Bank dashboard", "Portfolio & alerts"], ["Verify link / QR", "Any bank, any device"]])}
    ${L("Applications", [["Trust Scan", "20 controls, 6 domains"], ["Evidence Vault", "Hash commitments"], ["Trust Passport", "Signed credential"], ["Trust-Linked Credit", "PD × LGD pricing"]])}
    ${L("AI engine", [["Document Agent", "Sentence split + BM25 evidence retrieval"], ["Rule-mapping Agent", `BM25 over ${CLAUSES.length} HK rule clauses, domain-constrained`], ["Scoring model", "Weighted additive model + exact Shapley reason codes"], ["Checking Agent", "Negation & contradiction checks"]])}
    ${L("Trust layer", [["ECDSA P-256", "Issuer signature (Web Crypto)"], ["W3C VC 2.0", "Credential data model"], ["Merkle tree", "Selective disclosure of controls"], ["Hash-chain ledger", "Issue / verify / revoke log"]])}
    ${L("Data & knowledge", [["Rule library", "HKMA · SFC · PCPD · PDPO · ISO 42001"], ["Question bank", "20 controls with evidence specs"], ["Local storage", "Holder wallet stays on device"]])}
  </div></div>
  <div class="card" style="margin-bottom:18px"><h3>Prototype today, production tomorrow</h3>
    <table><thead><tr><th>Component</th><th>In this prototype</th><th>Production design</th></tr></thead><tbody>
      <tr><td>Document reading</td><td>BM25 retrieval over policy sentences, in-browser</td><td>Multimodal LLM document agent (PDF, slides, screenshots) in a private HK cloud</td></tr>
      <tr><td>Rule mapping</td><td>BM25 over paraphrased clause library, filtered by domain</td><td>Hybrid BM25 + vector search over the full rule texts, with citation checks</td></tr>
      <tr><td>Scoring</td><td>Transparent weighted model; Shapley values are exact</td><td>Rules + gradient-boosted model with SHAP reason codes, validated on pilot data</td></tr>
      <tr><td>AI checks AI</td><td>Rule-based checker: negation, weak matches, contradictions</td><td>Second LLM re-checks every finding for unsupported claims</td></tr>
      <tr><td>Proving without sharing</td><td>Salted SHA-256 commitments + Merkle inclusion proofs</td><td>zk-SNARK range/set proofs generated in a trusted execution environment</td></tr>
      <tr><td>Passport</td><td>W3C VC 2.0 shape, ECDSA P-256 (ecdsa-jcs-2019 style)</td><td>Same standard; issuer keys in an HSM; DIDs; revocation registry</td></tr>
      <tr><td>Ledger</td><td>Single-node hash chain per browser</td><td>Permissioned blockchain shared by partner banks (e.g. Hyperledger Fabric)</td></tr>
    </tbody></table></div>
  <div class="grid g2">
    <div class="card"><h3>Design rules</h3><ul>
      <li><b>Private:</b> prove things without sharing the data behind them</li>
      <li><b>People decide:</b> AI drafts and scores; an analyst signs off every Passport</li>
      <li><b>Local:</b> built on HKMA, SFC and PCPD guidance, not a generic checklist</li>
      <li><b>Worth money:</b> linked to real loan terms</li>
      <li><b>Fair:</b> "No agents" is N/A, so small firms aren't marked down for controls that don't apply</li></ul></div>
    <div class="card"><h3>Tested</h3><p class="muted">34 automated tests cover the scoring formula, the credit maths from the pricing grid, the agents (including rejecting "we have not yet…" evidence), Merkle proofs, signature forgery, expiry, revocation and ledger tampering.</p>
      <p><code>node tests/run-tests.mjs</code></p></div>
  </div>`;
}

// ---------------- events ----------------
function readCompany() { const el = document.getElementById("company"); if (el) { S.company = el.value.trim(); save(); } }

app.addEventListener("input", e => { if (e.target.id === "company") { S.company = e.target.value.trim(); save(); } });
app.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.actChange === "prove-file" && t.files[0]) proveFile(t.dataset.q, t.files[0]);
});
app.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case "start": readCompany(); if (!S.company) return toast("Enter your company name"); go("scan"); break;
    case "preset": loadPreset(el.dataset.p); break;
    case "go": readCompany(); go(el.dataset.r); break;
    case "answer": {
      S.answers[el.dataset.q] = el.dataset.v; save();
      document.getElementById("row-" + el.dataset.q).outerHTML = questionRow(questionById[el.dataset.q]);
      const side = document.getElementById("scan-side");
      const active = document.activeElement?.id;
      side.innerHTML = scanSide(result());
      if (active === "company") document.getElementById("company").focus();
      break;
    }
    case "sample-policy": {
      const t = await fetch("samples/novapay-ai-policy.txt").then(r => r.text()).catch(() => "");
      document.getElementById("policy-text").value = t; S.policyText = t; save(); toast("Sample policy loaded"); break;
    }
    case "run-engine": runEngine(); break;
    case "prove-threshold": proveThreshold(el.dataset.q, parseFloat(document.getElementById("th-" + el.dataset.q).value)); break;
    case "demo-proofs": demoProofs(); break;
    case "approve": el.disabled = true; approve(); break;
    case "copy": navigator.clipboard?.writeText(el.dataset.text).then(() => toast("Link copied"), () => toast("Copy failed")); break;
    case "download-vc": {
      const rec = S.passports[0];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rec.vc, null, 2)], { type: "application/json" }));
      a.download = `trust-passport-${rec.company.replace(/\W+/g, "-").toLowerCase()}.json`; a.click(); break;
    }
    case "disclose": disclose(); break;
    case "revoke": await revokePassport(S.passports[0].id); toast("Passport revoked on the ledger"); render(); break;
    case "verify-paste": {
      const v = document.getElementById("paste-link").value.trim();
      const i = v.indexOf("#/verify?");
      if (i < 0) return toast("That is not a TrustPass verification link");
      location.hash = v.slice(i); break;
    }
    case "verify-chain": render(); toast("Chain re-verified"); break;
    case "tamper": await ledger.tamper(); toast("A past ISSUE block was edited to grade A, score 99.9"); render(); break;
    case "reset":
      if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Click again to clear everything"; setTimeout(() => { el.dataset.armed = ""; el.textContent = "Reset all demo data"; }, 4000); break; }
      ledger.reset(); S = fresh(); save(); toast("Demo data cleared"); go(""); break;
  }
});

function loadPreset(which) {
  S.company = NOVAPAY.company; S.profile = NOVAPAY.profile; S.docRun = null; S.policyText = "";
  const d1 = computeScore(NOVAPAY.day1, {});
  S.baseline = { label: "Day 1", values: d1.domains.map(d => d.pct), total: d1.total };
  if (which === "day1") { S.answers = { ...NOVAPAY.day1 }; S.evidence = {}; go("results"); }
  else {
    S.answers = { ...NOVAPAY.month6 }; S.evidence = {};
    NOVAPAY.month6Docs.forEach(q => S.evidence[q] = { level: "document", source: "Policy document" });
    NOVAPAY.month6Crypto.forEach(q => S.evidence[q] = { level: "crypto", hash: "demo-" + q, claim: "Proven in the Evidence Vault (demo)" });
    go("results");
  }
  save();
  if (location.hash === "#/results") render();
}

render();
