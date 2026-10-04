import assert from 'node:assert/strict';
import { ui, languages } from '../src/i18n/ui.ts';
import { getLangFromUrl, getLocaleNeutralPath, useTranslations, useTranslatedPath } from '../src/i18n/utils.ts';

// Run with `node --experimental-strip-types tests/validate-i18n.ts`.
for (const [path, expected] of [
  ['/', 'en'], ['/he/', 'he'], ['/he/about/', 'he'], ['/de/', 'de'], ['/de/weddings/', 'de'],
  ['/en/', 'en'], ['/fr/', 'en'], ['/constructor/', 'en'], ['/toString/', 'en'],
]) {
  assert.equal(getLangFromUrl(new URL(path, 'https://example.com')), expected);
}
for (const locale of Object.keys(languages) as (keyof typeof languages)[]) {
  const path = useTranslatedPath(locale);
  assert.equal(path('/'), locale === 'en' ? '/' : `/${locale}/`);
  assert.equal(path('/', 'en'), '/');
  assert.equal(path('/', 'he'), '/he/');
  assert.equal(path('/', 'de'), '/de/');
  assert.equal(path('/company-events/', 'de'), '/de/company-events/');
  assert.equal(path('/about/?a=1#section', 'he'), '/he/about/?a=1#section');
  assert.equal(path('about/', 'en'), '/about/');
}
assert.equal(getLocaleNeutralPath(new URL('https://example.com/he/company-events/?a=1#section')), '/company-events/?a=1#section');
assert.equal(getLocaleNeutralPath(new URL('https://example.com/de/')), '/');
assert.equal(getLocaleNeutralPath(new URL('https://example.com/weddings/')), '/weddings/');
assert.equal(useTranslations('he')('chat.read'), 'נקרא');
assert.equal(useTranslations('de')('chat.read'), 'Gelesen');
assert.deepEqual(useTranslations('en')('landing.headline'), ['Your moments,', 'beautifully', 'edited.']);

// Exercise an actually missing translation without changing production copy.
const original = ui.he['chat.read'];
try {
  delete ui.he['chat.read'];
  assert.equal(useTranslations('he')('chat.read'), ui.en['chat.read']);
} finally {
  ui.he['chat.read'] = original;
}
const headline = ui.he['landing.headline'];
try {
  delete ui.he['landing.headline'];
  assert.deepEqual(useTranslations('he')('landing.headline'), ui.en['landing.headline']);
} finally {
  ui.he['landing.headline'] = headline;
}
console.log('i18n: language detection, translated paths, typed copy and English fallback passed');
