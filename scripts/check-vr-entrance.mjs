import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const pageFor = async (viewport, denyFullscreen = false) => {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30_000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /THREE.WebGLProgram|THREE.WebGLRenderer: Error/.test(message.text()))
        errors.push(message.text());
    });
    await page.addInitScript(deny => {
      let fullscreen = null;
      Object.defineProperty(document, 'fullscreenElement', { get: () => fullscreen });
      Element.prototype.requestFullscreen = async function () {
        window.fullscreenRequested = navigator.userActivation.isActive;
        if (deny) throw new DOMException('Fullscreen denied', 'NotAllowedError');
        fullscreen = this;
      };
      document.exitFullscreen = async () => { fullscreen = null; window.fullscreenExited = true; };
    }, denyFullscreen);
    return page;
  };
  const confirm = async page => {
    await page.getByRole('button', { name: 'VR ZONE' }).click();
    const dialog = page.getByRole('dialog', { name: '몰입형 VR 경험을 시작하시겠습니까?' });
    assert.deepEqual(await dialog.getByRole('button').allTextContents(), ['YES']);
    await dialog.getByRole('button', { name: 'YES', exact: true }).click();
    await page.waitForURL('**/#/vr');
  };

  const desktop = await pageFor({ width: 1280, height: 720 });
  await desktop.goto(url);
  await desktop.getByRole('button', { name: 'VR ZONE' }).click();
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.getByRole('dialog').count(), 0);
  assert.equal(desktop.url(), url + '/');
  await confirm(desktop);
  assert.ok(await desktop.evaluate(() => window.fullscreenRequested && !!document.fullscreenElement));
  await desktop.getByRole('button', { name: 'Reset view' }).waitFor();
  assert.equal(await desktop.locator('.vr-entrance-target').count(), 0);
  await desktop.goBack({ waitUntil: 'domcontentloaded' });
  await desktop.getByRole('button', { name: 'VR ZONE' }).waitFor();
  assert.ok(await desktop.evaluate(() => window.fullscreenExited && !document.fullscreenElement));
  await desktop.close();

  const mobile = await pageFor({ width: 390, height: 844 }, true);
  await mobile.goto(url);
  await confirm(mobile);
  await mobile.getByRole('button', { name: 'Reset view' }).waitFor();
  assert.ok(await mobile.evaluate(() => window.fullscreenRequested && !document.fullscreenElement));
  await mobile.close();

  const denied = await pageFor({ width: 390, height: 844 });
  await denied.addInitScript(installMockWebXR, { rejectVR: true });
  await denied.goto(url);
  await confirm(denied);
  await denied.getByRole('button', { name: 'Reset view' }).waitFor();
  assert.deepEqual(await denied.evaluate(() => window.testXRRequests), [{ mode: 'immersive-vr', active: true }]);
  assert.equal(await denied.getByRole('button', { name: 'Exit VR' }).count(), 0);
  await denied.close();

  const xr = await pageFor({ width: 1080, height: 720 });
  await xr.addInitScript(installMockWebXR, { mode: 'switchable' });
  await xr.goto(url);
  await confirm(xr);
  await xr.waitForFunction(() => window.testXR?.callbacks.size);
  await xr.evaluate(() => {
    window.testXR.head.position = [.55, 1.5, .2];
    window.testXR.step();
    window.testXR.step(1, .45);
  });
  await xr.locator('.vr-practice-toolbar button').filter({ hasText: 'Exit VR' }).waitFor({ state: 'attached' });
  await xr.evaluate(() => window.testXR.step(22));
  await xr.locator('.vr-practice.is-tutorial').waitFor();
  assert.equal(await xr.evaluate(() => window.testXRRequests.length), 1);
  assert.ok(await xr.evaluate(() => window.testXRRequests[0].active));
  await xr.evaluate(() => window.testXR.end());
  await xr.getByRole('button', { name: 'VR ZONE' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('YES-only confirmation, automatic entry, fullscreen success/denial, trusted XR activation, fallback and headset exit passed.');
} finally {
  await browser?.close();
  await vite.close();
}
