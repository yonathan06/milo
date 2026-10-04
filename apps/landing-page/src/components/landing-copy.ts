import { useTranslations } from '../i18n/utils';
import type { Locale, Translations } from '../i18n/ui';
import { segmentMedia, type Segment } from '../i18n/segments';

// Structured copy for the hero and WhatsApp preview; all text lives in i18n/ui.ts.
export function getLandingCopy(locale: Locale, content?: Translations, segment: Segment = 'weddings') {
  const t = useTranslations(locale, content);
  return {
    media: segmentMedia[segment],
    description: t('landing.description'),
    title: t('landing.title'),
    online: t('chat.online'),
    headline: t('landing.headline'),
    cta: t('landing.cta'),
    chatLabel: t('landing.chatLabel'),
    clipDescriptions: t('landing.clipDescriptions'),
    sentAlbum: t('landing.sentAlbum'),
    request: t('landing.request'),
    response: t('landing.response'),
    result: t('landing.result'),
    caption: t('landing.caption'),
    message: t('chat.message'),
    today: t('chat.today'),
    verified: t('chat.verified'),
    read: t('chat.read'),
  };
}

export type LandingCopy = ReturnType<typeof getLandingCopy>;
