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
  const showIntro = async page => {
    await page.getByRole('button', { name: 'VR ZONE' }).click();
    const dialog = page.getByRole('dialog', { name: '몰입형 VR 경험을 시작하시겠습니까?' });
    await dialog.getByRole('button', { name: 'ENTER', exact: true }).click();
    await page.waitForURL('**/#/vr');
    return page.getByRole('button', { name: '연주 공간 입장' });
  };
  const ready = page => page.waitForFunction(() => document.querySelector('.vr-entrance-target:not(:disabled)'));

  const desktop = await pageFor({ width: 1280, height: 720 });
  await desktop.goto(url);
  assert.equal(await desktop.getByRole('button', { name: 'AR DRUM' }).count(), 0);
  await desktop.getByRole('button', { name: 'VR ZONE' }).click();
  await desktop.getByRole('dialog').getByRole('button', { name: 'CANCEL' }).click();
  assert.equal(await desktop.getByRole('dialog').count(), 0);
  assert.equal(desktop.url(), url + '/');
  const desktopPortal = await showIntro(desktop);
  assert.ok(await desktop.evaluate(() => window.fullscreenRequested && !!document.fullscreenElement));
  await ready(desktop);
  assert.equal(await desktop.getByRole('button', { name: 'Reset view' }).count(), 0);
  await desktop.mouse.click(40, 40);
  assert.ok(await desktopPortal.isEnabled());
  const bounds = await desktopPortal.boundingBox();
  await desktop.mouse.click(bounds.x + bounds.width + 6, bounds.y + bounds.height / 2);
  await desktop.getByRole('button', { name: 'Reset view' }).waitFor();
  await desktop.goBack({ waitUntil: 'domcontentloaded' });
  await desktop.getByRole('button', { name: 'VR ZONE' }).waitFor();
  assert.ok(await desktop.evaluate(() => window.fullscreenExited && !document.fullscreenElement));
  await (await showIntro(desktop)).waitFor();
  await desktop.close();

  const mobile = await pageFor({ width: 390, height: 844 }, true);
  await mobile.addInitScript(installMockWebXR, { rejectVR: true });
  await mobile.goto(url);
  const mobilePortal = await showIntro(mobile);
  await ready(mobile);
  assert.ok(await mobile.evaluate(() => window.fullscreenRequested && !document.fullscreenElement && !window.testXRRequests));
  await mobilePortal.press('Enter');
  await mobile.getByRole('button', { name: 'Reset view' }).waitFor();
  assert.deepEqual(await mobile.evaluate(() => window.testXRRequests), [{ mode: 'immersive-vr', active: true }]);
  assert.equal(await mobile.getByRole('button', { name: 'Exit VR' }).count(), 0);
  await mobile.close();

  const xr = await pageFor({ width: 1080, height: 720 });
  await xr.addInitScript(installMockWebXR, { mode: 'switchable' });
  await xr.goto(url);
  const xrPortal = await showIntro(xr);
  await ready(xr);
  assert.ok(await xr.evaluate(() => !window.testXRRequests));
  await xrPortal.dblclick();
  await xr.waitForFunction(() => window.testXR?.callbacks.size);
  await xr.evaluate(() => {
    window.testXR.head.position = [.55, 1.5, .2];
    window.testXR.step();
    window.testXR.step(1, .45);
  });
  await xr.getByRole('button', { name: 'Exit VR' }).waitFor();
  assert.deepEqual(await xr.evaluate(() => window.testXRRequests), [{ mode: 'immersive-ar', active: true }]);
  await xr.evaluate(() => window.testXR.end());
  await xr.getByRole('button', { name: 'VR ZONE' }).waitFor();
  assert.ok(await xr.evaluate(() => window.fullscreenExited && !document.fullscreenElement));
  assert.deepEqual(errors, []);
  console.log('Confirmation, fullscreen success/denial, browser Back, replay, trusted XR activation, duplicate clicks, fallback and headset exit passed.');
} finally {
  await browser?.close();
  await vite.close();
}
