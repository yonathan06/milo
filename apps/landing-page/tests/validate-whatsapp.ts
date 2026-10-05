import assert from 'node:assert/strict';
import { getChatUrl } from '../src/components/whatsapp.ts';
import { segments, segmentSlugs } from '../src/content/segments.ts';
for (const segment of segmentSlugs) {
    const message = segments[segment].prefill;
    const url = new URL(getChatUrl(message, '+1 (202) 555-0123'));
    assert.equal(url.pathname, '/12025550123');
    assert.equal(url.searchParams.get('text'), message);
    assert.equal(new URL(getChatUrl(message)).pathname, '/');
}
for (const number of ['abc', '0123456789', '123', '1234567890123456', '1/2025550123']) {
  assert.throws(() => getChatUrl('hello', number), /international phone number/);
}
console.log('WhatsApp: international number validation and all English prefills passed');
