import { createAnalytics } from './analytics';
import { deleteCookie, explicitReferral, readCookie, referralCookie, REFERRAL_COOKIE, usableReferral } from './referral';
import { getChatUrl } from '../components/whatsapp';

const CONSENT_COOKIE = 'milo_consent';

export function initializeOutreach(root: Document, key: string, host: string) {
  const secure = location.protocol === 'https:';
  function cookies() { try { return root.cookie; } catch { return ''; } }
  function writeCookie(value: string) { try { root.cookie = value; } catch { /* Page-local referral still works. */ } }
  let consent = readCookie(cookies(), CONSENT_COOKIE);
  const explicit = explicitReferral(location.search);
  let referral = explicit ?? (consent === 'accepted' ? usableReferral(readCookie(cookies(), REFERRAL_COOKIE)) : undefined);
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-whatsapp-cta]')];
  const banner = root.querySelector<HTMLElement>('[data-cookie-consent]');
  const analytics = createAnalytics(key, host, () => consent === 'accepted');
  const properties = () => ({ landing_path: location.pathname, ...(referral ? { ref: referral } : {}) });

  function updateLinks() {
    for (const link of links) {
      try {
        const base = new URL(link.dataset.whatsappBase!);
        link.href = getChatUrl(base.searchParams.get('text') ?? '', base.pathname.slice(1), referral);
      } catch { /* Keep the functional server-rendered link. */ }
    }
  }
  function persistExplicit() {
    if (consent === 'accepted' && explicit) writeCookie(referralCookie(explicit, secure));
  }
  // Attribution and CTA rewriting happen before any SDK initialization or capture.
  persistExplicit();
  updateLinks();
  analytics.capture('outreach_landing_viewed', properties());
  if (banner) banner.hidden = consent === 'accepted' || consent === 'rejected';

  for (const link of links) {
    const capture = () => {
      // A generic composer is not a real agent CTA.
      if (!/^\/[1-9]\d{6,14}$/.test(new URL(link.href).pathname)) return;
      analytics.capture('whatsapp_cta_clicked', { ...properties(), cta_placement: link.dataset.whatsappCta! });
    };
    link.addEventListener('click', capture);
    link.addEventListener('auxclick', event => { if (event.button === 1) capture(); });
  }
  root.querySelectorAll<HTMLButtonElement>('[data-consent]').forEach(button => {
    button.addEventListener('click', () => {
      const previouslyAllowed = consent === 'accepted';
      consent = button.dataset.consent;
      // Necessary preference cookie, not analytics storage. Remember for 180 days.
      writeCookie(`${CONSENT_COOKIE}=${consent}; Max-Age=15552000; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`);
      if (consent === 'accepted') {
        referral = explicit ?? usableReferral(readCookie(cookies(), REFERRAL_COOKIE));
        persistExplicit();
        if (!previouslyAllowed) analytics.capture('outreach_landing_viewed', properties());
      } else {
        writeCookie(deleteCookie(REFERRAL_COOKIE, secure));
        referral = explicit;
        analytics.stop();
      }
      updateLinks();
      if (banner) banner.hidden = true;
    });
  });
}
