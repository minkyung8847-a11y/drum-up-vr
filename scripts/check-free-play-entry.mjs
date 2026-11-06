import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const route of ['landing', 'showroom']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.FREE_PLAY_TEST_URL || 'http://127.0.0.1:5178/');
    if (route === 'showroom') {
      await page.getByRole('button', { name: 'Choose a drum kit' }).click();
    }
    await page.evaluate(() => {
      window.freePlayTiming = {};
      document.addEventListener('click', event => {
        if (!event.target.closest('button')) return;
        window.freePlayTiming.start = performance.now();
        const observer = new MutationObserver(() => {
          if (!document.querySelector('.app-container[data-view="FREE PLAY"]')) return;
          window.freePlayTiming.view = performance.now();
          requestAnimationFrame(() => { window.freePlayTiming.frame = performance.now(); });
          observer.disconnect();
        });
        observer.observe(document.getElementById('root'), { childList: true, subtree: true });
      }, { capture: true, once: true });
    });
    await page.getByRole('button', { name: route === 'landing' ? 'FREE PLAY' : 'PLAY', exact: true }).first().click();
    await page.locator('.app-container[data-view="FREE PLAY"]').waitFor();
    await page.locator('.app-container[data-view="FREE PLAY"] canvas').waitFor();
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('.app-container[data-view="FREE PLAY"] canvas');
      return { canvasReady: Boolean(canvas && canvas.width > 0 && canvas.height > 0), canvasSize: canvas ? [canvas.width, canvas.height] : null,
        timing: window.freePlayTiming };
    });
    console.log(JSON.stringify({ route, ...result, errors }));
    if (!result.canvasReady || errors.length) process.exitCode = 1;
    if (route === 'landing' && process.env.FREE_PLAY_SCREENSHOT) {
      await page.screenshot({ path: process.env.FREE_PLAY_SCREENSHOT, fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
