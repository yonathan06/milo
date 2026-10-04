async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const layouts = [[1440, 900], [375, 812], [320, 568], [812, 375]];
  for (const path of ['/weddings/', '/he/weddings/', '/de/weddings/']) {
    for (const [width, height] of layouts) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(`http://127.0.0.1:4321${path}`);
      await page.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready; });
      const chat = page.locator('[data-scroll-conversation]');
      await page.waitForFunction(() => document.querySelector('[data-scroll-conversation]')?.classList.contains('animate-messages'));
      assert(await page.locator('.wa-header').count() === 2, 'Both previews must share the WhatsApp header');
      assert(await page.locator('.wa-composer').count() === 2, 'Both previews must share the WhatsApp composer');
      const messageCount = await chat.locator('[data-message]').count();
      assert(messageCount === 8, 'Expected eight messages');
      const texts = await chat.locator('[data-message]').allTextContents();
      assert(texts[3].includes(path === '/weddings/' ? 'Payment verified and accepted' : path.startsWith('/he/') ? 'התשלום אומת והתקבל' : 'Zahlung geprüft und bestätigt'), 'Payment must precede the proposal');
      assert(texts[5].includes(path === '/weddings/' ? 'Please create both' : path.startsWith('/he/') ? 'אפשר להכין את שניהם' : 'Bitte erstelle beide'), 'Approval must precede editing');
      const suggested = await chat.locator('.suggested-videos li').allTextContents();
      const delivered = await chat.locator('.results figcaption').allTextContents();
      assert(JSON.stringify(suggested) === JSON.stringify(delivered), 'Delivered videos must match the approved proposal');
      let pinnedTop;
      for (let index = 0; index < messageCount; index++) {
        await chat.evaluate((el, index) => {
          const stage = el.querySelector('.conversation-stage');
          const top = el.getBoundingClientRect().top + scrollY;
          window.scrollTo(0, top + (el.offsetHeight - stage.offsetHeight) * ((index + 0.5) / el.querySelectorAll('[data-message]').length));
        }, index);
        await page.waitForFunction(step => document.querySelector('[data-scroll-conversation]')?.getAttribute('data-step') === String(step), index + 1);
        await page.waitForTimeout(550);
        const result = await chat.evaluate((el, index) => {
          const phone = el.querySelector('.phone').getBoundingClientRect();
          const stage = el.querySelector('.conversation-stage').getBoundingClientRect();
          const indicator = el.querySelector('.scroll-indicator').getBoundingClientRect();
          const viewport = el.querySelector('.message-viewport').getBoundingClientRect();
          const messages = [...el.querySelectorAll('[data-message]')];
          const latest = messages[index].getBoundingClientRect();
          return {
            top: phone.top,
            fits: phone.top >= 0 && phone.bottom <= innerHeight,
            fullScreen: Math.abs(stage.height - innerHeight) < 2 && Math.abs(phone.height - (innerHeight - 56)) < 2,
            indicatorVisible: indicator.width > 0 && indicator.top >= 0 && indicator.bottom <= innerHeight && indicator.left >= 0 && indicator.right <= innerWidth,
            indicatorBesidePhone: indicator.left >= phone.right || indicator.right <= phone.left,
            latestVisible: latest.top >= viewport.top - 1 && latest.bottom <= viewport.bottom + 1,
            visibleCount: messages.filter(message => getComputedStyle(message).visibility === 'visible').length,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        }, index);
        pinnedTop ??= result.top;
        assert(Math.abs(pinnedTop - result.top) < 2, `${path}: phone moved at step ${index + 1}`);
        assert(result.fits && result.fullScreen && result.latestVisible, `${path} ${width}x${height}: clipped phone/message: ${JSON.stringify(result)}`);
        assert(result.visibleCount === index + 1, 'Messages must reveal one step at a time');
        assert(result.indicatorVisible && result.indicatorBesidePhone, 'Scroll indicator must be visible beside the phone');
        assert(!result.overflow, `${path}: horizontal overflow at ${width}`);
      }
      // Reverse scrolling restores the earlier conversation state.
      await chat.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + 1));
      await page.waitForFunction(() => document.querySelector('[data-scroll-conversation]')?.getAttribute('data-step') === '1');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => {
        const chat = document.querySelector('[data-scroll-conversation]');
        return !chat.classList.contains('animate-messages') && [...chat.querySelectorAll('[data-message]')].every(el => getComputedStyle(el).opacity === '1' && el.getAttribute('aria-hidden') !== 'true');
      });
    }
  }
  return { status: 'passed', locales: ['en', 'he', 'de'], layouts, stickyPhone: 'passed', scrollSteps: 'passed', reducedMotion: 'passed' };
}
