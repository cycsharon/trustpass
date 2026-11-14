// TrustPass - single-page app (no framework, no build step).

import { DOMAINS, EVIDENCE, GRADES } from "./config.js";
import { QUESTIONS, questionById, GUIDES, CLAUSES } from "./rules.js";
import { computeScore, actionPlan, simulateFixes, gradeFor } from "./scoring.js";
import { suggestFromDocument, ruleMappingAgent, checkingAgent } from "./agents.js";
import { issuePassport, revokePassport, createDisclosures, verifyPayload, hashEvidenceFile } from "./credential.js";
import { commit, randomSalt } from "./crypto.js";
import * as ledger from "./ledger.js";
import { gauge, radar, bars, gradeColor } from "./charts.js";
import { NOVAPAY } from "./presets.js";
import { qrSvg as makeQr } from "./qrcode.js";

// ---------------- state ----------------
const KEY = "trustpass.state.v2";
const fresh = () => ({ company: "", answers: {}, evidence: {}, baseline: null, passports: [], docRun: null, policyText: "" });
let S = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked */ } };

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const pill = level => `<span class="pill ${level}" title="${esc(EVIDENCE[level].desc)}">${EVIDENCE[level].label}</span>`;
const ANSWER_LABEL = { yes: "Yes", partly: "Partly", no: "No", na: "Not applicable" };
const answerPill = a => `<span class="pill ${a === "yes" ? "ok" : a === "partly" ? "warn" : a === "na" ? "self" : "fail"}">${a ? ANSWER_LABEL[a] : "Not answered"}</span>`;
const short = (s, n = 10) => s ? s.slice(0, n) + "…" : "";
const domainOf = key => DOMAINS.find(d => d.key === key);
const result = () => computeScore(S.answers, S.evidence);
const pts = x => (Math.round(x * 10) / 10).toFixed(1);

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}
function qrSvg(text) { try { return makeQr(text); } catch { return null; } }
const baseUrl = () => location.origin + location.pathname;
const verifyLink = (payload, disc) => `${baseUrl()}#/verify?c=${payload}${disc ? "&d=" + disc : ""}`;

function setBaselineIfNone() {
  const r = result();
  if (!S.baseline && r.answered >= 10) { S.baseline = { label: "First scan", values: r.domains.map(d => d.pct), total: r.total }; save(); }
}

// ---------------- router ----------------
const routes = { "": home, scan, evidence, results, review, passport, verify: verifyView, bank, ledger: ledgerView, tech, privacy };
const STEPS = [["scan", "Answer"], ["evidence", "Prove"], ["results", "Results"], ["review", "Review"], ["passport", "Passport"]];
function stepper(path) {
  const i = STEPS.findIndex(x => x[0] === path);
  if (i < 0) return "";
  return `<nav class="stepper" aria-label="Steps">${STEPS.map(([r, l], k) => `<a href="#/${r}" class="${k < i ? "done" : k === i ? "now" : ""}"><b>${k < i ? "✓" : k + 1}</b>${l}</a>`).join('<span class="line"></span>')}</nav>`;
}
const after = {};

async function render() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query || "");
  const view = routes[path] || home;
  const inSteps = STEPS.some(x => x[0] === path);
  document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active", a.dataset.route === path || (path === "verify" && a.dataset.route === "bank") || (inSteps && a.dataset.route === "scan")));
  app.innerHTML = stepper(path) + await view(params);
  after[path]?.(params);
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
const go = r => { location.hash = "#/" + r; };

function nextBar(backRoute, backLabel, nextRoute, nextLabel) {
  return `<div class="nextbar">${backRoute ? `<a class="btn" href="#/${backRoute}">← ${backLabel}</a>` : "<span></span>"}
    ${nextRoute ? `<a class="btn primary" href="#/${nextRoute}">${nextLabel} →</a>` : ""}</div>`;
}

// ---------------- HOME ----------------
function home() {
  return `
  <section class="hero">
    <div>
      <div class="eyebrow">For Hong Kong start-ups that sell to banks</div>
      <h1>Fill in banks' AI questionnaires automatically.</h1>
      <p class="lead">Before a bank works with you, it sends a long questionnaire about how you use AI. TrustPass reads your own AI policy,
      fills in the answers for you, shows you what to fix, and turns the result into a Passport you can send to every bank in one link.</p>
      <div class="row" style="margin-top:18px">
        <input type="text" id="company" placeholder="Your company name" value="${esc(S.company)}" style="max-width:260px" aria-label="Company name">
        <button class="btn primary" data-act="start">Start my free check →</button>
      </div>
      <div class="row" style="margin-top:12px">
        <span class="muted">Or try a demo company:</span>
        <button class="btn small" data-act="preset" data-p="day1">NovaPay · first check</button>
        <button class="btn small" data-act="preset" data-p="month6">NovaPay · 6 months later</button>
      </div>
      <p class="cite" style="margin-top:10px">Your documents are read inside your browser and never uploaded.</p>
    </div>
    <div class="card example">
      <div class="eyebrow">Example: one answer, filled in for you</div>
      <div class="ex-row"><span class="ex-n">1</span><div><b>Your AI policy says</b><div class="quote">"Under our contracts, AI suppliers are not permitted to use our customers' data for training their models."</div></div></div>
      <div class="ex-row"><span class="ex-n">2</span><div><b>The bank's question</b><p>Do you stop third-party AI suppliers training on your customers' data?</p></div></div>
      <div class="ex-row"><span class="ex-n">3</span><div><b>TrustPass answers</b><p><span class="pill strong">Yes</span> and asks you to attach the signed contract clause as proof.</p></div></div>
      <div class="ex-row"><span class="ex-n">4</span><div><b>Rule source</b><p>PDPO (DPP3: no new use without consent) · PCPD AI Framework</p></div></div>
    </div>
  </section>

  <section class="grid g3" style="margin-bottom:26px">
    <div class="card"><div class="eyebrow">The rule</div><h3>Banks must check their suppliers</h3><p class="muted">HKMA outsourcing rules and AI principles require banks to check any supplier that uses AI, including start-ups.</p></div>
    <div class="card"><div class="eyebrow">The problem</div><h3>The same questions, again and again</h3><p class="muted">Every bank sends its own long questionnaire. Small teams fill each one in by hand and wait weeks for follow-up questions.</p></div>
    <div class="card"><div class="eyebrow">The fix</div><h3>Answer once, share everywhere</h3><p class="muted">TrustPass fills in the answers from your documents and gives you one Passport that any bank can check.</p></div>
  </section>

  <section class="card" style="margin-bottom:26px">
    <h2>How it works</h2>
    <div class="flow">
      ${[["Answer", "Upload your AI policy. TrustPass fills in the 20 questions; you confirm each one", "var(--teal)", "scan"],
         ["Prove", "Attach proof files. They are fingerprinted on your laptop, never uploaded", "var(--violet)", "evidence"],
         ["Fix", "A step-by-step action plan for every gap", "#5cb8c2", "results"],
         ["Review", "A person checks the answers before anything is issued", "var(--navy)", "review"],
         ["Share", "One Passport link or QR code for every bank", "var(--red)", "passport"]]
        .map(([t, d, c, r], i) => `<a class="stepbox card flat" href="#/${r}" style="text-decoration:none;color:inherit"><span class="num" style="background:${c}">${i + 1}</span><h3>${t}</h3><small>${d}</small></a>`).join("")}
    </div>
  </section>

  <div class="center"><button class="btn primary" data-act="preset" data-p="day1">Try the demo with NovaPay →</button></div>`;
}

