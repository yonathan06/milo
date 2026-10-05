import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { ui } from '../src/content/ui.ts';
import { segments, segmentSlugs, getSegmentUI } from '../src/content/segments.ts';

const origin = process.env.SITE_URL || 'http://localhost:4321';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let count = 0;
for (const segment of [null, ...segmentSlugs]) {
    const path = segment ? `/${segment}/` : '/';
    const html = await readFile(new URL(`../dist${path}index.html`, import.meta.url), 'utf8');
    const content = segment ? getSegmentUI(segment) : ui;
    assert.match(html, /<html[^>]*lang="en"[^>]*dir="ltr"/);
    for (const tag of ['main', 'h1', 'footer']) assert.equal((html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length, 1, `${path}: ${tag}`);
    for (const cls of ['hero', 'site-footer']) assert.ok(html.includes(`class="${cls}"`));
    assert.ok(html.includes(`<title>${escape(content['landing.title'])}</title>`));
    assert.ok(html.includes(`content="${escape(content['landing.description'])}"`));
    assert.ok(html.includes(`rel="canonical" href="${new URL(path, origin).href}"`));
    assert.ok(html.includes('class="brand" href="/"'));
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer, `${path}: footer exists`);
    for (const slug of segmentSlugs) {
      const link = footer.match(new RegExp(`<a\\b[^>]*href="/${slug}/"[^>]*>[\\s\\S]*?</a>`))?.[0];
      assert.ok(link?.includes(escape(segments[slug].name)), `${path}: footer link ${slug}`);
      assert.equal(link.includes('aria-current="page"'), slug === segment, `${path}: active footer link ${slug}`);
    }
    assert.equal((footer.match(/aria-current="page"/g) ?? []).length, segment ? 1 : 0);
    assert.doesNotMatch(html, /hreflang=|country-selector|Choose language|href="\/(en|he|de)\//);
    const heroUrl = html.match(/class="cta"[^>]*href="([^"]+)"/)?.[1];
    assert.ok(heroUrl);
    assert.match(html, /data-whatsapp-cta="hero"/);
    assert.match(html, /data-cookie-consent/);
    assert.doesNotMatch(html, /data-cookie-settings/);
    if (segment) assert.match(html, /data-whatsapp-cta="closing"/);
    const chat = new URL(heroUrl.replaceAll('&amp;', '&'));
    assert.equal(chat.hostname, 'wa.me');
    assert.equal(chat.searchParams.get('text'), content['whatsapp.prefill']);
    if (process.env.PUBLIC_WHATSAPP_NUMBER) assert.equal(chat.pathname, `/${process.env.PUBLIC_WHATSAPP_NUMBER.replace(/[\s()+-]/g, '')}`);
    if (segment) {
      const ordered = ['class="hero"', 'class="editor-comparison"', 'class="scroll-conversation"', 'class="closing-cta"', 'class="site-footer"'].map(token => html.indexOf(token));
      assert.ok(ordered.every((offset, i) => offset >= 0 && (!i || offset > ordered[i - 1])));
      assert.equal((html.match(/data-message(?:\s|>)/g) ?? []).length, 8);
      assert.match(html, /aria-labelledby="comparison-heading"/);
      assert.match(html, /<bdi dir="ltr"[^>]*>\$1,500<\/bdi>/);
      assert.ok(html.includes(escape(content['conversation.recap'])));
      assert.ok(html.includes(escape(content['conversation.highlights'])));
      assert.ok(html.includes(`aria-label="${content['chat.read']}"`));
      assert.equal(html.match(/class="whatsapp-link"[^>]*href="([^"]+)"/)?.[1], heroUrl);
      if (segment !== 'weddings') assert.doesNotMatch(html, /\/media\/(wedding|ceremony|flowers|reception)\.jpg/);
    } else {
      assert.doesNotMatch(html, /class="editor-comparison"|data-scroll-conversation|class="closing-cta"/);
      assert.equal((html.match(/<button[^>]*role="tab"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/<div[^>]*role="tabpanel"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/class="chat"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
      for (const [index, slug] of segmentSlugs.entries()) {
        assert.ok(html.includes(`id="preview-tab-${slug}" aria-controls="preview-panel-${slug}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"`));
        assert.ok(html.includes(`id="preview-panel-${slug}" aria-labelledby="preview-tab-${slug}"${index ? ' hidden' : ''} tabindex="0"`));
        const previewContent = getSegmentUI(slug);
        assert.ok(html.includes(previewContent['landing.request']));
        assert.ok(html.includes(escape(previewContent['landing.caption'])));
        const dedicatedHtml = await readFile(new URL(`../dist/${slug}/index.html`, import.meta.url), 'utf8');
        const chatMarkup = dedicatedHtml.match(/<section class="chat"[\s\S]*?<\/section>/)?.[0];
        assert.ok(chatMarkup && html.includes(chatMarkup), `${path}: ${slug} uses the dedicated page phone mock`);
      }
      assert.doesNotMatch(html, /class="segment-links"/);
    }
    for (const src of [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1])) await access(new URL(`../public${src}`, import.meta.url));
    count++;
    console.log(`${path}: structure, content, links, assets, metadata and WhatsApp passed`);
}
async function pages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? pages(new URL(`${e.name}/`, dir)) : e.name.endsWith('.html') ? [new URL(e.name, dir).pathname] : []))).flat();
}
const built = await pages(new URL('../dist/', import.meta.url));
assert.equal(count, 5);
assert.equal(built.length, 5);
assert.ok(built.every(path => !path.includes('/general/')));
console.log('build: exactly five English-only pages passed');
