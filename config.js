// TrustPass configuration.
// Change ISSUER_NAME to re-brand the issuing bank (e.g. for a bank-specific pitch).

export const APP_NAME = "TrustPass";
export const APP_TAGLINE = "Prove your AI is safe, without handing over your data";

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
  self:     { label: "Your word",       short: "Your word", factor: 0.60, desc: "You answered, but haven't shown anything yet" },
  document: { label: "Document found",  short: "Document",  factor: 0.85, desc: "Our AI found it in a document you uploaded" },
  crypto:   { label: "Proof sealed",    short: "Proof",     factor: 1.00, desc: "You attached a proof file; its fingerprint is sealed in your Passport" },
};

export const GRADES = [
  { grade: "A", min: 80, meaning: "Strong AI governance, backed by evidence" },
  { grade: "B", min: 65, meaning: "Good, with a few gaps or weaker evidence" },
  { grade: "C", min: 50, meaning: "Basic controls in place; follow the action plan" },
  { grade: "D", min: 0,  meaning: "Important gaps; start with the action plan" },
];

export const PASSPORT_VALID_MONTHS = 24;
export const RECHECK_DAYS = 90;