function samplePassportHtml() {
  return `<div class="passport mini-passport" aria-hidden="true">
    <div class="band">AI Trust Passport · Partner bank</div>
    <div class="body"><div><div class="company">NovaPay Ltd</div><small class="muted">AI fraud checks · 25 staff · Kowloon Bay</small>
      <div class="row" style="margin-top:10px"><span class="score" style="color:var(--teal)">85</span><div><b>Grade A</b><br><small class="muted">valid to Nov 2028</small></div></div></div>
      <div class="stamp" style="color:var(--red)">Verified<small>2026</small></div></div></div>`;
}

// ---------------- STEP 1: ANSWER ----------------
function scan() {
  const r = result();
  return `
  <div class="page-head"><div class="eyebrow">Step 1 of 5 · Answer</div><h1>Tell us how you use AI</h1>
  <p class="lead">20 questions in 6 areas, each linked to a Hong Kong rule. Answer honestly: a "No" today just becomes a step in your action plan.</p></div>
  <div class="split">
    <div>
      ${autofillCard()}
      <div class="callout" style="margin:0 0 16px"><b>How to answer:</b> <b>Yes</b> = done and written down · <b>Partly</b> = done for some systems, or not written down · <b>No</b> = not yet.</div>
      ${DOMAINS.map(d => `
      <div class="domain-block">
        <div class="domain-title"><span class="swatch" style="background:${d.color}"></span><h3 style="margin:0">${d.name}</h3><span class="muted">· ${d.weight}% of your score</span></div>
        ${QUESTIONS.filter(q => q.domain === d.key).map(q => questionRow(q)).join("")}
      </div>`).join("")}
      ${nextBar("", "", "evidence", "Next: add proof")}
    </div>
    <aside class="card sticky" id="scan-side">${scanSide(r)}</aside>
  </div>`;
}

function autofillCard() {
  const run = S.docRun;
  return `<div class="card" style="margin-bottom:18px;border-color:#b6dfe4" id="autofill">
    <div class="spread"><div><div class="eyebrow" style="color:var(--teal)">Save time</div><h2 style="margin:0">Let our AI fill this in from your documents</h2></div></div>
    <p class="muted" style="margin-top:6px">Upload or paste your AI policy, procedures or model documentation. The AI reads it, finds the sentences that answer each question, and suggests answers. <b>You decide what to accept.</b> The text is read inside your browser and never sent anywhere.</p>
    <div class="grid g2" style="gap:12px">
      <div class="dropzone" id="drop"><b>Drop a .txt or .md file</b><br><small class="muted">or</small><br><input type="file" id="policy-file" accept=".txt,.md,text/plain" style="margin-top:6px" aria-label="Upload policy file">
        <div style="margin-top:10px"><button class="btn small" data-act="sample-policy">Use NovaPay's sample policy</button></div></div>
      <div><textarea id="policy-text" placeholder="…or paste the text here" aria-label="Policy text">${esc(S.policyText)}</textarea></div>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="run-engine">Read my document</button><span class="muted" id="engine-status"></span></div>
    <div class="pipeline mini" id="pipeline" style="margin-top:12px">
      ${["Reading", "Matching to the 20 questions", "Citing HK rules", "Double-checking"].map((s, i) => `<div class="pipe ${run ? "done" : ""}" data-i="${i}">${s}</div>`).join("")}
    </div>
    <div id="suggestions">${run ? suggestionsHtml(run) : ""}</div>
  </div>`;
}

function suggestionsHtml(run) {
  const pending = run.found.filter(f => f.action !== "none" && !f.status).length + run.gaps.filter(g => g.action !== "none" && !g.status).length;
  const card = (item, kind) => {
    const q = questionById[item.qid];
    const done = item.status === "accepted" ? `<span class="pill ok">Accepted ✓</span>` : item.status === "ignored" ? `<span class="pill self">Ignored</span>` : "";
    let suggestion, btn = "";
    if (kind === "found") {
      suggestion = item.action === "set-yes" ? `Suggested answer: <b>Yes</b>, backed by your document`
        : item.action === "add-evidence" ? `You answered <b>${ANSWER_LABEL[item.current]}</b>. We'll attach this sentence as evidence`
        : `Already backed by evidence. Nothing to change`;
    } else {
      suggestion = item.action === "set-no" ? `Your document says this <b>isn't done yet</b>. Suggested answer: <b>No</b> (it goes into your action plan)` : `Matches your answer (No)`;
    }
    if (!item.status && item.action !== "none") btn = `<button class="btn small primary" data-act="accept" data-kind="${kind}" data-q="${item.qid}">Accept</button><button class="btn small" data-act="ignore" data-kind="${kind}" data-q="${item.qid}">Ignore</button>`;
    return `<div class="sugg ${kind}">
      <div class="spread"><b>${item.qid.toUpperCase()} · ${esc(q.text)}</b>${done}</div>
      <div class="quote">"${esc(item.sentence)}"</div>
      <div class="spread"><small>${suggestion}</small><div class="row">${btn}</div></div>
      ${item.rules?.[0] ? `<div class="cite">Related rule: <b>${esc(item.rules[0].source.short)}</b>, ${esc(item.rules[0].title)}</div>` : ""}
    </div>`;
  };
  return `<div style="margin-top:16px">
    <div class="spread" style="margin-bottom:8px"><div><b>Found answers to ${run.found.length} questions</b> · <span class="muted">${run.gaps.length} gap(s) · ${run.notMentioned.length} not mentioned in your document</span></div>
      ${pending ? `<button class="btn small dark" data-act="accept-all">Accept all ${pending} suggestions</button>` : ""}</div>
    <div class="stack">${run.found.map(f => card(f, "found")).join("")}${run.gaps.map(g => card(g, "gap")).join("")}</div>
    ${run.notMentioned.length ? `<p class="cite" style="margin-top:10px">Not mentioned in your document: ${run.notMentioned.map(q => q.toUpperCase()).join(", ")}. Answer these yourself below.</p>` : ""}
  </div>`;
}

function questionRow(q) {
  const a = S.answers[q.id];
  const e = S.evidence[q.id];
  const opts = [["yes", "Yes"], ["partly", "Partly"], ["no", "No"]];
  if (q.agent) opts.push(["na", "We don't use AI agents"]);
  return `<div class="q" id="row-${q.id}">
    <div class="qn">${q.id.toUpperCase()}</div>
    <div><div class="qt">${esc(q.text)}</div>
      <div class="qe">${e?.level && e.level !== "self" && a && a !== "no" ? pill(e.level) + " " : ""}${e?.citation ? `From your document: "${esc(short(e.citation, 80))}"` : `Best proof: ${esc(q.evidence)}`}</div></div>
    <div class="seg" role="group" aria-label="Answer ${q.id}">${opts.map(([v, l]) => `<button data-act="answer" data-q="${q.id}" data-v="${v}" class="${a === v ? "on" : ""}" aria-pressed="${a === v}">${l}</button>`).join("")}</div>
  </div>`;
}
function scanSide(r) {
  return `
    <label class="field">Company<input type="text" id="company" value="${esc(S.company)}" placeholder="Company name"></label>
    <div style="margin-top:12px">${gauge(r.total, r.grade)}</div>
    <div class="row" style="justify-content:center"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span>
      <div><b>${r.gradeInfo.meaning}</b><br><small class="muted">${r.answered} of 20 answered</small></div></div>
    <p class="cite" style="margin-top:10px">Your score rises when you prove your answers (step 2). An answer on your word alone counts 60%.</p>
    <div class="stack"><button class="btn primary" style="width:100%;justify-content:center" data-act="go" data-r="evidence">Next: add proof →</button>
    <button class="btn" style="width:100%;justify-content:center" data-act="go" data-r="results">See my results</button></div>`;
}
after.scan = () => {
  const drop = document.getElementById("drop");
  const loadFile = f => f && f.text().then(t => { document.getElementById("policy-text").value = t; S.policyText = t; save(); toast(`Loaded ${f.name}`); });
  document.getElementById("policy-file").addEventListener("change", e => loadFile(e.target.files[0]));
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => loadFile(e.dataTransfer.files[0]));
};

