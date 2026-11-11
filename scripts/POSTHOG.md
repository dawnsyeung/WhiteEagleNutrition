# PostHog coverage

The coming-soon page and generated product detail pages load `/posthog.js` once. The existing analytics on the other pages is unchanged. `research.html` is an immediate redirect to the tracked ethics page and is intentionally exempt.

`posthog.js` is a committed deployment asset so normal builds do not require additional hosting configuration. Its public project token is generated, not a personal API credential. The editable source is `scripts/posthog.template.js`; do not edit the generated asset directly.

To regenerate, set `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` in your local environment to the intended project's public token and HTTPS ingestion origin, then run `npm run build:analytics`. Do not commit an environment file. The repository label is in `scripts/posthog-site.json`.

New coverage captures pageviews only, uses memory persistence, respects Do Not Track and Global Privacy Control, disables replay/autocapture/profiles, and removes URL queries, fragments, form values, titles and other non-allowlisted event properties. Existing page configurations are not modified.

The product template in `scripts/structured-data/generate.mjs` retains the script during schema rebuilds. `npm run build` copies the generated asset into `public/`. Run `npm test`, `npm run build`, and `npm test` again to validate source and built coverage. The schema generator may use its documented cached Shopify product fallback if the live API is unavailable.
