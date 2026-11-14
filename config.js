// TrustPass configuration.
// Change ISSUER_NAME to re-brand the issuing bank (e.g. for a bank-specific pitch).

export const APP_NAME = "TrustPass";
export const APP_TAGLINE = "An AI Trust Passport for Hong Kong's tech start-ups";

export const ISSUER = {
  id: "did:web:issuer.trustpass.example",
  name: "TrustPass Demo Bank (HK)",
  keyId: "did:web:issuer.trustpass.example#key-1",
};

// DEMO ONLY. In production the issuer's private key lives in a hardware
// security module (HSM) and never reaches the browser. It is embedded here so
// the prototype can issue credentials without a server.
export const ISSUER_PRIVATE_JWK = {
  kty: "EC", crv: "P-256",
  x: "lioiMPIvnUQ_ppkk4k2c3Vc8F07munifMg4q89asczA",
  y: "CJywfFBMirTbVh9Tent1CUenD1gLR-fP6HS0K3S2AA4",
  d: "qg7tfuh2dk4008FZnJV4-I9Br8IW4v2Apz09X9W-3xI",
};

// Trusted issuer registry: verifiers only accept credentials signed by these keys.
export const TRUSTED_ISSUERS = {
  "did:web:issuer.trustpass.example#key-1": {
    name: "TrustPass Demo Bank (HK)",
    publicJwk: {
      kty: "EC", crv: "P-256",
      x: "lioiMPIvnUQ_ppkk4k2c3Vc8F07munifMg4q89asczA",
      y: "CJywfFBMirTbVh9Tent1CUenD1gLR-fP6HS0K3S2AA4",
    },
  },
};

// Scoring constants (AI Trust Score matrix).
export const DOMAINS = [
  { key: "gov",    name: "Governance & accountability",     short: "Governance",   weight: 20, color: "#1f3a68" },
  { key: "data",   name: "Data & privacy",                  short: "Data & privacy", weight: 20, color: "#0f9aa8" },
  { key: "model",  name: "Model risk & testing",            short: "Model risk",   weight: 20, color: "#d1293d" },
  { key: "cyber",  name: "Cyber & third-party resilience",  short: "Cyber & 3rd party", weight: 15, color: "#6c5ce7" },
  { key: "human",  name: "Human oversight & customer outcomes", short: "Human oversight", weight: 15, color: "#e8a317" },
  { key: "transp", name: "Transparency & incident response", short: "Transparency", weight: 10, color: "#3d4a63" },
];

export const ANSWER_SCORES = { yes: 100, partly: 50, no: 0 };

export const EVIDENCE = {
  self:     { label: "Self-declared",          factor: 0.60 },
  document: { label: "Backed by documents",    factor: 0.85 },
  crypto:   { label: "Proven cryptographically", factor: 1.00 },
};

export const GRADES = [
  { grade: "A", min: 80, meaning: "Strong AI governance, verified", pdMult: 0.80, marginBp: -25 },
  { grade: "B", min: 65, meaning: "Good, with some gaps or weaker evidence", pdMult: 0.90, marginBp: -10 },
  { grade: "C", min: 50, meaning: "Basic controls; needs a fix plan", pdMult: 1.00, marginBp: 0 },
  { grade: "D", min: 0,  meaning: "Serious gaps: fix plan first", pdMult: 1.15, marginBp: null },
];

// Trust-Linked Credit assumptions (to be calibrated in a pilot).
export const CREDIT = { basePD: 0.03, lgd: 0.45 };

export const PASSPORT_VALID_MONTHS = 24;
export const RECHECK_DAYS = 90;
