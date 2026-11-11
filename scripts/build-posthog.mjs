// Regenerate the public deployment asset from environment configuration.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.POSTHOG_PROJECT_TOKEN;
const host = process.env.POSTHOG_HOST;
if (!token || !host) throw new Error('Set POSTHOG_PROJECT_TOKEN and POSTHOG_HOST before rebuilding analytics.');
if (!/^phc_[A-Za-z0-9]+$/.test(token)) throw new Error('Expected a public PostHog project token, never a personal API key.');
const url = new URL(host);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('POSTHOG_HOST must be an HTTPS ingestion origin.');
const site = JSON.parse(readFileSync(resolve(root, 'scripts/posthog-site.json'), 'utf8')).repository;
const config = JSON.stringify({ token, host: url.origin, site }).replace(/</g, '\\u003c');
const source = readFileSync(resolve(root, 'scripts/posthog.template.js'), 'utf8');
if (source.split('__POSTHOG_CONFIG__').length !== 2) throw new Error('Expected one configuration placeholder.');
writeFileSync(resolve(root, 'posthog.js'), '// Generated static deployment asset. Regenerate with scripts/build-posthog.mjs.\n' + source.replace('__POSTHOG_CONFIG__', config));
console.log('Generated pageview-only posthog.js from environment configuration.');