async function runEngine() {
  const text = document.getElementById("policy-text").value.trim();
  if (text.length < 40) return toast("Upload or paste a document first");
  S.policyText = text;
  const run = suggestFromDocument(text, S.answers, S.evidence);
  const pipes = [...document.querySelectorAll("#pipeline .pipe")];
  pipes.forEach(p => p.classList.remove("done", "run"));
  for (let i = 0; i < pipes.length; i++) {
    pipes[i].classList.add("run");
    document.getElementById("engine-status").textContent = pipes[i].textContent + "…";
    await new Promise(r => setTimeout(r, 380));
    pipes[i].classList.remove("run"); pipes[i].classList.add("done");
  }
  document.getElementById("engine-status").textContent = `Read ${run.sentences} sentences in ${run.timings.read + run.timings.retrieve + run.timings.check} ms`;
  S.docRun = run; save();
  document.getElementById("suggestions").innerHTML = suggestionsHtml(run);
}

function applySuggestion(kind, qid) {
  const run = S.docRun; if (!run) return;
  const item = (kind === "found" ? run.found : run.gaps).find(x => x.qid === qid);
  if (!item || item.status) return;
  if (kind === "found") {
    if (item.action === "set-yes") S.answers[qid] = "yes";
    if (item.action !== "none" && (S.evidence[qid]?.level || "self") === "self") S.evidence[qid] = { level: "document", citation: item.sentence, confidence: item.confidence };
  } else if (item.action === "set-no") {
    S.answers[qid] = "no"; S.evidence[qid] = { level: "self", note: item.sentence };
  }
  item.status = "accepted";
}

