import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const pageFor = async viewport => {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30_000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/THREE.WebGLProgram|THREE.WebGLRenderer: Error/.test(message.text())) errors.push(message.text());
    });
    return page;
  };
  const desktop = await pageFor({ width: 1280, height: 720 });
  await desktop.goto(url);
  await desktop.getByRole('button', { name: 'VR ZONE' }).click();
  const target = desktop.getByRole('button', { name: '연주 공간 입장' });
  await target.waitFor();
  assert.equal(await desktop.getByRole('button', { name: 'Reset view' }).count(), 0);
  await desktop.waitForFunction(() => !document.querySelector('.vr-entrance-target').disabled);
  await desktop.mouse.click(40, 40);
  assert.ok(await target.isEnabled());
  const bounds = await target.boundingBox();
  await desktop.mouse.click(bounds.x + bounds.width + 8, bounds.y + bounds.height / 2);
  await desktop.getByRole('button', { name: 'Reset view' }).waitFor();
  await desktop.reload({waitUntil: 'domcontentloaded'});
  await desktop.getByRole('button', { name: 'Reset view' }).waitFor();
  assert.equal(await target.count(), 0);

  await desktop.close();
  const mobile = await pageFor({ width: 390, height: 844 });
  await mobile.goto(url + '/#/vr');
  await mobile.waitForFunction(() => document.querySelector('.vr-entrance-target:not(:disabled)'));
  await mobile.getByRole('button', { name: '연주 공간 입장' }).press('Enter');
  await mobile.getByRole('button', { name: 'Reset view' }).waitFor();

  await mobile.close();
  for (const input of ['walk', 'controller']) {
    const xr = await pageFor({ width: 1080, height: 720 });
    await xr.addInitScript(installMockWebXR);
    await xr.goto(url + '/#/vr');
    await xr.getByRole('button', { name: '헤드셋에서 VR 입장' }).click();
    await xr.waitForFunction(() => window.testXR?.callbacks.size);
    await xr.evaluate(input => {
      const session = window.testXR;
      session.head.position = [.55, 1.5, .2];
      session.step(1, .20);
      if (input === 'walk') {
        session.head.position[2] -= 1.65;
        session.step();
      } else {
        const source = session.connect('right');
        const angle = -Math.atan2(1.1, 1.65);
        source.targetRaySpace.position = [.55, 1.1, .2];
        source.targetRaySpace.quaternion = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
        session.emit('select', { inputSource: source, frame: session.frame() });
      }
      session.step();
      session.step(1, .75);
      session.step(1, 1.5);
    }, input);
    await xr.getByRole('button', { name: 'Exit VR' }).waitFor();
    await xr.getByRole('button', { name: 'Exit VR' }).click();
    await xr.getByRole('button', { name: 'Reset view' }).waitFor();
    await xr.close();
  }
  assert.deepEqual(errors, []);
  console.log('Desktop pointer, mobile keyboard, once-per-tab and mocked XR walk/controller passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
