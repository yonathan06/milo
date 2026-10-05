import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { segments, segmentSlugs, segmentMedia, getSegmentUI } from '../src/content/segments.ts';

assert.deepEqual(Object.keys(segments).sort(), [...segmentSlugs].sort());
for (const segment of segmentSlugs) {
    const content = segments[segment];
    assert.deepEqual(Object.keys(content).sort(), Object.keys(segments.weddings).sort());
    for (const value of Object.values(content)) {
      assert.ok(Array.isArray(value) ? value.every(v => typeof v === 'string' && v.trim()) : value.trim());
    }
    assert.equal(content.headline.length, 3);
    assert.equal(content.clips.length, 4);
    const resolved = getSegmentUI(segment);
    assert.equal(resolved['whatsapp.prefill'], content.prefill);
    assert.equal(resolved['conversation.recap'], content.recap);
    assert.equal(resolved['conversation.highlights'], content.highlights);
    assert.equal(resolved['landing.title'], content.title);
    assert.equal(new Set(Object.values(segments).map(c => c.prefill)).size, 4);
    if (segment !== 'weddings') assert.doesNotMatch(JSON.stringify(content), /wedding/i);
}
assert.deepEqual(segmentMedia.weddings, {
  clips: ['/media/flowers.jpg', '/media/ceremony.jpg', '/media/reception.jpg', '/media/wedding.jpg'],
  result: '/media/wedding.jpg', highlights: '/media/ceremony.jpg',
}, 'Wedding photography must remain unchanged');
const credits = JSON.parse(await readFile(new URL('../public/media/credits.json', import.meta.url), 'utf8'));
assert.equal(credits.license, 'https://www.pexels.com/license/');
assert.equal(credits.photos.length, 12);
const usedPhotos = new Set<string>();
for (const segment of segmentSlugs) {
  const media = segmentMedia[segment];
  assert.equal(new Set(media.clips).size, 4, `${segment}: four distinct album photos required`);
  assert.ok(media.clips.includes(media.result));
  assert.ok(media.clips.includes(media.highlights));
  assert.notEqual(media.result, media.highlights);
  const fingerprints = new Set<string>();
  for (const path of [...media.clips, media.result, media.highlights]) {
    await access(new URL(`../public${path}`, import.meta.url));
    assert.ok(path.endsWith('.jpg'), `${path}: previews must use photographs`);
    const image = await readFile(new URL(`../public${path}`, import.meta.url));
    assert.equal(image.readUInt16BE(0), 0xffd8, `${path}: invalid JPEG`);
    fingerprints.add(createHash('sha256').update(image).digest('hex'));
    if (segment !== 'weddings') {
      assert.ok(image.length > 10_000 && image.length < 150_000, `${path}: image size budget`);
      const source = credits.photos.find((photo: { file: string }) => path === `/media/${photo.file}`);
      assert.ok(source, `${path}: missing source credit`);
      assert.equal(new URL(source.source).hostname, 'www.pexels.com');
      assert.equal(new URL(source.download).hostname, 'images.pexels.com');
      usedPhotos.add(path);
    }
  }
  assert.equal(fingerprints.size, 4, `${segment}: repeated photo content`);
}
assert.equal(usedPhotos.size, 12);
console.log('content: all four complete English records, audience separation, and media passed');
