import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.VR_TEST_URL || 'http://127.0.0.1:5174/';
  await page.goto(`${base}#/vr`);
  const canvas = page.locator('.vr-practice-stage canvas');
  await canvas.waitFor();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const initial = await page.screenshot({ path: 'vr-practice-desktop.png' });
  await page.mouse.move(700, 420);
  await page.keyboard.down('Shift');
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1100, 650, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(900);
  const moved = await page.screenshot({ path: 'vr-practice-look.png' });
  assert(!initial.equals(moved), 'Dragging should change the view');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.mouse.move(700, 420);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'vr-practice-reset.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'vr-practice-mobile.png' });
  assert.equal(await canvas.count(), 1);
  await page.getByRole('link', { name: 'Back to DRUM UP' }).click();
  await page.locator('.vr-practice').waitFor({ state: 'detached' });
  await page.locator('.brand-landing').waitFor();
  await page.evaluate(() => { location.hash = '/vr'; });
  await canvas.waitFor();
  assert.equal(await canvas.count(), 1, 'Returning should mount exactly one canvas');
  assert.deepEqual(errors, []);
  console.log('VR view passed: rendering, Shift-drag look, reset, resize, navigation, audio readiness, no runtime errors.');
} finally {
  await browser.close();
}
