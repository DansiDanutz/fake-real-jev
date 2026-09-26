# Fake / Real: made with Jev

[Fake / Real](https://www.fake-real.live) is an English and Romanian evidence-review site for news, posts and claims. You paste a public link, and it returns an explained report: the factual claims it found, the outside sources it read, and a REAL, FAKE or not-enough-evidence result with the reasons.

This repository shows how the site uses [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), TypeSafe's System One model. The full application is closed source. The files here are the production Jev client and claim check, published so the integration can be read and run on its own.

## Where Jev sits in the pipeline

1. Firecrawl retrieves the submitted page. Gemini extracts at most five short, atomic factual claims.
2. Tavily searches for outside sources. Jev decides which search results are relevant enough to read (Noul questions, batched).
3. For each claim, Jev reads the cited excerpts and picks one of `supported`, `contradicted` or `unknown` (one Choice question per claim).
4. Jev also picks which claim is the article's main assertion, and grades a small set of evidence-quality criteria.
5. Deterministic code, not Jev, decides the public result. A REAL or FAKE stamp needs a confidently identified main claim backed by pages that were actually read.

Gemini writes the explanations. Jev never generates text, and its confidence is treated as a signal, not as proof that a claim is true.

## What is in this repository

| File | What it does |
| --- | --- |
| `lib/jev-client.js` | Calls `POST https://api.typesafe.ai/v1/systemone` with the model pinned to `jev-1.13.0`. Enforces size limits, retries only on `429`, `503`, `529` or network errors within the caller's time budget, scrubs credentials from errors, and validates Choice and Noul answers. |
| `lib/claim-check.js` | The claim-to-citation question used in production, with the cited excerpts inlined in the question. |
| `lib/evidence-policy.js` | Confidence thresholds. A relation counts as evidence at 0.8 or above (the TypeSafe citation-check cookbook default); 0.7 to 0.8 is shown as "likely" and never counted. |
| `docs/JEV.md` | How Jev is configured and what it is not asked to do. |
| `examples/check-claim.mjs` | Sends one sample claim to Jev and prints the result. |

## Run the example

Requires Node 20 or newer and a TypeSafe API key. There are no dependencies to install.

```sh
TYPESAFE_API_KEY=your-key node examples/check-claim.mjs
```

The key is read from the environment only. Never commit it.

## Links

- Live site: https://www.fake-real.live
- Jev API docs: https://docs.typesafe.ai/api

## License

MIT. See `LICENSE`.