// ---------------- STEP 2: PROVE ----------------
function evidence() {
  const r = result();
  const provable = QUESTIONS.filter(q => ["yes", "partly"].includes(S.answers[q.id]));
  return `
  <div class="page-head"><div class="eyebrow">Step 2 of 5 · Prove</div><h1>Back up your answers</h1>
  <p class="lead">Proof makes your Passport believable, and it raises your score. Here's how much each answer counts:</p></div>

  <div class="grid g3" style="margin-bottom:18px">
    <div class="card level-card"><span class="pill self">Your word</span><div class="kpi">60%</div><small class="muted">You answered "Yes" but haven't shown anything.</small></div>
    <div class="card level-card"><span class="pill document">Document found</span><div class="kpi">85%</div><small class="muted">Our AI found it in a document you uploaded in step 1.</small></div>
    <div class="card level-card"><span class="pill crypto">Proof sealed</span><div class="kpi">100%</div><small class="muted">You attached a proof file below, or entered a measured result.</small></div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <h3>How "Proof sealed" keeps your files private</h3>
    <div class="grid g3" style="gap:14px">
      <div><b>1. You pick a file</b><br><small class="muted">e.g. your signed AI policy or bias test report.</small></div>
      <div><b>2. Your browser makes a fingerprint</b><br><small class="muted">A unique code made from the file (SHA-256). The file is <b>not uploaded</b>; only the code is saved.</small></div>
      <div><b>3. The code goes into your Passport</b><br><small class="muted">If a bank later asks to see the file, you show it and they can check it matches. Nobody can change it afterwards without it showing.</small></div>
    </div>
  </div>

  <div class="card">
    <div class="spread"><div><h2 style="margin:0">Your answers</h2>
      <small class="muted">Score now: <b style="color:${gradeColor(r.grade)}">${pts(r.total)} · Grade ${r.grade}</b> · ${r.evidenceMix.crypto} sealed · ${r.evidenceMix.document} from documents · ${r.evidenceMix.self} on your word</small></div>
      <button class="btn small" data-act="demo-proofs" title="Adds sample proof files for the demo">Demo: add sample proofs</button></div>
    ${provable.length ? `<table class="vault" style="margin-top:12px"><thead><tr><th>Question</th><th>Counts as</th><th>Add proof</th></tr></thead><tbody>
      ${provable.map(q => vaultRow(q)).join("")}</tbody></table>` : `<div class="empty"><p class="muted">You haven't answered "Yes" or "Partly" to anything yet.</p><a class="btn primary" href="#/scan">Go to step 1</a></div>`}
  </div>
  ${nextBar("scan", "Back to answers", "results", "Next: see results and action plan")}`;
}
function vaultRow(q) {
  const e = S.evidence[q.id] || {};
  const level = e.level || "self";
  let action;
  if (level === "crypto") {
    action = `<div class="sealed">✓ Proof sealed<br><span class="mono" title="${esc(e.hash)}">code ${esc(short(e.hash, 12))}</span>${e.claim ? `<br><small class="muted">${esc(e.claim)}</small>` : ""}</div>`;
  } else if (q.proof === "threshold") {
    const t = q.threshold;
    action = `<div class="thr"><label class="field">${esc(t.label)}
        <span class="unit-input"><input type="number" id="th-${q.id}" min="${t.min}" max="${t.max}" step="${t.step}" placeholder="e.g. ${t.unit ? "98" : "0.86"}">${t.unit ? `<span>${t.unit}</span>` : ""}</span></label>
      <small class="muted">${esc(t.help)} Only <b>pass / fail</b> goes in your Passport. The number stays with you.</small>
      <div class="row" style="margin-top:6px"><button class="btn small primary" data-act="prove-threshold" data-q="${q.id}">Seal result</button>
      <label class="btn small">or attach report<input type="file" hidden data-act-change="prove-file" data-q="${q.id}"></label></div></div>`;
  } else {
    action = `<label class="btn small primary">Attach proof file<input type="file" hidden data-act-change="prove-file" data-q="${q.id}"></label>
      <div><small class="muted">Suggested: ${esc(GUIDES[q.id].proofFile)}</small></div>`;
  }
  return `<tr><td><b>${q.id.toUpperCase()}</b> ${esc(q.text)} ${answerPill(S.answers[q.id])}
    ${e.citation ? `<div class="quote">From your document: "${esc(e.citation)}"</div>` : ""}</td>
    <td>${pill(level)}<br><small class="muted">${Math.round(EVIDENCE[level].factor * 100)}%</small></td><td>${action}</td></tr>`;
}

async function proveFile(qid, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await hashEvidenceFile(bytes);
  const before = result().total;
  S.evidence[qid] = { ...(S.evidence[qid] || {}), level: "crypto", hash, claim: `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB), kept on your device`, at: new Date().toISOString() };
  save(); await render();
  toast(`${qid.toUpperCase()} proof sealed · score ${pts(before)} → ${pts(result().total)}`);
}
async function proveThreshold(qid, raw) {
  const q = questionById[qid], t = q.threshold;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < t.min || value > t.max) return toast(`Enter a number between ${t.min} and ${t.max}${t.unit}`);
  if (value < t.value) return toast(`${value}${t.unit} is below the target of ${t.value}${t.unit}. See the action plan for how to improve it.`);
  const hash = await commit(randomSalt(), qid, String(value));
  const before = result().total;
  S.evidence[qid] = { ...(S.evidence[qid] || {}), level: "crypto", hash, claim: `Passed the ${t.value}${t.unit} target (exact number kept private)`, at: new Date().toISOString() };
  save(); await render();
  toast(`${qid.toUpperCase()} result sealed · score ${pts(before)} → ${pts(result().total)}`);
}
async function demoProofs() {
  for (const qid of ["q1", "q5", "q7"]) {
    if (!["yes", "partly"].includes(S.answers[qid])) continue;
    const hash = await hashEvidenceFile(new TextEncoder().encode(`Sample proof for ${qid} · ${new Date().toISOString()}`));
    S.evidence[qid] = { ...(S.evidence[qid] || {}), level: "crypto", hash, claim: `Sample file: ${GUIDES[qid].proofFile}` };
  }
  if (!["yes", "partly"].includes(S.answers.q8)) S.answers.q8 = "yes";
  S.evidence.q8 = { level: "crypto", hash: await commit(randomSalt(), "q8", "0.86"), claim: "Passed the 0.8 target (exact number kept private)" };
  save(); await render(); toast("Sample proofs added for Q1, Q5, Q7 and Q8");
}

// ---------------- STEP 3: RESULTS & ACTION PLAN ----------------
function results() {
  const r = result();
  if (!r.answered) return emptyState("No answers yet", "Answer the questions in step 1 to see your score and action plan.", "scan", "Go to step 1");
  setBaselineIfNone();
  const plan = actionPlan(r);
  const toFix = plan.filter(c => c.answer !== "yes");
  const toProve = plan.filter(c => c.answer === "yes");
  const sim = simulateFixes(S.answers, S.evidence, toFix.slice(0, 5).map(x => x.qid), "document");
  const flags = checkingAgent(S.answers, S.evidence);
  const series = [];
  if (S.baseline) series.push({ name: `${S.baseline.label} (${S.baseline.total.toFixed(0)})`, color: "#d1293d", values: S.baseline.values });
  series.push({ name: `Now (${r.total.toFixed(0)})`, color: "#0f9aa8", values: r.domains.map(d => d.pct) });

  return `
  <div class="page-head spread"><div><div class="eyebrow">Step 3 of 5 · Results</div><h1>${esc(S.company || "Your company")}: ${pts(r.total)} / 100</h1></div>
    <a class="btn primary" href="#/review">Next: request my Passport →</a></div>

  <div class="grid g3" style="margin-bottom:18px">
    <div class="card" style="text-align:center">${gauge(r.total, r.grade)}
      <div class="row" style="justify-content:center"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span><div style="text-align:left"><b>Grade ${r.grade}</b><br><small class="muted">${r.gradeInfo.meaning}</small></div></div>
      <p class="cite" style="margin-top:10px">A ≥ 80 · B 65–79 · C 50–64 · D below 50</p></div>
    <div class="card"><h3>Score by area</h3>
      <div class="compact">${bars(r.domains.map(d => ({ label: d.short, value: d.points, max: d.weight, color: d.color, note: `${pts(d.points)} / ${d.weight}` })))}</div>
      <p class="cite" style="margin-top:10px">Each area is worth a share of 100 points. You lose points for "No"/"Partly" answers and for answers without proof.</p></div>
    <div class="card"><h3>${S.baseline ? "Before and now" : "Your shape"}</h3>${radar(series, r.domains.map(d => d.short))}</div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="spread"><div><div class="eyebrow">Your action plan</div><h2 style="margin:0">${toFix.length} things to fix, ${toProve.length} to strengthen</h2></div>
      ${toFix.length ? `<div class="whatif">Do the first ${Math.min(5, toFix.length)} fixes and back them with documents:<br><b style="color:${gradeColor(r.grade)}">${pts(r.total)} · ${r.grade}</b> → <b style="color:${gradeColor(sim.grade)}">${pts(sim.total)} · ${sim.grade}</b></div>` : ""}</div>
    <p class="muted" style="margin-top:8px">Sorted by how many points each one adds. Click any item for the steps, what to keep as proof, and the rule behind it.</p>
    ${toFix.length ? `<h3 style="margin-top:14px">Fix: not done yet, or only partly</h3>${toFix.map((c, i) => planItem(c, i < 3)).join("")}` : `<div class="callout">Nothing to fix: every control is answered "Yes".</div>`}
    ${toProve.length ? `<h3 style="margin-top:18px">Strengthen: done, but a proof file would earn full points</h3><p class="cite">Quick wins. Attach a proof file in step 2.</p>${toProve.map(c => planItem(c, false)).join("")}` : ""}
  </div>

  <div class="grid g2" style="margin-bottom:18px">
    <div class="card"><h3>Things to double-check</h3><p class="cite">Our checker looks for answers that don't fit together.</p>
      ${flags.length ? flags.map(f => `<div class="callout ${f.type === "contradiction" ? "bad" : "warn"}" style="margin-bottom:8px">${esc(f.msg)}</div>`).join("") : `<div class="callout">Nothing to flag.</div>`}</div>
    <div class="card"><h3>How your score is worked out</h3>
      <p class="muted">Each area has a weight (Governance 20, Data & privacy 20, Model risk 20, Cyber 15, Human oversight 15, Transparency 10). Inside an area, every question is worth an equal share.</p>
      <p class="muted">A question earns: <b>answer</b> (Yes 100%, Partly 50%, No 0%) × <b>proof</b> (your word 60%, document 85%, sealed proof 100%).</p>
      <details><summary>See points for every question</summary>${scoreTable(r)}</details></div>
  </div>
  ${nextBar("evidence", "Back to proof", "review", "Next: request my Passport")}`;
}

function planItem(c, open) {
  const q = questionById[c.qid], g = GUIDES[c.qid], d = domainOf(c.domain);
  const rules = ruleMappingAgent(c.qid);
  const proveOnly = c.answer === "yes";
  return `<details class="plan" ${open ? "open" : ""}>
    <summary><span class="swatch" style="background:${d.color}"></span><span class="plan-title">${esc(q.text)}</span>
      <span class="row" style="gap:6px">${answerPill(c.answer)}${c.answer && c.answer !== "no" ? pill(c.level) : ""}<span class="gain">+${pts(c.gap)} pts</span></span></summary>
    <div class="plan-body">
      <p><b>Why it matters:</b> ${esc(g.why)}</p>
      ${proveOnly ? `<p><b>What to do:</b> you've said this is done. Attach a proof file in step 2 to get the full points.</p>`
        : `<p><b>Steps</b> <span class="muted">(about ${esc(g.effort)})</span></p><ol>${g.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`}
      <p><b>Keep as proof:</b> ${esc(g.proofFile)}. <a href="#/evidence">Attach it in step 2 →</a></p>
      <div class="cite"><b>Hong Kong rules this relates to:</b> ${rules.map(cl => `${esc(cl.source.short)}: ${esc(cl.title)}`).join(" · ")}</div>
    </div></details>`;
}
function scoreTable(r) {
  return `<table style="margin-top:8px"><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Proof</th><th class="num">Points</th></tr></thead><tbody>
    ${r.controls.map(c => `<tr><td>${c.qid.toUpperCase()}</td><td>${esc(questionById[c.qid].text)}</td><td>${c.na ? "N/A" : ANSWER_LABEL[c.answer] || "—"}</td><td>${c.na ? "" : EVIDENCE[c.level].short}</td><td class="num">${c.na ? "–" : `${c.contribution.toFixed(2)} / ${c.max.toFixed(2)}`}</td></tr>`).join("")}
  </tbody></table>`;
}
function emptyState(title, text, route, btn) {
  return `<div class="card empty"><h2>${title}</h2><p class="muted">${text}</p><a class="btn primary" href="#/${route}">${btn}</a></div>`;
}

// ---------------- STEP 4: REVIEW ----------------
function review() {
  const r = result();
  if (!r.answered) return emptyState("Nothing to review yet", "Answer the questions in step 1 first.", "scan", "Go to step 1");
  const flags = checkingAgent(S.answers, S.evidence);
  return `
  <div class="page-head"><div class="eyebrow">Step 4 of 5 · Review</div><h1>A person checks before anything is issued</h1>
  <p class="lead">AI helps, but people decide. In the live service, a trained reviewer at the partner bank checks your answers and proof, then approves your Passport.</p></div>
  <div class="callout warn" style="margin-bottom:16px"><b>Demo:</b> in this prototype, you play the reviewer. Tick the boxes and approve to see your Passport.</div>
  <div class="split">
    <div class="card"><h3>What the reviewer sees</h3>
      <table><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Proof</th></tr></thead><tbody>
      ${r.controls.map(c => { const q = questionById[c.qid], e = S.evidence[c.qid] || {};
        return `<tr><td><b>${c.qid.toUpperCase()}</b></td><td>${esc(q.text)}${e.citation ? `<div class="cite">Document: "${esc(short(e.citation, 90))}"</div>` : ""}</td><td>${c.na ? "N/A" : answerPill(c.answer)}</td><td>${c.na || !c.answer || c.answer === "no" ? "" : pill(c.level)}</td></tr>`; }).join("")}
      </tbody></table></div>
    <aside class="card sticky">
      <label class="field">Company name (shown on the Passport)<input type="text" id="company" value="${esc(S.company)}" placeholder="e.g. NovaPay Ltd"></label>
      <div class="row" style="margin-top:14px"><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span><div><b>${pts(r.total)} / 100</b><br><small class="muted">${r.gradeInfo.meaning}</small></div></div>
      <h3 style="margin-top:16px">Points to check (${flags.length})</h3>
      ${flags.map(f => `<div class="callout ${f.type === "contradiction" ? "bad" : "warn"}" style="margin-bottom:6px;font-size:.84rem">${esc(f.msg)}</div>`).join("") || `<p class="muted">None</p>`}
      <div class="check-list" style="margin-top:12px">
        <label><input type="checkbox" class="chk"> I checked every point above</label>
        <label><input type="checkbox" class="chk"> The document quotes match the company's documents</label>
        <label><input type="checkbox" class="chk"> The company agrees to receive a Passport</label>
      </div>
      <label class="field" style="margin-top:8px">Reviewer name<input type="text" id="analyst" placeholder="e.g. A. Chan"></label>
      <button class="btn dark" style="width:100%;justify-content:center;margin-top:12px" id="approve" data-act="approve" disabled>Approve and issue Passport</button>
      <small class="muted" id="approve-hint">Fill in the company name, tick all three boxes and add a reviewer name.</small>
    </aside>
  </div>`;
}
after.review = () => {
  if (!document.getElementById("analyst")) return;
  const update = () => {
    const ok = [...document.querySelectorAll(".chk")].every(c => c.checked)
      && document.getElementById("analyst").value.trim().length > 1
      && document.getElementById("company").value.trim().length > 1;
    document.getElementById("approve").disabled = !ok;
    document.getElementById("approve-hint").style.visibility = ok ? "hidden" : "visible";
  };
  app.querySelectorAll(".chk").forEach(c => c.addEventListener("change", update));
  document.getElementById("analyst").addEventListener("input", update);
  document.getElementById("company").addEventListener("input", update);
};
async function approve() {
  S.company = document.getElementById("company").value.trim();
  const r = result();
  const analyst = document.getElementById("analyst").value.trim();
  const rec = await issuePassport({ company: S.company, result: r, answers: S.answers, evidence: S.evidence, analyst });
  rec.company = S.company; rec.analyst = analyst; rec.firstScan = S.baseline?.total ?? r.total;
  S.passports.unshift(rec); save();
  toast("Passport issued");
  go("passport");
}

// ---------------- STEP 5: PASSPORT ----------------
async function passport() {
  const rec = S.passports[0];
  if (!rec) return emptyState("No Passport yet", "Finish the review in step 4 to receive your AI Trust Passport.", "review", "Go to step 4");
  const revoked = (await ledger.findByRef(rec.id)).find(b => b.type === "REVOKE");
  const sub = rec.vc.credentialSubject;
  const link = verifyLink(rec.payload);
  const qr = qrSvg(link);
  const shareable = rec.holder.items.filter(i => i.answer === "yes" || i.answer === "partly");
  return `
  <div class="page-head"><div class="eyebrow">Step 5 of 5 · Your Passport</div><h1>${esc(rec.company)}</h1>
  <p class="lead">Your Passport is yours. Nobody sees it unless you share the link or QR code.</p></div>

  <div class="grid g2" style="margin-bottom:18px;align-items:start">
    <div>
      <div class="passport">
        <div class="band">AI Trust Passport · ${esc(rec.vc.issuer.name)}</div>
        <div class="body">
          <div><div class="company">${esc(rec.company)}</div>
            <div class="row" style="margin-top:12px"><span class="score" style="color:${gradeColor(sub.grade)}">${Math.round(sub.trustScore)}</span>
              <div><b style="font-size:1.2rem">Grade ${sub.grade}</b><br><small class="muted">valid to ${fmtDate(rec.vc.validUntil)}</small><br><small class="muted">next re-check ${fmtDate(sub.nextReview)}</small></div></div></div>
          <div class="qr">${qr || `<small>Use the link</small>`}</div>
        </div>
        <div class="stamps">
          <div class="stamp" style="color:#2b59c3">Checked<small>${fmtDate(rec.issuedAt)}</small></div>
          <div class="stamp" style="color:var(--violet)">Proof<small>${sub.evidence.crypto} sealed</small></div>
          <div class="stamp" style="color:#555">Reviewed<small>by a person</small></div>
          <div class="stamp" style="color:var(--teal)">Grade ${sub.grade}<small>${pts(sub.trustScore)} / 100</small></div>
          ${revoked ? `<div class="stamp" style="color:var(--red);font-size:1rem">Withdrawn</div>` : ""}
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Status: ${revoked ? `<span class="pill fail">Withdrawn</span>` : `<span class="pill ok">Valid</span>`}</h3>
        ${revoked ? `<p>This Passport was withdrawn on ${fmtDate(revoked.ts)}. Anyone who scans it now sees <b>"No longer valid"</b>. Fix the gap, then get a new Passport.</p>
          <a class="btn primary" href="#/results">See what to fix →</a>`
        : `<p class="muted">Your Passport is re-checked every 90 days (next: <b>${fmtDate(sub.nextReview)}</b>). If something you claimed stops being true, for example you stop testing for bias, the partner bank <b>withdraws</b> the Passport. From then on, anyone who scans it sees <b>"No longer valid"</b>. You fix the gap and get a new one.</p>
          <p class="muted">This is what keeps a Passport trustworthy: it can't stay valid after the facts change.</p>
          <button class="btn danger" data-act="revoke">Try it: simulate a failed re-check</button>`}
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <h3>Share your whole Passport</h3>
        <p class="muted">For a bank, investor or client. They'll see your <b>score, grade and score by area</b>, and a check that the Passport is genuine and still valid. They <b>won't</b> see your answers or files.</p>
        <div class="row"><a class="btn primary" href="${esc(link)}">See what they'll see →</a>
          <button class="btn" data-act="copy" data-text="${esc(link)}">Copy share link</button></div>
        <small class="muted">Or let them scan the QR code on your Passport.</small>
      </div>
      <div class="card">
        <h3>Prove specific answers</h3>
        <p class="muted">Sometimes they'll ask about one thing, like "do you test for bias?". Tick the answers you want to show. They'll see <b>only those</b>, with a check that each one really is part of your signed Passport.</p>
        <div class="check-list share-list">
          ${shareable.length ? shareable.map(i => `<label><input type="checkbox" class="disc" value="${i.qid}"> <span>${esc(questionById[i.qid].text)}</span> ${answerPill(i.answer)} ${pill(i.level)}</label>`).join("") : `<p class="muted">No "Yes" or "Partly" answers to share.</p>`}
        </div>
        <button class="btn" style="margin-top:10px" data-act="disclose">Create link for these answers</button>
        <div id="disc-out"></div>
      </div>
    </div>
  </div>

  <details class="card"><summary>For technical reviewers: the signed credential</summary>
    <p class="cite" style="margin-top:8px">A W3C Verifiable Credential signed by the partner bank (ECDSA P-256). Your answers are inside only as sealed codes (a Merkle root); the readable answers stay on your device.</p>
    <pre class="json">${esc(JSON.stringify(rec.vc, null, 2))}</pre></details>
  ${S.passports.length > 1 ? `<div class="card" style="margin-top:18px"><h3>Earlier Passports</h3>${S.passports.slice(1).map(p => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(p.company)}</b> <span>${pts(p.vc.credentialSubject.trustScore)} · Grade ${p.vc.credentialSubject.grade}</span> <small class="muted">${fmtDate(p.issuedAt)}</small> <a href="${esc(verifyLink(p.payload))}">check</a></div>`).join("")}</div>` : ""}`;
}
async function disclose() {
  const rec = S.passports[0];
  const qids = [...document.querySelectorAll(".disc:checked")].map(c => c.value);
  if (!qids.length) return toast("Tick at least one answer");
  const d = await createDisclosures(rec, qids);
  const link = verifyLink(rec.payload, d);
  document.getElementById("disc-out").innerHTML = `<div class="callout" style="margin-top:10px">
    <b>Link ready.</b> It shows ${qids.length} answer(s) and nothing else.
    <div class="row" style="margin-top:8px"><a class="btn small primary" href="${esc(link)}">See what they'll see →</a><button class="btn small" data-act="copy" data-text="${esc(link)}">Copy link</button></div></div>`;
}

