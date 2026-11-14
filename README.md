# TrustPass: an AI Trust Passport for Hong Kong's tech start-ups

> **Prove your AI is safe. Borrow for less.**
> TrustPass scans a start-up's AI governance against Hong Kong rules, lets it prove its controls **without sharing the data behind them**, and issues a bank-signed **AI Trust Passport** that any bank or investor can verify in seconds. A better grade means a cheaper loan.

**Live demo:** `https://<your-github-username>.github.io/<repo-name>/`
**Theme:** FinTech · **Track:** Tertiary · **Built for:** BUHack 2.0 (13 to 15 Nov 2026)

---

## The problem

- Nearly every young tech company in Hong Kong now builds on AI. In one survey, **73.1% of HK FinTechs** said they already use it.
- When one of these firms asks a bank for a loan or a partnership, the bank can't easily check whether the firm's AI, data and suppliers are under control, even though the **HKMA, SFC and PCPD** all expect that kind of oversight.
- So the start-up fills in a **140-question AI questionnaire**, hands over private data, waits weeks, and does it all again for the next bank.
- HKCERT handled **twice as many cyber incidents in 2025 as in 2023** (15,877). AI and data risk is credit risk, but today nobody prices it.

**Nothing on the market turns verified AI governance into better loan terms.**

## The solution: five steps

| Step | What happens | Where in the app |
|---|---|---|
| **1 Scan** | 20 questions across 6 domains, each mapped to an HKMA, SFC, PCPD, PDPO or ISO/IEC 42001 rule | `#/scan` |
| **2 Prove** | An in-browser AI engine reads your policy and cites the evidence; files are fingerprinted (SHA-256), never uploaded | `#/evidence` |
| **3 Score** | AI Trust Score 0 to 100, grade A to D, top-3 risks with a fix plan, a what-if simulator, and SHAP reason codes | `#/results` |
| **4 Sign-off** | *People decide*: an analyst reviews the Checking Agent's flags before anything is issued | `#/review` |
| **5 Passport** | W3C Verifiable Credential signed with ECDSA P-256, a QR code, selective disclosure and revocation | `#/passport` |
| **Bank view** | Verify in milliseconds: signature, validity, ledger anchor, revocation, Merkle proofs | `#/verify`, `#/bank` |
| **Credit** | Grade, then probability of default, then expected loss, then a margin step-down (grade A: −25 bp) | `#/credit` |

## Demo in 60 seconds

1. Open the live demo and click **NovaPay · Day 1**. Score **38.4 (D)**: answers from memory, nothing proven.
2. Go to **Prove**, click **Load NovaPay sample policy**, then **Run AI engine**. Twelve controls get document evidence with rule citations, and the Checking Agent **rejects** *"We have not yet run a red-team exercise"*. Score rises to about **53 (C)**.
3. Click **Demo: prove 3 key controls** to add cryptographic proofs. The score rises again.
4. **Sign-off**: tick the checks, enter an analyst name, and click **Approve & issue**.
5. **Passport**: scan the QR with a phone and the bank verification runs on the phone. Then click **Simulate failed re-check: revoke** and verify again: ✕ revoked.
6. **Ledger** → **Simulate tampering**: the hash chain shows exactly which block was altered.

## How it works

```
Channels      SME web app · Bank dashboard · Verify link / QR
Applications  Trust Scan · Evidence Vault · Trust Passport · Trust-Linked Credit
AI engine     Document Agent → Rule-mapping Agent → Scoring model → Checking Agent → Human sign-off
Trust layer   ECDSA P-256 signatures · W3C VC 2.0 · Merkle-tree selective disclosure · Hash-chain ledger
Data          Rule library (HKMA · SFC · PCPD · PDPO · ISO 42001) · 20-control question bank
```

**Everything runs in the browser.** There is no server, no API key and no tracking, and no document leaves the device.

### The AI engine (`js/agents.js`, `js/bm25.js`)
- **Document Agent:** splits a policy into sentences and ranks them against each of the 20 controls with **Okapi BM25** (a custom tokeniser and stemmer, with generic words filtered out). A match must hit at least two distinctive terms.
- **Rule-mapping Agent:** BM25 retrieval over a library of 25 paraphrased HK rule clauses, **constrained to the regulators mapped to that domain**, so every finding cites a source.
- **Checking Agent ("AI checks AI"):** rejects evidence that describes a gap or a future plan ("not yet", "planned to"), while correctly accepting prohibitions such as "suppliers are *not permitted* to train on our data". It also flags contradictions (e.g. agents have limits but no kill switch) and unverified high-weight claims.
- **Human sign-off:** no Passport is issued without an analyst approving it.

