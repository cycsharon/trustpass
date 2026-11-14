// AI Trust Score engine.
//
//   AI Trust Score = sum over domains d of ( weight_d x raw score_d x evidence factor_d )
//
// Implemented per control: each of the n_d answered controls in a domain carries
// weight_d / n_d points, scaled by its answer (Yes 100 / Partly 50 / No 0) and its
// evidence factor (0.60 self-declared, 0.85 documents, 1.00 cryptographic proof).
// Because the model is additive, each control's contribution is exactly its
// Shapley value relative to an all-"No" baseline - the "SHAP reason codes".

import { DOMAINS, ANSWER_SCORES, EVIDENCE, GRADES, CREDIT } from "./config.js";
import { QUESTIONS } from "./rules.js";

const round1 = x => Math.round(x * 10) / 10;

export function gradeFor(score) {
  return GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1];
}

export function computeScore(answers = {}, evidence = {}) {
  const domains = [];
  const controls = [];
  let total = 0, answered = 0;

  for (const d of DOMAINS) {
    const qs = QUESTIONS.filter(q => q.domain === d.key);
    const applicable = qs.filter(q => answers[q.id] !== "na");
    const n = Math.max(1, applicable.length);
    const unit = d.weight / n; // points available per control
    let points = 0, rawSum = 0, rawEvidence = 0;

    for (const q of qs) {
      const a = answers[q.id];
      if (a === "na") {
        controls.push({ qid: q.id, domain: d.key, na: true, contribution: 0, max: 0, gap: 0 });
        continue;
      }
      if (a) answered++;
      const raw = ANSWER_SCORES[a] ?? 0;
      const level = evidence[q.id]?.level || "self";
      const ef = EVIDENCE[level].factor;
      const c = unit * (raw / 100) * ef;
      points += c; rawSum += raw; rawEvidence += raw * ef;
      controls.push({
        qid: q.id, domain: d.key, answer: a || null, raw, level, ef,
        contribution: c, max: unit, gap: unit - c,
        gainIfDocumented: Math.max(0, unit * 0.85 - c),
      });
    }

    const raw = rawSum / n;
    domains.push({
      key: d.key, name: d.name, short: d.short, weight: d.weight, color: d.color,
      raw: round1(raw),
      evidenceFactor: rawSum ? Math.round((rawEvidence / rawSum) * 100) / 100 : EVIDENCE.self.factor,
      points: round1(points), max: d.weight,
      pct: Math.round((points / d.weight) * 100),
    });
    total += points;
  }

  total = round1(total);
  const g = gradeFor(total);
  const evidenceMix = { self: 0, document: 0, crypto: 0 };
  for (const c of controls) if (!c.na && c.answer && c.answer !== "no") evidenceMix[c.level]++;

  return {
    total, grade: g.grade, gradeInfo: g, domains, controls,
    answered, applicable: controls.filter(c => !c.na).length, evidenceMix,
  };
}

// Top risks = controls with the most points left on the table.
export function topRisks(result, k = 3) {
  return result.controls.filter(c => !c.na && c.gap > 0.01)
    .sort((a, b) => b.gap - a.gap || a.qid.localeCompare(b.qid))
    .slice(0, k);
}

// What-if: score after fixing a set of controls (answer Yes, evidence at given level).
export function simulateFixes(answers, evidence, qids, level = "document") {
  const a = { ...answers }, e = { ...evidence };
  for (const id of qids) {
    a[id] = "yes";
    const cur = e[id]?.level || "self";
    if (EVIDENCE[level].factor > EVIDENCE[cur].factor) e[id] = { ...(e[id] || {}), level };
  }
  return computeScore(a, e);
}

// Trust-Linked Credit: expected loss = PD x LGD x exposure.
export function creditTerms(grade, facility = 3_000_000) {
  const gInfo = GRADES.find(g => g.grade === grade) || GRADES[2];
  const c = GRADES.find(g => g.grade === "C");
  const pd = CREDIT.basePD * gInfo.pdMult;
  const elBp = pd * CREDIT.lgd * 10000;
  const elBpC = CREDIT.basePD * c.pdMult * CREDIT.lgd * 10000;
  const elHkd = facility * pd * CREDIT.lgd;
  const elHkdC = facility * CREDIT.basePD * CREDIT.lgd;
  const marginBp = gInfo.marginBp;
  const smeSaving = marginBp ? -marginBp / 10000 * facility : 0;
  return {
    grade, pd, elBp: round1(elBp), elSavingBp: round1(elBpC - elBp),
    elHkd: Math.round(elHkd), bankElSaving: Math.round(elHkdC - elHkd),
    marginBp, smeSaving: Math.round(smeSaving),
    bankBuffer: Math.round(elHkdC - elHkd - smeSaving),
    eligible: marginBp != null,
  };
}
