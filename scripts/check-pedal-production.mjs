import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { createRelay } from '../server/relay.mjs';

const site = await preview({ base: '/drum-up-vr/', preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${site.httpServer.address().port}`;
const relay = createRelay({ origins: [origin] });
await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
const endpoint = `ws://127.0.0.1:${relay.server.address().port}/pedal`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const vr = await browser.newPage(), laptop = await browser.newPage();
  const errors = [];
  for (const page of [vr, laptop]) { page.setDefaultTimeout(30_000); page.on('pageerror', error => errors.push(error.message)); }
  await vr.goto(`${origin}/drum-up-vr/#/vr`);
  await vr.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await vr.getByRole('button', { name: 'VR pedals', exact: true }).click();
  await vr.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await vr.getByRole('button', { name: '새 연결 코드' }).click();
  await vr.getByTestId('pairing-code').waitFor();
  const code = await vr.getByTestId('pairing-code').textContent();
  await vr.getByRole('button', { name: '소리 활성화', exact: true }).click();
  await vr.getByText('소리 준비 완료', { exact: true }).waitFor();
  await laptop.goto(`${origin}/drum-up-vr/#/pedal`);
  await laptop.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await laptop.getByLabel('VR 연결 코드').fill(code);
  await laptop.getByRole('button', { name: 'VR에 연결', exact: true }).click();
  await laptop.getByTestId('pedal-connection').filter({ hasText: '연결됨' }).waitFor();
  await laptop.getByRole('button', { name: 'TEST KICK', exact: true }).click();
  await laptop.getByTestId('played-count').filter({ hasText: /^1$/ }).waitFor();
  await vr.getByTestId('remote-kicks').filter({ hasText: /^1$/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: built GitHub Pages base path, both lazy routes, paired sockets, existing VR kick playback acknowledged, no runtime errors. Loopback smoke only; public TLS/headset not tested.');
} finally {
  await browser?.close(); await relay.close();
  await new Promise(resolve => site.httpServer.close(resolve));
}
