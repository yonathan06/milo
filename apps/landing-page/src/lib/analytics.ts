import type { PostHog } from 'posthog-js';

export type LandingEvent = 'outreach_landing_viewed' | 'whatsapp_cta_clicked';

// Load the browser SDK only after consent. No identify(): referrals are not identities.
export function createAnalytics(key: string, host: string, allowed: () => boolean) {
  let client: Promise<PostHog | undefined> | undefined;
  let instance: PostHog | undefined;
  function load() {
    if (!key || !allowed()) return Promise.resolve(undefined);
    return client ??= import('posthog-js').then(({ default: posthog }) => {
      if (!allowed()) return undefined;
      posthog.init(key, {
        api_host: host,
        person_profiles: 'never',
        persistence: 'memory',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_feature_flags: true,
        // Do not send query strings, fragments, external referrers, or message text.
        before_send: event => {
          if (!event || !allowed()) return null;
          for (const name of Object.keys(event.properties)) {
            if (/url|referrer|search|hash/i.test(name)) delete event.properties[name];
          }
          event.properties.$current_url = `${location.origin}${location.pathname}`;
          return event;
        },
      });
      instance = posthog;
      return posthog;
    }).catch(() => undefined);
  }
  return {
    capture(event: LandingEvent, properties: Record<string, string>) {
      if (!allowed()) return;
      void load().then(sdk => {
        if (!allowed()) return;
        try { sdk?.capture(event, properties); } catch { /* Navigation must never depend on analytics. */ }
      }).catch(() => {});
    },
    stop() {
      try { instance?.reset(); } catch { /* Best effort cleanup. */ }
      instance = undefined;
      client = undefined;
    },
  };
}
