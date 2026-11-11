/* Pageview-only PostHog source. Build with scripts/build-posthog.mjs. */
(function () {
  'use strict';
  if (window.__sitePostHogInitialized || (window.posthog && (window.posthog.__loaded || window.posthog.__SV))) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  if (/^(localhost|127(?:\.\d+){3}|\[?::1\]?)$/.test(window.location.hostname)) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  var config = __POSTHOG_CONFIG__;
  if (!config.token || !config.host) return;
  window.__sitePostHogInitialized = true;

  function cleanUrl(value, originOnly) {
    try {
      var url = new URL(value, window.location.origin);
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.origin + (originOnly ? '' : url.pathname);
    } catch (_) { return ''; }
  }
  function pageviewsOnly(event) {
    if (!event || event.event !== '$pageview') return null;
    var original = event.properties || {};
    var properties = {};
    // Retain only anonymous SDK metadata and basic browser information.
    ['distinct_id', '$device_id', '$session_id', '$window_id', '$lib', '$lib_version',
      '$browser', '$browser_version', '$os', '$os_version', '$device_type',
      '$screen_height', '$screen_width', '$viewport_height', '$viewport_width',
      '$pageview_id'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(original, key)) properties[key] = original[key];
    });
    var url = cleanUrl(original.$current_url || window.location.href, false) || cleanUrl(window.location.href, false);
    properties.$current_url = url;
    properties.$host = window.location.host;
    properties.$pathname = new URL(url).pathname;
    properties.$referrer = document.referrer ? cleanUrl(document.referrer, true) : '';
    properties.$referring_domain = properties.$referrer ? new URL(properties.$referrer).hostname : '$direct';
    properties.$process_person_profile = false;
    properties.$geoip_disable = true;
    properties.$ip = '0.0.0.0';
    properties.site_repository = config.site;
    event.properties = properties;
    return event;
  }

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  window.posthog.init(config.token, {
    api_host: config.host,
    defaults: '2026-08-30',
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    capture_performance: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_webmcp: false,
    rageclick: false,
    disable_session_recording: true,
    enable_recording_console_log: false,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    advanced_disable_toolbar_metrics: true,
    person_profiles: 'never',
    persistence: 'memory',
    ip: false,
    respect_dnt: true,
    save_referrer: false,
    save_campaign_params: false,
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    before_send: pageviewsOnly
  });
}());