### The scoring model (`js/scoring.js`)
```
AI Trust Score = Σ_d  weight_d × raw score_d × evidence factor_d
```
- Six domains: Governance 20%, Data & privacy 20%, Model risk 20%, Cyber & third party 15%, Human oversight 15%, Transparency 10%.
- Evidence factor: **0.60** self-declared · **0.85** backed by documents · **1.00** proven cryptographically. Proving things is worth points, which makes the score harder to game.
- Grades: **A** ≥ 80 · **B** 65 to 79 · **C** 50 to 64 · **D** < 50.
- **Explainability:** the model is additive, so each control's contribution is exactly its **Shapley (SHAP) value** against an all-"No" baseline. The app shows these as reason codes.
- **Fairness:** a firm with no AI agents answers "No agents" (N/A) and isn't penalised for controls that don't apply.

### The trust layer (`js/crypto.js`, `js/credential.js`, `js/ledger.js`)
- **Passport = W3C Verifiable Credential 2.0**, signed by the issuing bank with **ECDSA P-256** (Web Crypto API) over JCS-style canonical JSON.
- **Proving without sharing:** every control answer is sealed as a **salted SHA-256 commitment**. All 20 commitments form a **Merkle tree** and only the root goes into the signed Passport. The SME can later reveal chosen controls with Merkle inclusion proofs. The bank can check them, but learns nothing about the rest.
- **Threshold proofs:** for "fairness ratio ≥ 0.8" the SME commits to the measured value; the Passport records only *PASS*.
- **Ledger:** a hash-chained log of every ISSUE, VERIFY and REVOKE event. It stores only hashes and event data, never personal data. Editing any past block breaks the chain, and the app shows where.
- **QR codes:** the credential is compressed (deflate) and sent in a compact form, so the whole signed Passport fits in a QR code. No server lookup is needed to check the signature.

### Trust-Linked Credit (`js/scoring.js → creditTerms`)
```
Expected loss = PD × LGD × Exposure     base PD 3.0% · LGD 45% · PD multiplier A 0.80, B 0.90, C 1.00, D 1.15
```
On a HK$3M facility, grade A lowers the bank's expected loss by **HK$8,100 a year**. **HK$7,500** of that is passed to the SME as a 25 bp margin cut, and the bank keeps HK$600 as a buffer.

## Prototype today, production tomorrow

| Component | In this prototype | Production design |
|---|---|---|
| Document reading | BM25 retrieval, in-browser | Multimodal LLM agent in a private HK cloud |
| Rule mapping | BM25 over paraphrased clauses | Hybrid BM25 + vector search over full rule texts |
| Scoring | Transparent additive model, exact Shapley values | Rules + gradient-boosted model with SHAP |
| AI checks AI | Rule-based negation and contradiction checker | Second LLM re-checks every finding |
| Proving without sharing | Salted commitments + Merkle proofs | zk-SNARK proofs in a trusted execution environment |
| Issuer key | Demo key in the code (clearly labelled) | Hardware security module (HSM) |
| Ledger | One hash-chain node per browser | Permissioned blockchain shared by partner banks |

## Run it

It's a static site, so there's nothing to install.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root.
- **Locally:** `python3 -m http.server 8000`, then open `http://localhost:8000`. ES modules don't load from `file://`.
- **Tests (Node 18+):** `node tests/run-tests.mjs`. 34 tests cover the scoring formula, the credit maths, the agents, Merkle proofs, forged signatures, expiry, revocation and ledger tampering.

## Project structure

```
index.html              App shell
css/style.css           Styles
js/app.js               Views, routing, interactions
js/config.js            Weights, grades, credit assumptions, issuer registry
js/rules.js             HK rule-clause library + 20-control question bank
js/bm25.js              Tokeniser, stemmer, BM25 ranking
js/agents.js            Document, Rule-mapping and Checking agents
js/scoring.js           AI Trust Score, Shapley reason codes, what-if, credit terms
js/crypto.js            SHA-256, ECDSA, commitments, Merkle tree, compression
js/credential.js        Issue / verify / disclose / revoke Passports
js/ledger.js            Hash-chained audit ledger
js/charts.js            Dependency-free SVG charts
js/presets.js           Demo company (NovaPay Ltd, fictional)
js/vendor/qrcode.js     QR encoder (MIT, Kazuhiko Arase), bundled for offline use
samples/                Sample AI policy for the demo
tests/run-tests.mjs     Automated tests
```

## Notes

- NovaPay Ltd is fictional. Rule summaries are short paraphrases written for this prototype. They are **not legal text or legal advice**.
- The issuer private key in `js/config.js` is a **demo key**, included so the prototype can issue credentials without a server.
- Built from scratch during the BUHack 2.0 hacking window (from 10:00, 13 Nov 2026).

## License
MIT. See `LICENSE`. Bundled QR encoder © 2009 Kazuhiko Arase, MIT license.
