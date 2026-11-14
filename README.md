# TrustPass: an AI Trust Passport for Hong Kong's tech start-ups

> **Prove your AI is safe, without handing over your data.**
> TrustPass checks a start-up's AI governance against Hong Kong rules in about 15 minutes, gives it a step-by-step action plan for every gap, lets it prove its answers **without uploading its files**, and issues a bank-signed **AI Trust Passport** it can share with banks, investors and clients in one link.

**Live demo:** https://cycsharon.github.io/trustpass/
**Theme:** FinTech · **Track:** Tertiary · **Built for:** BUHack 2.0 (13–15 Nov 2026)

---

## The problem

- Nearly every young tech company in Hong Kong now builds on AI: **73.1% of surveyed HK FinTechs** already use it.
- Banks, investors and large clients all need to know the company's AI is under control, which the **HKMA, SFC and PCPD** expect them to check.
- So start-ups fill in long AI questionnaires (often **140 questions**), hand over private documents, and repeat it for every bank, investor and client.
- HKCERT handled **twice as many cyber incidents in 2025 as in 2023** (15,877). AI and data risk keeps growing, but there is no simple, trusted way to show you manage it.

## The solution

| Step | What the start-up does | In the app |
|---|---|---|
| **1 Answer** | 20 yes/partly/no questions in 6 areas, each linked to an HK rule, **or upload a policy and let the AI suggest the answers** (with the quote it found) | `#/scan` |
| **2 Prove** | Attach proof files. The browser makes a fingerprint (SHA-256); **the file is never uploaded** | `#/evidence` |
| **3 Results** | Score 0–100, grade A–D, and a **full action plan**: steps, effort, what to keep as proof, and the HK rule, for every gap | `#/results` |
| **4 Review** | A person at the partner bank checks the answers and the AI's flags, then approves | `#/review` |
| **5 Passport** | A signed Passport with a QR code. Share all of it, or prove just selected answers | `#/passport` |
| **Check** | Anyone the start-up shares with sees in milliseconds whether it's genuine, valid and not withdrawn | `#/verify` |

**Who does what:** TrustPass builds and runs the software · the **partner bank** reviews and signs Passports · the **start-up** owns its Passport and decides who sees it · banks, investors and clients only see it if the start-up shares it.

**Scope:** TrustPass assesses **AI governance only**. It uses no financial data and makes no statement about a company's creditworthiness.

## Demo in 60 seconds

1. Click **NovaPay · first check**: 38.4, grade D, with an action plan.
2. Or start fresh: enter a company name, then in step 1 click **Use NovaPay's sample policy → Read my document → Accept all**. The AI fills in 12 answers with quotes and catches *"We have not yet run a red-team exercise"* as a gap.
3. **Prove:** enter a measured value (e.g. 98% human review) and click **Seal result**, or attach any file as proof.
4. **Results:** open each action-plan item for the steps.
5. **Review → Approve → Passport:** scan the QR code with a phone, or tick a few answers and create a link that shows only those.
6. Click **Try it: simulate a failed re-check**: the Passport is withdrawn and every check now shows "No longer valid".
7. **Audit log → Try it: secretly edit an entry**: the chain shows exactly which entry was changed.

## How it works

```
Screens       Start-up app · Partner bank view · Share link / QR
Features      Trust Scan · AI auto-fill · Proof vault · Action plan · Passport
AI engine     Document Agent → Rule-mapping Agent → Scoring model → Checking Agent → Human review
Trust layer   ECDSA P-256 signatures · W3C Verifiable Credential · Merkle-tree selective disclosure · Hash-chain audit log
Data          HK rule library (HKMA · SFC · PCPD · PDPO · ISO 42001) · 20 questions with step-by-step guidance
```

**Everything runs in the browser.** No server, no API key, no tracking; no document leaves the device.

