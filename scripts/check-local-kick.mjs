import assert from 'node:assert/strict';
import { request } from 'node:http';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

process.env.VITE_DRUMUP_LAN_KICK = '1';
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  const blockedOrigin = await new Promise((resolve, reject) => {
    const req = request(`${origin}/pedal`, { headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://other.example',
    } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(blockedOrigin, 403);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const headset = await browser.newPage(), laptop = await browser.newPage();
  const errors = [];
  for (const page of [headset, laptop]) page.on('pageerror', error => errors.push(error.message));
  await headset.addInitScript(installMockWebXR);
  await laptop.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url, protocols) {
        super(url, protocols);
        if (new URL(url).pathname === '/pedal') window.kickSocket = this;
      }
      send(data) {
        super.send(data);
        if (this === window.kickSocket && JSON.parse(data).type === 'kick') super.send(data);
      }
    };
  });
  await headset.goto(`${origin}/#/vr`, { waitUntil: 'domcontentloaded' });
  await headset.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await headset.evaluate(async () => {
    const { drumSynth } = await import('/src/utils/synth.ts');
    const play = drumSynth.trigger.bind(drumSynth);
    window.kicks = [];
    drumSynth.trigger = (id, velocity) => { window.kicks.push(id); return play(id, velocity); };
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const { Scene } = await import(url);
    const update = Scene.prototype.updateMatrixWorld;
    Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('lan-kick-debug')) window.kickScene = this;
      return update.apply(this, args);
    };
  });
  await headset.getByRole('button', { name: '로컬 킥 테스트', exact: true }).click();
  await headset.getByRole('button', { name: '로컬 연결 코드 만들기' }).click();
  const code = await headset.getByTestId('lan-kick-code').textContent();
  await laptop.goto(`${origin}/#/kick-test`, { waitUntil: 'domcontentloaded' });
  await laptop.getByLabel('VR 연결 코드').fill(code);
  await laptop.getByRole('button', { name: 'VR에 연결' }).click();
  const status = laptop.getByRole('status');
  await status.filter({ hasText: /^연결됨$/ }).waitFor();

  await headset.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await headset.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  await headset.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.testXR.step(2);
  });
  await laptop.getByRole('button', { name: 'TEST KICK' }).click();
  await laptop.keyboard.down('Space');
  await laptop.keyboard.down('Space');
  await laptop.keyboard.up('Space');
  await laptop.getByTestId('lan-kick-played').filter({ hasText: /^2$/ }).waitFor();
  await headset.getByTestId('lan-kick-received').filter({ hasText: /^2$/ }).waitFor();
  assert.equal(await laptop.getByTestId('lan-kick-sent').textContent(), '2');
  assert.deepEqual(await headset.evaluate(() => window.kicks), ['kick', 'kick']);
  const worldDebug = await headset.evaluate(() => {
    const panel = window.kickScene.getObjectByName('lan-kick-debug');
    const world = panel.matrixWorld.clone();
    window.testXR.head.position = [.22, 1.3, -.16];
    window.testXR.step(2);
    return { fixed: panel.parent === window.kickScene && panel.matrixWorld.equals(world), visible: panel.visible,
      moving: Math.abs(window.kickScene.getObjectByName('kick-beater').rotation.x) > .001 };
  });
  assert.deepEqual(worldDebug, { fixed: true, visible: true, moving: true });

  await headset.evaluate(() => { window.testXR.visibilityState = 'visible-blurred'; });
  await laptop.keyboard.press('Space');
  await laptop.getByTestId('lan-kick-dropped').filter({ hasText: /^1$/ }).waitFor();
  await headset.getByTestId('lan-kick-received').filter({ hasText: /^3$/ }).waitFor();
  assert.deepEqual(await headset.evaluate(() => window.kicks), ['kick', 'kick']);
  await headset.evaluate(() => { window.testXR.visibilityState = 'visible'; });

  await laptop.evaluate(() => window.kickSocket.close(4002, 'test-reconnect'));
  await status.filter({ hasText: /^재연결 중$/ }).waitFor();
  await status.filter({ hasText: /^연결됨$/ }).waitFor();
  await laptop.keyboard.press('Space');
  await laptop.getByTestId('lan-kick-played').filter({ hasText: /^3$/ }).waitFor();
  assert.deepEqual(await headset.evaluate(() => window.kicks), ['kick', 'kick', 'kick']);
  assert.deepEqual(errors, []);
  console.log('PASS: Vite same-origin WebSocket, held Space, duplicate rejection, immersive kick sound and motion, world-space debug, blurred-session rejection and reconnect.');
} finally {
  await browser?.close();
  await vite.close();
}
