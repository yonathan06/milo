import { ui, type PageContent } from '../content/ui';
import { segmentMedia, type Segment } from '../content/segments';

// Structured copy for the hero and WhatsApp preview.
export function getLandingCopy(content: PageContent = ui, segment: Segment = 'weddings') {
  const t = <K extends keyof PageContent>(key: K): PageContent[K] => content[key];
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
