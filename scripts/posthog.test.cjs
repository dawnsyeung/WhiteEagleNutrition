const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = readFileSync(resolve(__dirname, '../posthog.js'), 'utf8');
function load(overrides = {}) {
  const inserted = [];
  const location = { protocol: 'https:', hostname: 'site.example', host: 'site.example', origin: 'https://site.example', href: 'https://site.example/path?email=private@example.com#secret' };
  const window = { location, ...overrides.window };
  const document = { referrer: 'https://ref.example/private?token=secret', createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore: (el) => inserted.push(el) } }] };
  const context = { window, document, navigator: overrides.navigator || {}, URL };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, inserted, config: window.posthog?._i?.[0]?.[1] };
}
test('initializes exactly once and loads HTTPS SDK', () => {
  const result = load(); assert.equal(result.inserted.length, 1);
  assert.match(result.inserted[0].src, /^https:\/\/.*\/static\/array.js$/);
  vm.runInContext(source, result.context); assert.equal(result.inserted.length, 1);
  assert.equal(result.config.capture_pageview, 'history_change');
});
test('privacy features stay disabled even if project remote settings enable them', () => {
  const { config } = load();
  for (const key of ['autocapture','capture_pageleave','capture_performance','capture_exceptions','capture_heatmaps','capture_dead_clicks','capture_webmcp','rageclick','enable_recording_console_log','save_referrer','save_campaign_params']) assert.equal(config[key], false, key);
  for (const key of ['disable_session_recording','disable_surveys','disable_web_experiments','disable_external_dependency_loading','advanced_disable_flags']) assert.equal(config[key], true, key);
  assert.equal(config.person_profiles, 'never'); assert.equal(config.persistence, 'memory'); assert.equal(config.ip, false);
});
test('drops non-pageviews and strips secrets, form values, titles, identities and URL queries', () => {
  const { config } = load(); assert.equal(config.before_send({ event: '$autocapture' }), null);
  const event = config.before_send({ event:'$pageview', properties: { distinct_id: 'anonymous-random', $current_url:'https://site.example/path?email=private@example.com#secret', $initial_current_url:'https://site.example/?token=secret', $set: { email:'secret' }, $title:'Private Name', email:'secret', form_value:'secret', utm_source:'secret' } });
  assert.equal(event.properties.$current_url,'https://site.example/path');
  assert.equal(event.properties.$referrer,'https://ref.example');
  assert.equal(event.properties.$process_person_profile,false);
  assert.equal(event.properties.distinct_id,'anonymous-random');
  assert.doesNotMatch(JSON.stringify(event),/secret|private@example|Private Name|form_value|utm_source/);
});
test('does not load on localhost, file URLs, DNT, GPC or an existing PostHog installation', () => {
  assert.equal(load({window:{location:{protocol:'https:',hostname:'localhost'}}}).inserted.length,0);
  assert.equal(load({window:{location:{protocol:'file:',hostname:''}}}).inserted.length,0);
  assert.equal(load({navigator:{doNotTrack:'1'}}).inserted.length,0);
  assert.equal(load({navigator:{globalPrivacyControl:true}}).inserted.length,0);
  assert.equal(load({window:{posthog:{__loaded:true}}}).inserted.length,0);
});

test('invalid URL properties fall back to the current safe page URL', () => {
 const { config } = load();
 assert.equal(config.before_send({event:'$pageview', properties:{$current_url:'javascript:secret'}}).properties.$current_url,'https://site.example/path');
});
