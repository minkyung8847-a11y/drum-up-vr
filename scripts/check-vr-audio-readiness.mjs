import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5176/'}#/vr`);
  const status = page.getByRole('status');
  await status.filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const { drumSynth } = await import(performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name);
    window.audioReleases = [];
    drumSynth.prepareKit = () => new Promise(resolve => window.audioReleases.push(resolve));
    drumSynth.setKit(drumSynth.getCurrentKitId());
    drumSynth.setKit(drumSynth.getCurrentKitId());
  });
  await status.filter({ hasText: 'Loading drum sounds' }).waitFor();
  await page.evaluate(async () => {
    window.audioReleases[0](true);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.match(await status.textContent(), /Loading drum sounds/, 'An obsolete ready result cannot enable hits while the current kit is loading');
  await page.evaluate(() => window.audioReleases[1](true));
  await status.filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const { drumSynth } = await import(performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name);
    drumSynth.setKit(drumSynth.getCurrentKitId()); drumSynth.setKit(drumSynth.getCurrentKitId());
    window.audioReleases[3](true);
  });
  await status.filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    window.audioReleases[2](false);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.match(await status.textContent(), /Click to play/, 'An obsolete failure cannot disable the current prepared kit');
  assert.deepEqual(errors, []);
  console.log('PASS: overlapping kit preparations preserve current audio readiness; stale success/failure cannot enable delayed hits or disable the current kit. Acoustic hardware latency NOT tested.');
} finally { await browser.close(); }
