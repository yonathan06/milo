async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const locales = [
    ['en', '', 'ltr', 'Read', 'wedding videos'],
    ['he', '/he', 'rtl', 'נקרא', 'סרטוני החתונה'],
    ['de', '/de', 'ltr', 'Gelesen', 'unserer Hochzeit'],
  ];
  for (const [locale, prefix, dir, read, message] of locales) {
    for (const [width, height] of [[1440, 900], [393, 852], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://localhost:4321${prefix}/weddings/`);
      await page.evaluate(() => document.fonts.ready);
      assert(await page.locator('html').getAttribute('lang') === locale, 'Wrong language');
      assert(await page.locator('html').getAttribute('dir') === dir, 'Wrong direction');
      assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), `${locale}: overflow at ${width}px`);
      assert(await page.locator('.read-receipt').first().getAttribute('aria-label') === read, 'Untranslated read receipt');
      const href = await page.locator('.cta').getAttribute('href');
      assert(await page.evaluate(({ href, message }) => new URL(href).searchParams.get('text').includes(message), { href, message }), 'Untranslated WhatsApp message');
    }
  }
  await page.goto('http://localhost:4321/he/weddings/');
  await page.locator('.country-selector summary').click();
  await page.locator('.country-options a[hreflang="en"]').click();
  assert(await page.evaluate(() => location.pathname === '/weddings/'), 'English must retain the segment without a prefix');
  await page.locator('.site-footer a[hreflang="de"]').click();
  assert(await page.evaluate(() => location.pathname === '/de/weddings/'), 'German switch must retain the segment');
  assert(await page.locator('html').getAttribute('lang') === 'de', 'German switch did not render German');
  await page.locator('.site-footer a[hreflang="he"]').click();
  assert(await page.evaluate(() => location.pathname === '/he/weddings/'), 'Hebrew switch must retain the segment');
  assert(await page.locator('.site-footer a[hreflang="he"]').getAttribute('aria-current') === 'page', 'Incorrect active language');
  return { status: 'passed', locales: ['en', 'he', 'de'], localizedAccessibility: 'passed', languageSwitching: 'passed' };
}
