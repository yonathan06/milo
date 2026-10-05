async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const layouts = [];
  for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [820, 1180], [768, 1024], [393, 852], [375, 812], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:4321/weddings/');
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const intro = document.querySelector('.intro').getBoundingClientRect();
      const chat = document.querySelector('.chat').getBoundingClientRect();
      const cta = document.querySelector('.cta').getBoundingClientRect();
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        layout: chat.top >= intro.bottom ? 'stacked' : 'side-by-side',
        chatInBounds: chat.left >= 0 && chat.right <= innerWidth,
        desktopFits: innerWidth <= 900 || (chat.top >= 0 && chat.bottom <= innerHeight),
        ctaInBounds: cta.left >= 0 && cta.right <= innerWidth,
        ctaTouchSize: cta.height >= 44,
        imagesLoaded: [...document.images].filter(image => image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0),
        headingCount: document.querySelectorAll('h1').length,
        extraCopy: [...document.querySelectorAll('body *')].filter(el => !el.closest('script, style, h1, .cta, .chat, .editor-comparison, .scroll-conversation, .closing-cta, .site-footer')).flatMap(el => [...el.childNodes]).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()),
      };
    });
    assert(!result.overflow, `Horizontal overflow at ${width}px`);
    assert(result.chatInBounds && result.ctaInBounds && result.desktopFits, `Clipped content at ${width}px`);
    assert(result.ctaTouchSize && result.imagesLoaded, `Assets or touch targets failed at ${width}px`);
    assert(result.headingCount === 1 && !result.extraCopy, 'Unexpected page copy');
    assert(await page.locator('.editor-comparison h2').count() === 1, 'Missing editor comparison heading');
    assert((await page.locator('.editor-comparison h2').innerText()).includes('$1,500'), 'Missing editor cost comparison');
    assert(result.layout === (width <= 900 ? 'stacked' : 'side-by-side'), `Wrong layout at ${width}px`);
    layouts.push(result);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4321/weddings/');
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Tab');
  assert(await page.locator('.cta').evaluate(el => el === document.activeElement), 'CTA must be first tab stop');
  assert(await page.locator('.cta').evaluate(el => getComputedStyle(el).outlineStyle === 'solid'), 'Missing keyboard focus indicator');
  assert(await page.locator('video, audio, .chat button, .chat [tabindex]').count() === 0, 'Chat mock must be non-interactive');
  await page.locator('.recap-preview').click();
  assert(await page.locator('.recap-preview img').isVisible(), 'Static recap preview missing');
  assert(await page.locator('video, audio').count() === 0, 'Click must not create a media player');
  assert(await page.evaluate(() => !performance.getEntriesByType('resource').some(entry => /\.(mp4|webm)(\?|$)/.test(entry.name))), 'Page must not load video assets');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await page.locator('.cta').evaluate(el => getComputedStyle(el).transitionDuration === '0s'), 'Reduced motion not respected');
  const href = await page.locator('.cta').getAttribute('href');
  assert(await page.evaluate(url => new URL(url).hostname === 'wa.me' && new URL(url).searchParams.get('text').includes('wedding videos'), href), 'WhatsApp destination or message invalid');
  // Stub only the external destination. Validate navigation without sending a message.
  await page.context().route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp destination test</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.locator('.cta').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert(popup.url() === href, 'CTA opened wrong destination');
  await popup.close();
  await page.context().unroute('https://wa.me/**');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://localhost:4321/weddings/');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.playwright-cli/milo-desktop.png', fullPage: true });
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { status: 'passed', layouts, keyboard: 'passed', staticPreview: 'passed', reducedMotion: 'passed', ctaNavigation: 'passed (external destination stubbed)', errors };
}
