import { ui, type Locale, type Translations } from './ui.ts';

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

export const segments: Record<Locale, Record<Segment, SegmentContent>> = {
  en: {
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
  },
  he: {
    weddings: {
      name: 'חתונות', title: 'מילו — עריכת סרטוני חתונה ב-WhatsApp',
      description: 'הפכו את סרטוני החתונה של האורחים לסרט סיכום יפהפה. שלחו את הסרטונים למילו ב-WhatsApp.',
      headline: ['החתונה שלכם,', 'בעריכה', 'יפהפייה.'],
      request: 'החתונה שלנו, מהמצלמות של כולם 🥹<br />אפשר להכין לנו סרטון סיכום קצר?',
      response: 'סרט קטן מהיום הגדול שלכם. מתחיל לעבוד 🤍', caption: 'כל האהבה. סרט קטן אחד. ✨',
      album: 'שלחתם ארבעה סרטוני חתונה',
      clips: ['פרחים וסידורי שולחן בחתונה', 'הזוג הטרי חוגג עם האורחים', 'פרחים וכוסות בקבלת הפנים', 'הזוג המאושר באור הערב'],
      result: 'תצוגה מקדימה של סרטון החתונה (להמחשה בלבד)',
      conversationRequest: 'אפשר בבקשה ליצור סרטון סיכום וכמה רגעי שיא מהחתונה שלנו?',
      reply: 'בטח, שלחו לי את הסרטונים שלכם 🤍', recap: 'סיכום החתונה', highlights: 'רגעי השיא מהחתונה',
      comparison: 'ערכו את החתונה עם עורך הווידאו שלנו מבוסס הבינה המלאכותית.',
      closing: 'הפכו את רגעי החתונה שלכם לסרט בלתי נשכח.',
      prefill: 'היי! נשמח להפוך את סרטוני החתונה שלנו לסרטון סיכום ורגעי שיא.',
    },
    'company-events': {
      name: 'אירועי חברה', title: 'מילו — עריכת סרטוני אירועי חברה ב-WhatsApp',
      description: 'הפכו סרטונים מכנסים וחגיגות צוות לסרטון סיכום ורגעי שיא. שלחו את הסרטונים למילו ב-WhatsApp.',
      headline: ['הצוות שלכם,', 'האירוע שלכם,', 'בסרט אחד.'],
      request: 'סרטונים מאירוע החברה שלנו 🎤<br />אפשר להכין סיכום לצוות?',
      response: 'בואו נחבר את כל הרגעים. שלחו את הסרטונים ✨', caption: 'רעיונות גדולים. אנשים נהדרים. סיכום אחד. ✨',
      album: 'שלחתם ארבעה סרטוני אירוע חברה',
      clips: ['מרצה מציג על במה בכנס חברה', 'משתתפים מקשיבים למצגת בכנס', 'עמיתים משוחחים באירוע חברה', 'עמיתים חוגגים בהרמת כוסית'],
      result: 'תצוגה מקדימה של סיכום אירוע החברה (תמונת מאגר להמחשה בלבד)',
      conversationRequest: 'אפשר ליצור סיכום ורגעי שיא מאירוע החברה שלנו לשיתוף עם הצוות?',
      reply: 'בשמחה, שלחו לי את הסרטונים מהאירוע ✨', recap: 'סיכום אירוע החברה', highlights: 'רגעי השיא של הצוות',
      comparison: 'ערכו את אירוע החברה עם בינה מלאכותית.', closing: 'הפכו את אירוע החברה לסרט שכיף לשתף.',
      prefill: 'היי! נשמח לסרטון סיכום ורגעי שיא מאירוע החברה שלנו.',
    },
    'family-events': {
      name: 'אירועים משפחתיים', title: 'מילו — עריכת סרטונים משפחתיים ב-WhatsApp',
      description: 'שמרו ימי הולדת, מפגשים וחגיגות משפחתיות בסרט יפהפה. שלחו את הסרטונים למילו ב-WhatsApp.',
      headline: ['המשפחה שלכם,', 'הזיכרונות שלכם,', 'בסרט אחד.'],
      request: 'החגיגה המשפחתית שלנו 🎂<br />אפשר לחבר את כל הסרטונים?',
      response: 'סרט קטן לכל המשפחה. מתחיל לעבוד 🤍', caption: 'האנשים שאוהבים. הרגעים ששומרים. ✨',
      album: 'שלחתם ארבעה סרטונים משפחתיים',
      clips: ['משפחה מתכנסת סביב עוגת יום הולדת', 'משפחה חוגגת עם עוגת יום הולדת', 'אם וילדים פותחים מתנות יום הולדת', 'ילדה מכבה נרות יום הולדת עם המשפחה'],
      result: 'תצוגה מקדימה של סיכום החגיגה המשפחתית (תמונת מאגר להמחשה בלבד)',
      conversationRequest: 'אפשר להכין סיכום וכמה רגעי שיא מהחגיגה המשפחתית שלנו?',
      reply: 'בטח, שלחו לי את הסרטונים המשפחתיים שלכם 🤍', recap: 'סיכום החגיגה המשפחתית', highlights: 'רגעי השיא המשפחתיים',
      comparison: 'ערכו את הזיכרונות המשפחתיים עם בינה מלאכותית.', closing: 'הפכו רגעים משפחתיים לסרט שתרצו לראות שוב ושוב.',
      prefill: 'היי! נשמח לסרטון סיכום ורגעי שיא מהחגיגה המשפחתית שלנו.',
    },
    'friends-parties': {
      name: 'מסיבות עם חברים', title: 'מילו — עריכת סרטוני מסיבות ב-WhatsApp',
      description: 'הפכו את סרטוני המסיבה של החברים לסיכום כיפי ורגעי שיא. שלחו את הסרטונים למילו ב-WhatsApp.',
      headline: ['החברים שלכם,', 'המסיבה שלכם,', 'בסרט אחד.'],
      request: 'אתמול בלילה, מכל הטלפונים שלנו 🎉<br />אפשר להכין סיכום כיפי?',
      response: 'בואו נשמור את הרגעים הטובים. מתחיל לעבוד ✨', caption: 'חברים טובים. ערב נהדר. סרט קטן אחד. 🎉',
      album: 'שלחתם ארבעה סרטוני מסיבה',
      clips: ['חברים רוקדים יחד במסיבה', 'חברות חוגגות עם קונפטי', 'קבוצת חברים מרימה כוסית', 'חברים רוקדים יחד במסיבה על החוף'],
      result: 'תצוגה מקדימה של סיכום המסיבה (תמונת מאגר להמחשה בלבד)',
      conversationRequest: 'אפשר להכין סיכום כיפי ורגעי שיא מהמסיבה עם החברים שלנו?',
      reply: 'כן! שלחו לי את סרטוני המסיבה של כולם 🎉', recap: 'סיכום המסיבה', highlights: 'רגעי השיא מהמסיבה',
      comparison: 'ערכו את המסיבה עם עורך הווידאו שלנו מבוסס הבינה המלאכותית.', closing: 'הפכו ערב נהדר עם חברים לסרט שכיף לשתף.',
      prefill: 'היי! נשמח לסרטון סיכום ורגעי שיא מהמסיבה עם החברים שלנו.',
    },
  },
  de: {
    weddings: {
      name: 'Hochzeiten', title: 'Milo — Dein Hochzeitsvideo auf WhatsApp',
      description: 'Mach aus den Hochzeitsvideos eurer Gäste einen schönen Rückblick. Schicke die Clips an Milo auf WhatsApp.',
      headline: ['Eure Hochzeit,', 'wunderschön', 'geschnitten.'],
      request: 'Unsere Hochzeit, aus allen Kameras 🥹<br />Machst du uns einen kleinen Rückblick?',
      response: 'Ein kleiner Film von eurem großen Tag. Ich lege los 🤍', caption: 'All die Liebe. Ein kleiner Film. ✨',
      album: 'Du hast vier Hochzeitsvideos geschickt',
      clips: ['Blumen und Tischdekoration bei der Hochzeit', 'Das Brautpaar feiert mit seinen Gästen', 'Blumen und Gläser beim Empfang', 'Das glückliche Paar im Abendlicht'],
      result: 'Vorschau des Hochzeitsfilms (nur zur Illustration)',
      conversationRequest: 'Kannst du einen Rückblick und die Highlights unserer Hochzeit erstellen?',
      reply: 'Klar, schick mir eure Aufnahmen 🤍', recap: 'Euer Hochzeitsfilm', highlights: 'Eure Highlights',
      comparison: 'schneide eure Hochzeit mit KI.', closing: 'Mach aus eurem großen Tag einen Film für immer.',
      prefill: 'Hallo! Wir wünschen uns einen Rückblick und Highlights unserer Hochzeit.',
    },
    'company-events': {
      name: 'Firmenevents', title: 'Milo — Firmenevent-Videos auf WhatsApp',
      description: 'Mach aus Konferenzclips und Teamfeiern einen Rückblick mit Highlights. Schicke eure Videos an Milo auf WhatsApp.',
      headline: ['Euer Team,', 'euer Event,', 'ein Film.'],
      request: 'Clips von unserem Firmenevent 🎤<br />Machst du einen Rückblick fürs Team?',
      response: 'Bringen wir den Tag zusammen. Schick die Clips ✨', caption: 'Große Ideen. Tolles Team. Ein Rückblick. ✨',
      album: 'Du hast vier Firmenevent-Videos geschickt',
      clips: ['Vortrag auf der Bühne einer Firmenkonferenz', 'Teilnehmende hören einem Konferenzvortrag zu', 'Kollegen tauschen sich bei einem Firmenevent aus', 'Kollegen stoßen gemeinsam an'],
      result: 'Vorschau des Firmenevent-Rückblicks (illustratives Stockfoto)',
      conversationRequest: 'Kannst du einen Rückblick und Highlights unseres Firmenevents fürs Team erstellen?',
      reply: 'Gerne, schick mir die Aufnahmen vom Event ✨', recap: 'Event-Rückblick', highlights: 'Team-Highlights',
      comparison: 'schneide euer Firmenevent mit KI.', closing: 'Mach aus eurem Firmenevent einen Film zum Teilen.',
      prefill: 'Hallo! Wir möchten einen Rückblick und Highlights unseres Firmenevents erstellen.',
    },
    'family-events': {
      name: 'Familienfeiern', title: 'Milo — Videos von Familienfeiern auf WhatsApp',
      description: 'Bewahre Geburtstage, Wiedersehen und Familienfeiern in einem schönen Film. Schicke eure Videos an Milo auf WhatsApp.',
      headline: ['Eure Familie,', 'eure Momente,', 'ein Film.'],
      request: 'Unsere Familienfeier 🎂<br />Kannst du die Clips zusammenbringen?',
      response: 'Ein kleiner Film für die ganze Familie. Ich lege los 🤍', caption: 'Lieblingsmenschen. Bleibende Erinnerungen. ✨',
      album: 'Du hast vier Videos der Familienfeier geschickt',
      clips: ['Familie versammelt sich um einen Geburtstagskuchen', 'Familie feiert mit einem Geburtstagskuchen', 'Mutter und Kinder öffnen Geburtstagsgeschenke', 'Kind bläst Geburtstagskerzen mit der Familie aus'],
      result: 'Vorschau des Familienrückblicks (illustratives Stockfoto)',
      conversationRequest: 'Kannst du einen Rückblick und Highlights unserer Familienfeier erstellen?',
      reply: 'Natürlich, schick mir eure Familienvideos 🤍', recap: 'Familienfilm', highlights: 'Familien-Highlights',
      comparison: 'schneide eure Familienmomente mit KI.', closing: 'Mach aus euren Momenten einen Film zum Wiedersehen.',
      prefill: 'Hallo! Wir wünschen uns einen Rückblick und Highlights unserer Familienfeier.',
    },
    'friends-parties': {
      name: 'Partys mit Freunden', title: 'Milo — Partyvideos auf WhatsApp',
      description: 'Mach aus den Partyclips deiner Freunde einen tollen Rückblick mit Highlights. Schicke eure Videos an Milo auf WhatsApp.',
      headline: ['Eure Freunde,', 'eure Party,', 'ein Film.'],
      request: 'Letzte Nacht, aus all unseren Handys 🎉<br />Machst du einen lustigen Rückblick?',
      response: 'Halten wir die guten Zeiten fest. Ich lege los ✨', caption: 'Gute Freunde. Tolle Nacht. Ein kleiner Film. 🎉',
      album: 'Du hast vier Partyvideos geschickt',
      clips: ['Freunde tanzen gemeinsam auf einer Party', 'Freundinnen feiern mit Konfetti', 'Eine Gruppe von Freunden stößt gemeinsam an', 'Freunde tanzen gemeinsam auf einer Strandparty'],
      result: 'Vorschau des Partyrückblicks (illustratives Stockfoto)',
      conversationRequest: 'Kannst du einen lustigen Rückblick und Highlights unserer Party mit Freunden erstellen?',
      reply: 'Ja! Schick mir die Partyclips von allen 🎉', recap: 'Partyrückblick', highlights: 'Partyhighlights',
      comparison: 'schneide eure Party mit KI.', closing: 'Mach aus einer tollen Nacht mit Freunden einen Film zum Teilen.',
      prefill: 'Hallo! Wir wünschen uns einen Rückblick und Highlights unserer Party mit Freunden.',
    },
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
export function getSegmentUI(locale: Locale, segment: Segment): Translations {
  const c = segments[locale][segment];
  return {
    ...ui.en, ...ui[locale],
    'landing.title': c.title, 'landing.description': c.description, 'landing.headline': c.headline,
    'landing.request': c.request, 'landing.response': c.response, 'landing.caption': c.caption,
    'landing.sentAlbum': c.album, 'landing.clipDescriptions': c.clips, 'landing.result': c.result,
    'conversation.request': c.conversationRequest, 'conversation.reply': c.reply,
    'conversation.recap': c.recap, 'conversation.highlights': c.highlights, 'conversation.image': c.result,
    'comparison.headline': c.comparison, 'closing.heading': c.closing, 'whatsapp.prefill': c.prefill,
  };
}
