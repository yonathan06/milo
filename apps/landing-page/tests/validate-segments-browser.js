async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const slugs = ['weddings', 'company-events', 'family-events', 'friends-parties'];
  let checked = 0;
  const locale = 'en', prefix = '', direction = 'ltr';
  {
    for (const slug of [null, ...slugs]) {
      const neutral = slug ? `/${slug}/` : '/';
      const path = `${prefix}${neutral}`;
      for (const [width, height] of [[1440, 900], [393, 852], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.goto(`http://localhost:4321${path}`);
        await page.evaluate(() => document.fonts.ready);
        assert(await page.locator('html').getAttribute('lang') === locale, `${path}: language`);
        assert(await page.locator('html').getAttribute('dir') === direction, `${path}: direction`);
        const layout = await page.evaluate(() => {
          const hero = document.querySelector('.hero');
          const h1 = hero.querySelector('h1');
          const cta = hero.querySelector('.cta').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            textOverflow: h1.scrollWidth > h1.clientWidth + 1,
            background: getComputedStyle(document.body).backgroundColor,
            ctaBackground: getComputedStyle(hero.querySelector('.cta')).backgroundColor,
            ctaFits: cta.left >= 0 && cta.right <= innerWidth && cta.height >= 44,
            images: [...hero.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0),
          };
        });
        assert(!layout.overflow && !layout.textOverflow, `${path} at ${width}: text/layout overflow`);
        assert(layout.background === 'rgb(244, 247, 245)' && layout.ctaBackground === 'rgb(33, 108, 75)', 'Existing colors changed');
        assert(layout.ctaFits && layout.images, `${path}: clipped CTA or unloaded images`);
        assert(await page.locator('h1').count() === 1, `${path}: h1`);
        assert(await page.locator('[hreflang], .country-selector').count() === 0, `${path}: no language controls`);
        if (!slug) {
          assert(await page.locator('.editor-comparison, .scroll-conversation, .closing-cta').count() === 0, `${path}: homepage must stay minimal`);
          assert(await page.locator('[role="tab"]').count() === 4, `${path}: preview tabs`);
          for (const segment of slugs) {
            await page.locator(`#preview-tab-${segment}`).click();
            assert(await page.locator(`#preview-panel-${segment}`).isVisible(), `${path}: preview switching`);
          }
        } else {
          assert(await page.locator('[data-message]').count() === 8, `${path}: eight messages`);
          const approved = await page.locator('.suggested-videos li').allTextContents();
          const delivered = await page.locator('.results figcaption').allTextContents();
          assert(JSON.stringify(approved) === JSON.stringify(delivered), `${path}: approval and results differ`);
          assert(await page.locator('.cta').getAttribute('href') === await page.locator('.whatsapp-link').getAttribute('href'), `${path}: CTAs differ`);
          const photos = await page.locator('.clip-grid img').evaluateAll(images => images.map(image => image.getAttribute('src')));
          assert(new Set(photos).size === 4 && photos.every(src => src.endsWith('.jpg')), `${path}: four distinct album photographs`);
          assert(await page.locator('img[src$=".jpg"]').count() === 11, `${path}: photos in both previews`);
          assert(await page.locator('img[src$="-illustration.svg"]').count() === 0, `${path}: obsolete illustration`);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert(await page.locator('.cta').evaluate(el => getComputedStyle(el).transitionDuration === '0s'), 'Reduced motion failed');
        if (slug) {
          await page.waitForFunction(() => !document.querySelector('[data-scroll-conversation]').classList.contains('animate-messages'));
          const clipped = await page.locator('.results figcaption, .closing-cta h2').evaluateAll(els => els.some(el => el.scrollWidth > el.clientWidth + 1));
          assert(!clipped, `${path}: closing/deliverable text clipped`);
          await page.locator('.results').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => [...document.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0));
        }
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        checked++;
      }
    }
    await page.goto('http://localhost:4321/company-events/');
    await page.locator('.site-footer .brand').click();
    assert(await page.evaluate(() => location.pathname) === `${prefix}/`, 'Brand link must return to homepage');
  }
  assert(errors.length === 0, errors.join('; '));
  return { status: 'passed', pages: 5, layoutsChecked: checked, language: 'en', design: 'unchanged', errors };
}
