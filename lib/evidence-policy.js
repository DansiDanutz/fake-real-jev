// Confidence policy for every JEV judgement, in one place so code, tests and documentation agree.
// JEV `confidence` summarises how concentrated the answer distribution is (docs.typesafe.ai/confidence);
// for a three-option Choice, 0.8 means the chosen option carries roughly 87% of the probability.
// EVIDENCE_CONFIDENCE follows the vendor's citation-check cookbook default (0.8) pending our own benchmark.
export const EVIDENCE_CONFIDENCE = 0.8; // a cited claim relation counts as evidence
export const LIKELY_CONFIDENCE = 0.7; // shown as "likely", never counted
export const RELEVANCE_CONFIDENCE = 0.75; // a search candidate is worth retrieving
export const CRITERIA_CONFIDENCE = 0.7; // an evidence-quality criterion grade is recorded
export const SITE_CONFIDENCE = 0.8; // a whole-site observation is recorded