// ---------------- VERIFY (what a bank / investor sees) ----------------
async function verifyView(params) {
  const c = params.get("c");
  if (!c) { go("bank"); return ""; }
  const res = await verifyPayload(c, params.get("d"));
  const vc = res.vc, sub = vc?.credentialSubject;
  const labels = { valid: "Genuine and valid", "valid-unanchored": "Genuine and valid", invalid: "Not genuine", revoked: "No longer valid (withdrawn)", expired: "Expired" };
  const names = { "Decode credential": "Read the Passport", "Trusted issuer": "Issued by a trusted bank", "Issuer signature (ECDSA P-256)": "Not changed since it was issued", "Validity period": "Within its valid dates", "Ledger anchor": "Recorded in the audit log", "Revocation check": "Not withdrawn", "Disclosed controls (Merkle proofs)": "Shared answers are genuine" };
  const ranked = sub ? DOMAINS.map(d => ({ d, pct: (sub.domains[d.key] ?? 0) / d.weight })).sort((a, b) => b.pct - a.pct) : [];
  return `
  <div class="page-head"><div class="eyebrow">What a bank, investor or client sees</div><h1>Checking an AI Trust Passport</h1></div>
  <div class="split verify-split">
    <div class="stack">
      <div class="card"><h3>Checks</h3>
        ${res.steps.map((s, i) => `<div class="vstep" style="animation-delay:${i * 0.28}s"><span class="ic ${s.level}">${s.level === "ok" ? "✓" : s.level === "warn" ? "!" : "✕"}</span>
          <div><b>${esc(names[s.name] || s.name)}</b><br><small class="muted">${esc(s.detail)}</small></div><small class="muted mono">${s.ms} ms</small></div>`).join("")}
        <p class="cite" style="margin-top:8px">All checks took ${res.ms} ms. No account or app needed.</p></div>
      ${res.disclosures.length ? `<div class="card"><h3>Answers the company chose to show you</h3><table><tbody>
        ${res.disclosures.map(d => `<tr><td>${esc(questionById[d.qid]?.text || d.qid)}</td><td>${answerPill(d.answer)}</td><td>${pill(d.level)}</td><td>${d.ok ? `<span class="pill ok">Genuine ✓</span>` : `<span class="pill fail">Doesn't match</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      ${sub ? `<div class="card"><h3>Score by area</h3>${bars(DOMAINS.map(d => ({ label: d.short, value: sub.domains[d.key] ?? 0, max: d.weight, color: d.color, note: `${(sub.domains[d.key] ?? 0).toFixed(1)} / ${d.weight}` })))}</div>` : ""}
    </div>
    <aside class="stack sticky">
      <div class="verdict ${res.valid ? "valid" : res.status}" style="animation:fadein .4s ${res.steps.length * 0.28}s both"><span style="font-size:2rem">${res.valid ? "✓" : "✕"}</span><div><b>${labels[res.status]}</b><br><small style="color:#fff;opacity:.9">${res.valid ? "Signed by " + esc(vc.issuer.name) : "Don't rely on this Passport"}</small></div></div>
      ${sub ? `<div class="card"><div class="row"><span class="grade-badge" style="background:${gradeColor(sub.grade)}">${sub.grade}</span><div><b>${esc(sub.name)}</b><br><small class="muted">${pts(sub.trustScore)} / 100 · ${esc(gradeFor(sub.trustScore).meaning)}</small></div></div>
        <table style="margin-top:10px"><tbody>
          <tr><td>Strongest area</td><td class="num">${esc(ranked[0].d.short)}</td></tr>
          <tr><td>Weakest area</td><td class="num">${esc(ranked[ranked.length - 1].d.short)}</td></tr>
          <tr><td>Answers with sealed proof</td><td class="num">${sub.evidence.crypto}</td></tr>
          <tr><td>Answers backed by documents</td><td class="num">${sub.evidence.document}</td></tr>
          <tr><td>Valid until</td><td class="num">${fmtDate(vc.validUntil)}</td></tr>
          <tr><td>Next re-check</td><td class="num">${fmtDate(sub.nextReview)}</td></tr>
        </tbody></table>
        <p class="cite" style="margin-top:8px">The Passport describes how the company manages its AI. Decisions based on it are made by the reader.</p></div>` : ""}
    </aside>
  </div>`;
}

// ---------------- BANK VIEW ----------------
async function bank() {
  const chain = await ledger.getChain();
  const rows = S.passports.map(p => {
    const ev = chain.filter(b => b.ref === p.id);
    return { p, revoked: ev.some(b => b.type === "REVOKE"), checks: ev.filter(b => b.type === "VERIFY").length };
  });
  const valid = rows.filter(r => !r.revoked).length;
  return `
  <div class="page-head"><div class="eyebrow">Partner bank view</div><h1>Passports you have issued</h1>
  <p class="lead">The partner bank's team sees every Passport it issued, when each is due for a re-check, and any that were withdrawn.</p></div>
  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi">${rows.length}</div><div class="kpi-label">Passports issued</div></div>
    <div class="card"><div class="kpi" style="color:var(--ok)">${valid}</div><div class="kpi-label">Valid</div></div>
    <div class="card"><div class="kpi" style="color:var(--red)">${rows.length - valid}</div><div class="kpi-label">Withdrawn</div></div>
    <div class="card"><div class="kpi">${chain.filter(b => b.type === "VERIFY").length}</div><div class="kpi-label">Times checked</div></div>
  </div>
  <div class="card" style="margin-bottom:18px"><h3>All Passports</h3>
    ${rows.length ? `<table><thead><tr><th>Company</th><th>Grade</th><th class="num">Score</th><th>Issued</th><th>Next re-check</th><th>Status</th><th class="num">Checks</th><th></th></tr></thead><tbody>
    ${rows.map(({ p, revoked, checks }) => { const s = p.vc.credentialSubject; return `<tr><td><b>${esc(p.company)}</b></td>
      <td><span class="pill" style="background:${gradeColor(s.grade)};color:#fff">${s.grade}</span></td><td class="num">${pts(s.trustScore)}</td>
      <td>${fmtDate(p.issuedAt)}</td><td>${fmtDate(s.nextReview)}</td>
      <td>${revoked ? `<span class="pill fail">Withdrawn</span>` : `<span class="pill ok">Valid</span>`}</td><td class="num">${checks}</td>
      <td><a class="btn small" href="${esc(verifyLink(p.payload))}">Check</a></td></tr>`; }).join("")}
    </tbody></table>` : `<p class="muted">No Passports issued yet. <a href="#/scan">Start a check</a>.</p>`}</div>
  <div class="card"><h3>Check a Passport someone sent you</h3><div class="row"><input type="text" id="paste-link" placeholder="Paste the TrustPass link here"><button class="btn primary" data-act="verify-paste">Check</button></div></div>`;
}

// ---------------- AUDIT LOG ----------------
async function ledgerView() {
  const chain = await ledger.getChain();
  const status = await ledger.verifyChain();
  const labels = { GENESIS: "Log started", ISSUE: "Passport issued", VERIFY: "Passport checked", REVOKE: "Passport withdrawn" };
  const colors = { GENESIS: "#8792a6", ISSUE: "var(--teal)", VERIFY: "var(--navy)", REVOKE: "var(--red)" };
  return `
  <div class="page-head"><div class="eyebrow">Audit log</div><h1>A record nobody can secretly change</h1>
  <p class="lead">Every time a Passport is issued, checked or withdrawn, a new entry is added. Each entry includes a fingerprint of the one before it, like links in a chain. If anyone edits an old entry, the chain breaks and everyone can see where.</p></div>
  <div class="card" style="margin-bottom:18px"><div class="spread">
    <div>${status.ok ? `<span class="pill ok">Chain intact · ${status.length} entries</span>` : `<span class="pill fail">Chain broken at entry #${status.brokenAt}: someone changed it</span>`}</div>
    <div class="row"><button class="btn" data-act="verify-chain">Check the chain again</button><button class="btn danger" data-act="tamper">Try it: secretly edit an entry</button><button class="btn danger" data-act="reset">Reset all demo data</button></div></div>
    <p class="cite" style="margin-top:8px">Only fingerprints and event details are stored here, never answers, files or personal data.</p></div>
  <div style="max-width:760px;margin:0 auto">
    ${chain.slice().reverse().map((b, i, arr) => `
      <div class="block ${!status.ok && b.index >= status.brokenAt ? "broken" : ""}">
        <div class="spread"><b style="color:${colors[b.type] || "inherit"}">#${b.index} · ${labels[b.type] || b.type}</b><span class="muted">${new Date(b.ts).toLocaleString("en-GB")}</span></div>
        ${b.data?.grade ? `<div>Grade ${esc(b.data.grade)} · score ${esc(b.data.trustScore)}${b.data.tampered ? " ← edited" : ""}</div>` : ""}
        ${b.data?.reason ? `<div>Reason: ${esc(b.data.reason)}</div>` : ""}
        ${b.data?.result ? `<div>Result: ${esc(b.data.result)}</div>` : ""}
        <div class="muted">fingerprint ${esc(short(b.hash, 16))} · links to ${esc(short(b.prev, 16))}</div>
      </div>${i < arr.length - 1 ? `<div class="chain-link">⛓</div>` : ""}`).join("")}
  </div>`;
}

// ---------------- HOW IT WORKS ----------------
function tech() {
  const L = (name, boxes) => `<div class="layer"><div class="lname">${name}</div><div class="boxes">${boxes.map(([t, d]) => `<div class="box"><b>${t}</b>${d}</div>`).join("")}</div></div>`;
  return `
  <div class="page-head"><div class="eyebrow">Under the hood</div><h1>How TrustPass works</h1>
  <p class="lead">Everything below runs in this prototype, inside your browser, with no server and no data leaving your device.</p></div>
  <div class="card" style="margin-bottom:18px"><h3>Who does what</h3>
    <div class="grid g4" style="gap:12px">
      <div class="callout"><b>TrustPass</b><br>Builds and runs the software</div>
      <div class="callout violet"><b>Partner bank</b><br>Reviews, signs and withdraws Passports</div>
      <div class="callout"><b>Start-up</b><br>Owns its Passport and decides who sees it</div>
      <div class="callout warn"><b>Banks, investors, clients</b><br>Check it only if the start-up shares it</div>
    </div>
    <p class="cite" style="margin-top:10px">TrustPass assesses AI governance only. It uses no financial data and makes no statement about a company's ability to repay debt.</p></div>
  <div class="card" style="margin-bottom:18px"><div class="arch">
    ${L("Screens", [["Start-up app", "Answer, prove, fix, share"], ["Partner bank view", "Issued Passports and re-checks"], ["Share link / QR", "Anyone can check, no app needed"]])}
    ${L("Features", [["Trust Scan", "20 questions, 6 areas"], ["AI auto-fill", "Reads your documents"], ["Proof vault", "Fingerprints, not files"], ["Action plan", "Steps for every gap"]])}
    ${L("AI engine", [["Document Agent", "Finds evidence sentences (BM25)"], ["Rule-mapping Agent", `Cites ${CLAUSES.length} HK rule summaries`], ["Scoring model", "Transparent, explainable points"], ["Checking Agent", "Catches \"not yet\" and contradictions"]])}
    ${L("Trust layer", [["Digital signature", "ECDSA P-256 (Web Crypto)"], ["W3C Verifiable Credential", "Open international format"], ["Merkle tree", "Share single answers safely"], ["Audit log", "Tamper-evident hash chain"]])}
  </div></div>
  <div class="card" style="margin-bottom:18px"><h3>Prototype today, production tomorrow</h3>
    <table><thead><tr><th>Part</th><th>In this prototype</th><th>In production</th></tr></thead><tbody>
      <tr><td>Reading documents</td><td>Search-engine-style matching (BM25), in the browser, .txt files</td><td>A privately hosted AI model that reads PDFs, slides and screenshots</td></tr>
      <tr><td>Citing rules</td><td>Short paraphrased rule summaries</td><td>Full rule texts with citation checks, maintained by compliance staff</td></tr>
      <tr><td>Double-checking</td><td>Rules that catch "not yet", weak matches and contradictions</td><td>A second AI model re-checks every finding, plus human review</td></tr>
      <tr><td>Private proof</td><td>Fingerprints (salted SHA-256) and Merkle proofs</td><td>Zero-knowledge proofs generated in a secure enclave</td></tr>
      <tr><td>Signing key</td><td>A demo key in the code (clearly labelled)</td><td>Held in the bank's hardware security module</td></tr>
      <tr><td>Audit log</td><td>One copy per browser</td><td>Shared by partner banks (permissioned blockchain)</td></tr>
    </tbody></table></div>
  <div class="grid g2">
    <div class="card"><h3>Design rules</h3><ul>
      <li><b>Private:</b> prove things without handing over the files behind them</li>
      <li><b>People decide:</b> AI suggests, a person approves every Passport</li>
      <li><b>Local:</b> built on HKMA, SFC and PCPD guidance</li>
      <li><b>Fair:</b> firms without AI agents aren't marked down for agent questions</li>
      <li><b>Governance only:</b> no financial data, no credit opinion</li></ul></div>
    <div class="card"><h3>Tested</h3><p class="muted">Automated tests cover the scoring, the AI agents (including catching "we have not yet…"), the suggested answers, fingerprints and Merkle proofs, forged signatures, expiry, withdrawal and audit-log tampering.</p><p><code>node run-tests.mjs</code></p></div>
  </div>`;
}

// ---------------- PRIVACY ----------------
function privacy() {
  return `
  <article class="policy">
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: 15 November 2026</p>
    <p>This Privacy Policy explains how TrustPass ("we", "us" or "our") handles information when you use the TrustPass website (the "Service"). By using the Service, you agree to the practices described below.</p>
    <h2>1. Information we collect</h2>
    <p>We do not ask you to create an account, and we do not collect your name, email address or other contact details.</p>
    <p>When you use the Service, you may enter your company name, answer questions, paste or upload policy documents, and attach proof files. Documents and proof files are read within your web browser and are not transmitted to us. For proof files, the Service keeps only a digital fingerprint (a cryptographic hash), not the file itself.</p>
    <h2>2. How we use information</h2>
    <p>Information you enter is used solely to provide the Service, namely to suggest answers, calculate results, prepare an action plan and issue a Passport. We do not use it for marketing, profiling or the training of any artificial intelligence model.</p>
    <h2>3. Storage and retention</h2>
    <p>Your answers, file fingerprints, Passports and audit log are stored in your browser's local storage on your device so that they remain available when you return. They are kept until you delete them, which you may do at any time by clearing your browser's site data.</p>
    <h2>4. Sharing a Passport</h2>
    <p>When you share a Passport link or QR code, the recipient can see the results you chose to disclose and proof that the Passport is genuine. They cannot see your documents or proof files. You decide what to share and with whom.</p>
    <h2>5. Disclosure of information</h2>
    <p>We do not sell, rent, share or transfer your information to any third party, whether in Hong Kong or elsewhere.</p>
    <h2>6. Cookies and analytics</h2>
    <p>The Service does not use cookies, analytics tools, advertising technologies or third-party tracking scripts.</p>
    <h2>7. Hosting</h2>
    <p>The Service is hosted on GitHub Pages. GitHub may automatically collect limited technical information, such as IP addresses, in accordance with the GitHub Privacy Statement. We do not have access to this information.</p>
    <h2>8. Security</h2>
    <p>The Service is delivered over an encrypted HTTPS connection. Passports are digitally signed so that changes can be detected. As information is stored on your device, you are responsible for securing access to that device.</p>
    <h2>9. Your rights</h2>
    <p>Under the Personal Data (Privacy) Ordinance (Cap. 486), you may request access to, and correction of, personal data held about you. As we do not hold your information, you may view, correct or delete it directly within the Service.</p>
    <h2>10. Disclaimer</h2>
    <p>The Service is a prototype developed for BUHack 2.0 for demonstration purposes only. NovaPay and the partner bank shown are fictional. Summaries of laws and regulatory guidance are provided for reference only and do not constitute legal advice. A Passport assesses AI governance only and is not a credit rating.</p>
    <h2>11. Changes to this policy</h2>
    <p>We may update this Privacy Policy from time to time. The updated version will be indicated by the "Last updated" date above.</p>
    <h2>12. Contact us</h2>
    <p>If you have any questions about this Privacy Policy, please contact the TrustPass team through our GitHub repository.</p>
  </article>`;
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
    case "start": readCompany(); if (!S.company) return toast("Enter your company name first"); go("scan"); break;
    case "preset": loadPreset(el.dataset.p); break;
    case "go": readCompany(); go(el.dataset.r); break;
    case "answer": {
      S.answers[el.dataset.q] = el.dataset.v; save();
      document.getElementById("row-" + el.dataset.q).outerHTML = questionRow(questionById[el.dataset.q]);
      document.getElementById("scan-side").innerHTML = scanSide(result());
      break;
    }
    case "sample-policy": {
      const t = await fetch("novapay-ai-policy.txt").then(r => r.text()).catch(() => "");
      document.getElementById("policy-text").value = t; S.policyText = t; save(); toast("Sample policy loaded. Now click \"Read my document\""); break;
    }
    case "run-engine": runEngine(); break;
    case "accept": case "ignore": {
      if (act === "accept") applySuggestion(el.dataset.kind, el.dataset.q);
      else { const run = S.docRun; const it = (el.dataset.kind === "found" ? run.found : run.gaps).find(x => x.qid === el.dataset.q); if (it) it.status = "ignored"; }
      save(); await render(); document.getElementById("autofill")?.scrollIntoView({ block: "start" });
      break;
    }
    case "accept-all": {
      const before = result().total;
      for (const f of S.docRun.found) if (f.action !== "none" && !f.status) applySuggestion("found", f.qid);
      for (const g of S.docRun.gaps) if (g.action !== "none" && !g.status) applySuggestion("gap", g.qid);
      save(); await render(); toast(`Answers filled in · score ${pts(before)} → ${pts(result().total)}`);
      break;
    }
    case "prove-threshold": proveThreshold(el.dataset.q, document.getElementById("th-" + el.dataset.q).value); break;
    case "demo-proofs": demoProofs(); break;
    case "approve": el.disabled = true; approve(); break;
    case "copy": navigator.clipboard?.writeText(el.dataset.text).then(() => toast("Link copied"), () => toast("Couldn't copy. Select the link manually")); break;
    case "disclose": disclose(); break;
    case "revoke": await revokePassport(S.passports[0].id, "Re-check found a control no longer in place (demo)"); toast("Passport withdrawn. Scanning it now shows \"No longer valid\""); render(); break;
    case "verify-paste": {
      const v = document.getElementById("paste-link").value.trim();
      const i = v.indexOf("#/verify?");
      if (i < 0) return toast("That isn't a TrustPass link");
      location.hash = v.slice(i); break;
    }
    case "verify-chain": render(); toast("Chain checked"); break;
    case "tamper": await ledger.tamper(); toast("An old entry was secretly changed to grade A, score 99.9"); render(); break;
    case "reset":
      if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Click again to clear everything"; setTimeout(() => { el.dataset.armed = ""; el.textContent = "Reset all demo data"; }, 4000); break; }
      ledger.reset(); S = fresh(); save(); toast("Demo data cleared"); go(""); break;
  }
});

function loadPreset(which) {
  S.company = NOVAPAY.company; S.docRun = null; S.policyText = "";
  const d1 = computeScore(NOVAPAY.day1, {});
  S.baseline = { label: "First check", values: d1.domains.map(d => d.pct), total: d1.total };
  if (which === "day1") { S.answers = { ...NOVAPAY.day1 }; S.evidence = {}; }
  else {
    S.answers = { ...NOVAPAY.month6 }; S.evidence = {};
    NOVAPAY.month6Docs.forEach(q => S.evidence[q] = { level: "document" });
    NOVAPAY.month6Crypto.forEach(q => S.evidence[q] = { level: "crypto", hash: "demo-" + q, claim: "Sample proof (demo)" });
  }
  save();
  if (location.hash === "#/results") render(); else go("results");
}

render();
