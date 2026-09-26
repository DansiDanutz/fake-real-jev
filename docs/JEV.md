# Jev configuration

Jev (TypeSafe's System One model) handles Fake / Real's bounded semantic judgments. Gemini extracts claims and writes explanations; Jev returns structured choices and confidence values. Confidence is **not** independent proof that a claim is true. Checked against the [vendor API](https://docs.typesafe.ai/api), [confidence guidance](https://docs.typesafe.ai/confidence), [model guidance](https://docs.typesafe.ai/model-jaggedness/jev-1.13) and [citation-check example](https://docs.typesafe.ai/cookbooks/citation_check).

| Item | Setting | Reason |
| --- | --- | --- |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer` | Vendor API reference |
| Model | `jev-1.13.0`, pinned (not `jev-latest`) | Thresholds are tuned per version; the alias moves without notice. The response `model` field is logged on every call |
| Key | `TYPESAFE_API_KEY`, server-only | Never reaches the browser |
| Retries | Up to 4 attempts on `429`, `503`, `529` or a network error; backoff min(200·2^(n-1), 4000) ms ±20% jitter; `retry-after` honoured up to 8 s; the caller's timeout bounds the whole ladder; `401`/`422` never retried; upstream error text is scrubbed of credentials | Fail closed as `unavailable` without exceeding the user-facing wait |
| Timeouts | Claims 12 s, relevance 8 s | Bound the user-facing wait; Jev usually answers in well under a second |
| Size guard | State at most 28,000 bytes, request body at most 90,000 bytes | Under the 32k-token state and 64k-token request budgets |
| Relevance rerank | Candidates judged in Noul batches of at most 40 per request; answers in the 0.4 to 0.6 band become capped uncertain leads, never relevant | "No idea" answers are read, not trusted |
| Question design | One Choice per claim; the cited excerpts are inlined in the question rather than referenced by id | The 1.13 model reads literally and loses accuracy with indirection and large irrelevant state |
| Atomic claims | Gemini extracts at most five atomic claims of at most 240 characters with explicit numbers, dates and entities | Jev judges single facts far better than compound sentences |
| Confidence policy | `lib/evidence-policy.js`: evidence 0.8, likely 0.7, relevance 0.75, criteria 0.7, site 0.8 | Evidence bar follows the vendor citation-check cookbook default |
| Answer validation | `choiceAnswer` accepts only the options asked for, with a finite confidence in [0, 1] | Malformed answers never become verdicts |

## What Jev is not asked to do

Counting, arithmetic, date comparison and text generation stay in code or in Gemini, following the vendor's list of model weak spots. Jev never decides a public verdict alone: a REAL or FAKE stamp requires a confidently identified and resolved main claim with a cited page that was actually read. REAL also needs at least half the extracted claims resolved and no resolved contradiction; a contradicted central claim can earn FAKE even when other claims remain unresolved.

## Calibration

The 0.8 evidence bar is the vendor's starting point, not a measured optimum for this domain. It stays fixed until a labeled benchmark exists. Until then, findings between 0.7 and 0.8 are shown to readers as "likely" and never counted.
