import assert from 'node:assert/strict';
import { explicitReferral, usableReferral, readCookie, referralCookie, REFERRAL_MAX_AGE } from '../src/lib/referral.ts';
import { getChatUrl } from '../src/components/whatsapp.ts';

for (const value of ['abc123', 'A_B-9', 'a'.repeat(64)]) assert.equal(usableReferral(value), value);
for (const value of ['', 'a'.repeat(65), 'a b', 'a]', 'é', '%61', '\nabc']) assert.equal(usableReferral(value), undefined);
assert.equal(explicitReferral('?ref=A_B-9'), 'A_B-9');
assert.equal(explicitReferral('?ref=%61bc123'), 'abc123');
for (const search of ['', '?ref=', '?ref=A&ref=B', '?ref=A&ref=A', '?ref=bad%20value']) assert.equal(explicitReferral(search), undefined);
assert.equal(readCookie('other=x; milo_ref=abc123', 'milo_ref'), 'abc123');
assert.equal(readCookie('milo_ref=%E0%A4%A', 'milo_ref'), undefined);
assert.equal(REFERRAL_MAX_AGE, 2592000);
assert.equal(referralCookie('abc', true), 'milo_ref=abc; Max-Age=2592000; Path=/; SameSite=Lax; Secure');
assert.ok(!referralCookie('abc', false).includes('Secure'));
assert.throws(() => referralCookie('invalid value', true));
const message = 'Hi! A message with & and ♥';
assert.equal(new URL(getChatUrl(message, '12025550123', 'abc123')).searchParams.get('text'), `${message} [ref: abc123]`);
assert.equal(new URL(getChatUrl(message, '12025550123', 'bad]')).searchParams.get('text'), message);
console.log('Referral: grammar, duplicate queries, cookies, and encoded markers passed');