### AI engine (`agents.js`, `bm25.js`)
- **Document Agent:** splits a document into sentences and ranks them against each of the 20 questions with **Okapi BM25** (custom tokeniser and stemmer; common words filtered out; a match needs at least two distinctive terms).
- **Rule-mapping Agent:** BM25 retrieval over 25 paraphrased HK rule summaries, **limited to the regulators relevant to that area**, so every suggestion cites a source.
- **Checking Agent ("AI checks AI"):** turns sentences like "not yet" or "planned for next year" into **gaps instead of evidence**, while accepting prohibitions such as "suppliers are *not permitted* to train on our data". It also flags contradictions between answers.
- **Suggestions, not decisions:** the AI only suggests answers; the user accepts or ignores each one, and a person reviews before any Passport is issued.

### Scoring (`scoring.js`)
```
Score = Σ over areas ( area weight × answer × proof level )
```
- Areas: Governance 20 · Data & privacy 20 · Model risk 20 · Cyber & third party 15 · Human oversight 15 · Transparency 10.
- Answer: Yes 100% · Partly 50% · No 0%. Proof: your word **60%** · document found **85%** · proof sealed **100%**.
- Grades: **A** ≥ 80 · **B** 65–79 · **C** 50–64 · **D** < 50.
- The model is additive, so every question's points are exact and explainable (they are its Shapley values).
- Firms without AI agents answer "We don't use AI agents" and aren't marked down.

### Trust layer (`crypto.js`, `credential.js`, `ledger.js`)
- **Passport = W3C Verifiable Credential**, signed by the partner bank with **ECDSA P-256** (Web Crypto API).
- **Private proof:** every answer is sealed as a **salted SHA-256 commitment**; the 20 commitments form a **Merkle tree** and only the root is signed. The start-up can later reveal chosen answers with a Merkle proof; nothing else is revealed.
- **Measured results** (e.g. "fairness ratio ≥ 0.8"): the start-up commits to the number; the Passport records only *pass*.
- **Withdrawal:** Passports are re-checked every 90 days. If a control stops being true, the bank withdraws the Passport and every later check fails.
- **Audit log:** a hash chain of every issue, check and withdrawal. Editing any past entry breaks the chain.

## Prototype today, production tomorrow

| Part | In this prototype | In production |
|---|---|---|
| Reading documents | BM25 matching in the browser (.txt) | Privately hosted AI model reading PDFs, slides and screenshots |
| Citing rules | Paraphrased rule summaries | Full rule texts with citation checks |
| Double-checking | Rule-based checker | Second AI model plus human review |
| Private proof | Salted commitments + Merkle proofs | Zero-knowledge proofs in a secure enclave |
| Signing key | Demo key in the code (clearly labelled) | Bank's hardware security module |
| Audit log | One copy per browser | Shared by partner banks (permissioned blockchain) |

## Run it

Static site, no installation.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root.
- **Locally:** `python3 -m http.server 8000`, then open `http://localhost:8000` (ES modules don't load from `file://`).
- **Tests (Node 18+):** `node run-tests.mjs` (34 tests: scoring, action plan, AI agents and suggestions, Merkle proofs, forged signatures, expiry, withdrawal, audit-log tampering).

## Files

```
index.html              App shell
style.css               Styles
app.js                  Screens and interactions
config.js               Area weights, grades, proof levels, partner bank registry
rules.js                HK rule library, 20 questions, step-by-step action-plan guidance
bm25.js                 Tokeniser, stemmer, BM25 ranking
agents.js               Document, Rule-mapping and Checking agents; answer suggestions
scoring.js              Score, action plan, what-if
crypto.js               SHA-256, ECDSA, commitments, Merkle tree, compression
credential.js           Issue / check / share / withdraw Passports
ledger.js               Hash-chain audit log
charts.js               SVG charts
presets.js              Demo company (NovaPay Ltd, fictional)
qrcode.js               QR encoder (MIT, Kazuhiko Arase)
novapay-ai-policy.txt   Sample AI policy for the demo
run-tests.mjs           Automated tests
```

## Notes

- NovaPay Ltd is fictional. Rule summaries are short paraphrases for this prototype, **not legal text or legal advice**.
- The private key in `config.js` is a **demo key** so the prototype can issue Passports without a server.
- Built from scratch during the BUHack 2.0 hacking window (from 10:00, 13 Nov 2026).

## License
MIT. See `LICENSE`. Bundled QR encoder © 2009 Kazuhiko Arase, MIT license.
