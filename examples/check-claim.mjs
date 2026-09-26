// Usage: TYPESAFE_API_KEY=... node examples/check-claim.mjs
// Sends one claim and one cited excerpt to Jev and prints the relation it picked.
import { checkClaims } from '../lib/claim-check.js';

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error('Set TYPESAFE_API_KEY first.');
  process.exit(1);
}

const results = await checkClaims(
  [
    {
      claim: 'The Euclid space telescope launched on 1 July 2023 from Cape Canaveral.',
      citedExcerpts: [
        {
          // Illustrative excerpt for the demo, not a quote from a real page.
          url: 'https://example.org/sample-article',
          excerpt: 'Euclid lifted off on a SpaceX Falcon 9 rocket from Cape Canaveral, Florida, USA, on 1 July 2023.',
        },
      ],
    },
  ],
  key,
);
console.log(JSON.stringify(results, null, 2));
