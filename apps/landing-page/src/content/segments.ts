import { ui, type PageContent } from './ui.ts';

export const segmentSlugs = ['weddings', 'company-events', 'family-events', 'friends-parties'] as const;
export type Segment = typeof segmentSlugs[number];

export interface SegmentContent {
  name: string;
  title: string;
  description: string;
  headline: [string, string, string];
  request: string;
  response: string;
  caption: string;
  album: string;
  clips: [string, string, string, string];
  result: string;
  conversationRequest: string;
  reply: string;
  recap: string;
  highlights: string;
  comparison: string;
  closing: string;
  prefill: string;
}

export const segments: Record<Segment, SegmentContent> = {
  weddings: {
    name: 'Weddings', title: 'Milo — Your wedding video editor on WhatsApp',
    description: 'Turn wedding videos from your guests into a beautiful recap. Send your clips to Milo on WhatsApp.',
    headline: ['Your wedding,', 'beautifully', 'edited.'],
    request: 'Our wedding, from everyone’s camera 🥹<br />Can you make us a little recap?',
    response: 'A little movie of your big day. On it 🤍', caption: 'All the love. One little film. ✨',
    album: 'You sent four wedding videos',
    clips: ['Wedding flowers and table settings', 'Newlyweds celebrating with their guests', 'Flowers and glasses at the reception', 'The happy couple in the evening light'],
    result: 'Wedding recap video preview (illustration only)',
    conversationRequest: 'Can you please create a video recap and some highlights for our wedding?',
    reply: 'Sure, send me your recordings 🤍', recap: 'Wedding recap', highlights: 'Wedding highlights',
    comparison: 'edit your wedding with our AI editor.', closing: 'Turn your wedding moments into an unforgettable film.',
    prefill: 'Hi! I’d love to turn our wedding videos into a recap and highlights.',
  },
  'company-events': {
    name: 'Company events', title: 'Milo — Company event videos on WhatsApp',
    description: 'Turn conference clips and team celebrations into an event recap and highlights. Send your videos to Milo on WhatsApp.',
    headline: ['Your team,', 'your event,', 'one film.'],
    request: 'Clips from our company event 🎤<br />Can you make a recap for the team?',
    response: 'Let’s bring the day together. Send them over ✨', caption: 'Big ideas. Great people. One recap. ✨',
    album: 'You sent four company event videos',
    clips: ['Speaker presenting on stage at a company conference', 'Attendees listening to a conference presentation', 'Colleagues networking at a company event', 'Colleagues celebrating with a toast'],
    result: 'Company event recap preview (illustrative stock photo)',
    conversationRequest: 'Can you create a recap and highlights of our company event to share with the team?',
    reply: 'Of course, send me the event recordings ✨', recap: 'Company event recap', highlights: 'Team event highlights',
    comparison: 'edit your company event with AI.', closing: 'Give your company event a film worth sharing.',
    prefill: 'Hi! I’d like a recap and highlights of our company event.',
  },
  'family-events': {
    name: 'Family events', title: 'Milo — Family event videos on WhatsApp',
    description: 'Keep birthdays, reunions, and family celebrations in one beautiful film. Send your videos to Milo on WhatsApp.',
    headline: ['Your family,', 'your memories,', 'one film.'],
    request: 'Our family celebration 🎂<br />Can you bring these clips together?',
    response: 'A little film for the whole family. On it 🤍', caption: 'The people you love. The moments you keep. ✨',
    album: 'You sent four family event videos',
    clips: ['Family gathered around a birthday cake', 'Family celebrating with a birthday cake', 'Mother and children opening birthday gifts', 'Child blowing out birthday candles with family'],
    result: 'Family celebration recap preview (illustrative stock photo)',
    conversationRequest: 'Can you make a recap and some highlights of our family celebration?',
    reply: 'Absolutely, send me your family videos 🤍', recap: 'Family celebration recap', highlights: 'Family highlights',
    comparison: 'edit your family memories with AI.', closing: 'Turn family moments into a film you’ll keep coming back to.',
    prefill: 'Hi! I’d love a recap and highlights of our family celebration.',
  },
  'friends-parties': {
    name: 'Friends’ parties', title: 'Milo — Party videos on WhatsApp',
    description: 'Turn party clips from your friends into a fun recap and highlights. Send your videos to Milo on WhatsApp.',
    headline: ['Your friends,', 'your party,', 'one film.'],
    request: 'Last night, from all our phones 🎉<br />Can you make a fun recap?',
    response: 'Let’s keep the good times rolling. On it ✨', caption: 'Good friends. Great night. One little film. 🎉',
    album: 'You sent four party videos',
    clips: ['Friends dancing together at a party', 'Friends celebrating with confetti', 'Group of friends making a toast', 'Friends dancing together at a beach party'],
    result: 'Friends’ party recap preview (illustrative stock photo)',
    conversationRequest: 'Can you make a fun recap and highlights of our party with friends?',
    reply: 'Yes! Send me everyone’s party clips 🎉', recap: 'Party recap', highlights: 'Party highlights',
    comparison: 'edit your party with our AI editor.', closing: 'Turn a great night with friends into a film to share.',
    prefill: 'Hi! I’d love a recap and highlights of our party with friends.',
  },
};

export interface SegmentMedia { clips: [string, string, string, string]; result: string; highlights: string; }
export const segmentMedia: Record<Segment, SegmentMedia> = {
  weddings: { clips: ['/media/flowers.jpg', '/media/ceremony.jpg', '/media/reception.jpg', '/media/wedding.jpg'], result: '/media/wedding.jpg', highlights: '/media/ceremony.jpg' },
  'company-events': {
    clips: ['/media/company-presentation.jpg', '/media/company-conference.jpg', '/media/company-networking.jpg', '/media/company-celebration.jpg'],
    result: '/media/company-networking.jpg', highlights: '/media/company-presentation.jpg',
  },
  'family-events': {
    clips: ['/media/family-birthday.jpg', '/media/family-celebration.jpg', '/media/family-gathering.jpg', '/media/family-candles.jpg'],
    result: '/media/family-candles.jpg', highlights: '/media/family-birthday.jpg',
  },
  'friends-parties': {
    clips: ['/media/friends-dancing.jpg', '/media/friends-confetti.jpg', '/media/friends-celebration.jpg', '/media/friends-beach-party.jpg'],
    result: '/media/friends-celebration.jpg', highlights: '/media/friends-dancing.jpg',
  },
};

// All audience-dependent keys are resolved here; presentation stays shared.
export function getSegmentUI(segment: Segment): PageContent {
  const c = segments[segment];
  return {
    ...ui,
    'landing.title': c.title, 'landing.description': c.description, 'landing.headline': c.headline,
    'landing.request': c.request, 'landing.response': c.response, 'landing.caption': c.caption,
    'landing.sentAlbum': c.album, 'landing.clipDescriptions': c.clips, 'landing.result': c.result,
    'conversation.request': c.conversationRequest, 'conversation.reply': c.reply,
    'conversation.recap': c.recap, 'conversation.highlights': c.highlights, 'conversation.image': c.result,
    'comparison.headline': c.comparison, 'closing.heading': c.closing, 'whatsapp.prefill': c.prefill,
  };
}
