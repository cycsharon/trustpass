// Demo company: NovaPay Ltd (fictional), a 25-person AI fraud-check start-up in Kowloon Bay.

export const NOVAPAY = {
  company: "NovaPay Ltd",
  profile: "AI fraud checks for online merchants · 25 staff · Kowloon Bay",
  // Day 1: answers from memory, nothing proven yet.
  day1: {
    q1: "yes", q2: "yes", q3: "yes",
    q4: "partly", q5: "yes", q6: "no",
    q7: "yes", q8: "no", q9: "yes",
    q10: "yes", q11: "yes", q12: "partly", q13: "no",
    q14: "yes", q15: "no", q16: "no",
    q17: "yes", q18: "yes", q19: "partly", q20: "no",
  },
  // After six months of fixing the gaps flagged by the scan.
  month6: {
    q1: "yes", q2: "yes", q3: "yes",
    q4: "yes", q5: "yes", q6: "yes",
    q7: "yes", q8: "yes", q9: "yes",
    q10: "yes", q11: "yes", q12: "yes", q13: "yes",
    q14: "yes", q15: "yes", q16: "partly",
    q17: "yes", q18: "yes", q19: "yes", q20: "partly",
  },
  month6Crypto: ["q1", "q5", "q8"],
  month6Docs: ["q2", "q3", "q4", "q6", "q7", "q9", "q10", "q11", "q12", "q13", "q14", "q15", "q16", "q17", "q18", "q19", "q20"],
};
