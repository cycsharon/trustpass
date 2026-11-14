// The Trust Scan AI engine: small agents, each with one job, so every step can be
// tested and explained on its own.
//
//   1. Document Agent      - reads an uploaded policy and extracts evidence sentences
//   2. Rule-mapping Agent  - retrieves the HK rule clauses that apply to each control (BM25)
//   3. Scoring Model       - see scoring.js
//   4. Checking Agent      - "AI checks AI": rejects weak evidence, flags contradictions
//   5. Human sign-off      - an analyst must approve before a Passport is issued (app.js)
//
// Everything runs locally in the browser: documents never leave the device.

import { BM25, splitSentences, tokenize } from "./bm25.js";
import { QUESTIONS, CLAUSES, DOMAIN_SOURCES, SOURCES, questionById } from "./rules.js";

// ---------- 1. Document Agent ----------
const MIN_SCORE = 3.0;
const MIN_TERMS = 2;
// Words too common in AI policies to count as evidence on their own.
const GENERIC = new Set(tokenize("ai data personal customer customers model models decision decisions log system systems use uses each"));

export function documentAgent(text) {
  const sentences = splitSentences(text);
  if (!sentences.length) return { sentences: 0, findings: [] };
  const index = new BM25(sentences);
  const findings = [];
  for (const q of QUESTIONS) {
    const hits = index.search(q.text + " " + q.keywords, 1);
    const h = hits[0];
    if (!h) continue;
    const qTerms = new Set(tokenize(q.keywords));
    const keyHits = h.matched.filter(t => qTerms.has(t) && !GENERIC.has(t));
    if (h.score >= MIN_SCORE && keyHits.length >= MIN_TERMS) {
      findings.push({
        qid: q.id, sentence: sentences[h.index], sentenceIndex: h.index,
        score: Math.round(h.score * 10) / 10, matched: keyHits,
        confidence: Math.min(0.99, Math.round((0.45 + 0.07 * keyHits.length + 0.03 * h.score) * 100) / 100),
      });
    }
  }
  return { sentences: sentences.length, findings };
}

// ---------- 2. Rule-mapping Agent ----------
const clauseIndex = new BM25(CLAUSES.map(c => `${c.title} ${c.text} ${c.tags}`));

export function ruleMappingAgent(qid, k = 2) {
  const q = questionById[qid];
  const allowed = new Set(DOMAIN_SOURCES[q.domain]);
  return clauseIndex.search(q.text + " " + q.keywords, CLAUSES.length)
    .filter(h => allowed.has(CLAUSES[h.index].src))
    .slice(0, k)
    .map(h => ({ ...CLAUSES[h.index], source: SOURCES[CLAUSES[h.index].src], relevance: Math.round(h.score * 10) / 10 }));
}

// ---------- 4. Checking Agent ----------
const NEGATION = /\b(not yet|yet to|do not|does not|don't|doesn't|have not|has not|haven't|hasn't|never|no longer|plan(?:s|ned)? to|intend(?:s|ed)? to|will (?:introduce|start|begin|launch|set up)|pending|currently no|is being drafted|under development)\b/i;
const PROHIBITION = /\b(not (?:permitted|allowed)|must not|may not|shall not|prohibit\w*|forbid\w*|never (?:used|shared|kept))\b/i;
const PROHIBITION_OK = new Set(["q5", "q6"]); // questions where a prohibition IS the control

export function checkEvidence(finding) {
  const s = finding.sentence;
  if (PROHIBITION_OK.has(finding.qid) && PROHIBITION.test(s)) return { ok: true };
  const m = s.match(NEGATION);
  if (m) return { ok: false, reason: `Sentence says "${m[0]}": it describes a gap or a future plan, not a control in place.` };
  if (finding.confidence < 0.6) return { ok: false, reason: "Match too weak to count as evidence." };
  return { ok: true };
}

const CONSISTENCY = [
  { if: ["q13", "yes"], and: ["q15", "no"], msg: "AI agents have limits (Q13) but cannot be switched off (Q15). Check the agent controls." },
  { if: ["q8", "yes"], and: ["q7", "no"], msg: "Bias testing is claimed (Q8) but no accuracy testing before launch (Q7). Testing claims may be overstated." },
  { if: ["q20", "yes"], and: ["q19", "no"], msg: "The breach plan covers AI (Q20) but no AI incident log exists (Q19). How would incidents be detected?" },
  { if: ["q5", "yes"], and: ["q10", "no"], msg: "Supplier contracts ban training (Q5) but suppliers are not checked before signing (Q10)." },
  { if: ["q14", "yes"], and: ["q1", "no"], msg: "Human review is claimed (Q14) but no one is accountable for the AI system (Q1)." },
  { if: ["q18", "yes"], and: ["q9", "no"], msg: "Decisions can be explained (Q18) but the model is not monitored (Q9). Explanations may go stale as the model drifts." },
];

export function checkingAgent(answers, evidence) {
  const flags = [];
  for (const r of CONSISTENCY) {
    if (answers[r.if[0]] === r.if[1] && answers[r.and[0]] === r.and[1]) flags.push({ type: "contradiction", qids: [r.if[0], r.and[0]], msg: r.msg });
  }
  const unproven = QUESTIONS.filter(q => ["gov", "data", "model"].includes(q.domain) && answers[q.id] === "yes" && (evidence[q.id]?.level || "self") === "self");
  if (unproven.length) flags.push({ type: "unverified", qids: unproven.map(q => q.id), msg: `${unproven.length} high-weight "Yes" answers have no evidence yet. They count at 60% until backed by documents or proofs.` });
  const unanswered = QUESTIONS.filter(q => !answers[q.id]);
  if (unanswered.length) flags.push({ type: "incomplete", qids: unanswered.map(q => q.id), msg: `${unanswered.length} questions unanswered. They are scored as "No".` });
  for (const [qid, e] of Object.entries(evidence)) {
    if (e?.rejected) flags.push({ type: "rejected-evidence", qids: [qid], msg: `Evidence for ${qid.toUpperCase()} rejected: ${e.rejected}` });
  }
  return flags;
}

// ---------- Full pipeline over an uploaded document ----------
export function runDocumentPipeline(text, answers, evidence) {
  const t = [performance.now()];
  const doc = documentAgent(text); t.push(performance.now());
  const mapped = doc.findings.map(f => ({ ...f, rules: ruleMappingAgent(f.qid) })); t.push(performance.now());
  const checked = mapped.map(f => ({ ...f, check: checkEvidence(f) })); t.push(performance.now());

  const updates = {};
  const suggestions = [];
  for (const f of checked) {
    const a = answers[f.qid];
    const cur = evidence[f.qid]?.level || "self";
    if (!f.check.ok) { updates[f.qid] = { ...(evidence[f.qid] || {}), rejected: f.check.reason }; continue; }
    if (a === "yes" || a === "partly") {
      if (cur === "self") updates[f.qid] = { level: "document", source: "Policy document", citation: f.sentence, confidence: f.confidence };
    } else {
      suggestions.push({ qid: f.qid, sentence: f.sentence, msg: `Your document suggests this control exists, but you answered "${a || "unanswered"}". Review your answer.` });
    }
  }
  const ms = i => Math.max(1, Math.round(t[i + 1] - t[i]));
  return {
    sentences: doc.sentences, findings: checked, updates, suggestions,
    timings: { read: ms(0), retrieve: ms(1), check: ms(2) },
  };
}
