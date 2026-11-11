import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { openVRPractice } from './helpers/open-vr-practice.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const xrMode = process.env.FOOT_PEDAL_XR_MODE || 'immersive-vr';
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await openVRPractice(page, `${origin}/#/vr`);
  await page.locator('.vr-practice-hint').filter({ hasText: 'Click to play' }).waitFor({ timeout: 30000 });
  await page.evaluate(async () => {
    const { drumSynth } = await import('/src/utils/synth.ts');
    window.hits = []; const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (id, velocity) => { window.hits.push(id); return trigger(id, velocity); };
    const url = performance.getEntriesByType('resource').find(e => /\/three\.js\?/.test(e.name)).name;
    const THREE = window.THREE = await import(url), update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-unified-panel')) window.scene = this;
      return update.apply(this, args);
    };
  });
  await page.waitForFunction(() => window.scene);
  await page.locator('.foot-pedal-settings > summary').click();
  const settings = page.getByRole('region', { name: 'Foot pedal settings' });
  assert.match(await settings.innerText(), /CURRENT KEY: SPACE/);
  assert.match(await settings.innerText(), /UNKNOWN/);
  await settings.getByRole('button', { name: 'TEST INPUT', exact: true }).click();
  await page.keyboard.down('Space'); await page.keyboard.down('Space');
  assert.equal(await page.evaluate(() => window.hits.filter(id => id === 'kick').length), 1);
  assert.match(await settings.innerText(), /PEDAL PRESSED/);
  assert.equal(await settings.locator('i.pressed').count(), 1);
  await page.waitForTimeout(160);
  assert.equal(await settings.locator('i.pressed').count(), 0, 'indicator auto releases even while held');
  await page.keyboard.down('Space');
  assert.equal(await page.evaluate(() => window.hits.length), 1, 'held repeat after pulse must not rearm');
  await page.keyboard.up('Space');
  assert.equal(await settings.locator('i.pressed').count(), 0);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.hits.length), 2);
  await settings.getByRole('button', { name: 'AUTO DETECT', exact: true }).click();
  assert.match(await settings.innerText(), /PRESS YOUR FOOT PEDAL/);
  await page.keyboard.down('f'); await page.keyboard.down('f'); await page.keyboard.up('f');
  assert.equal(await page.evaluate(() => window.hits.length), 2, 'binding must not trigger kick or existing F tom shortcut');
  assert.match(await settings.innerText(), /CURRENT KEY: KeyF/);
  await page.waitForTimeout(60); await page.keyboard.press('f'); await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => window.hits), ['kick', 'kick', 'kick']);
  await settings.getByRole('button', { name: 'AUTO DETECT', exact: true }).click(); await page.keyboard.press('Escape');
  assert.match(await settings.innerText(), /CURRENT KEY: KeyF/);
  await settings.getByRole('button', { name: 'AUTO DETECT', exact: true }).click(); await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  await page.evaluate(() => { window.right = window.testXR.connect('right'); window.left = window.testXR.connect('left'); window.testXR.step(3); });
  const initial = await page.evaluate(() => ({ ...window.scene.getObjectByName('vr-unified-panel').userData.panelState.footPedal }));
  assert.equal(initial.immersive, true); assert.equal(initial.status, 'WAITING FOR INPUT'); assert.equal(initial.lastInput, null);
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'CANVAS');
  await page.evaluate(installUnifiedPanelControls);
  if (xrMode === 'immersive-ar') await page.evaluate(() => {
    window.right.targetRaySpace = { ...window.right.gripSpace };
    window.panelMode(window.right, 'ar');
  });
  await page.evaluate(() => {
    window.right.targetRaySpace = { ...window.right.gripSpace };
    window.panelClick(window.right, 880, 106);
    window.panelClick(window.right, 390, 435);
    const state = window.scene.getObjectByName('vr-unified-panel').userData.panelState;
    if (!state.footPedalOpen) throw Error('CONTROLLER must show FOOT PEDAL controls immediately');
    window.panelClick(window.right, 512, 538); // Collapse and reopen the entry itself.
    if (state.footPedalOpen) throw Error('FOOT PEDAL entry did not collapse');
    window.panelClick(window.right, 512, 538);
    window.panelClick(window.right, 260, 588); // Disable through the actual XR ray.
    if (state.footPedal.enabled) throw Error('ENABLE FOOT PEDAL did not turn off');
    const before = window.hits.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    if (window.hits.length !== before) throw Error('Disabled pedal still played');
    window.panelClick(window.right, 200, 640);
    if (state.footPedal.detecting) throw Error('Disabled pedal started detection');
    window.panelClick(window.right, 260, 588); // Enable again.
    if (!state.footPedal.enabled) throw Error('ENABLE FOOT PEDAL did not turn on');
    window.panelClick(window.right, 200, 640);
  });
  assert.equal(await page.evaluate(() => window.scene.getObjectByName('vr-unified-panel').userData.panelState.footPedal.detecting), true, 'VR ray opens SETTINGS → CONTROLLER → FOOT PEDAL → AUTO DETECT');
  await page.keyboard.press('j');
  assert.equal(await page.evaluate(() => window.scene.getObjectByName('vr-unified-panel').userData.panelState.footPedal.code), 'KeyJ');
  await page.evaluate(() => window.panelClick(window.right, 200, 640));
  await page.keyboard.press('Space');
  await page.evaluate(() => window.panelClick(window.right, 500, 640));
  await page.keyboard.down('Space');
  await page.evaluate(() => window.panelStep(6));
  const preview = join(tmpdir(), 'drum-up-foot-pedal-settings-' + xrMode + '.png');
  const image = await page.evaluate(() => window.scene.getObjectByName('vr-unified-panel').material.map.image.toDataURL('image/png'));
  await writeFile(preview, Buffer.from(image.split(',')[1], 'base64'));
  console.log('VR PANEL PREVIEW: ' + preview);
  await page.keyboard.up('Space');
  await page.waitForTimeout(70);
  const simultaneous = await page.evaluate(() => {
    const count = window.hits.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true, bubbles: true }));
    window.testXR.squeeze(window.right);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', cancelable: true, bubbles: true }));
    return window.hits.length - count;
  });
  assert.equal(simultaneous, 1, 'pedal followed immediately by Grip must share one kick');
  await page.waitForTimeout(70);
  const reversed = await page.evaluate(() => {
    const count = window.hits.length; window.testXR.squeeze(window.right);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', cancelable: true }));
    return window.hits.length - count;
  });
  assert.equal(reversed, 1, 'Grip followed by pedal must share one kick');
  await page.waitForTimeout(70);
  const onlyGrip = await page.evaluate(() => { const n = window.hits.length; window.testXR.squeeze(window.right); return window.hits.length - n; });
  assert.equal(onlyGrip, 1);
  const debug = await page.evaluate(() => window.scene.getObjectByName('vr-unified-panel').userData.panelState.footPedal);
  assert.equal(debug.status, 'INPUT DETECTED'); assert.equal(debug.eventCode, 'Space'); assert(debug.down && debug.up);
  assert.equal(debug.pressed, false);
  // Pure input lifecycle cases with a separate EventTarget; no physical USB is emulated.
  const cases = await page.evaluate(async () => {
    const { createFootPedal, createPedalGripGate } = await import('/src/pedal/footPedal.ts');
    const target = new EventTarget(); let stored = null, kicks = 0;
    target.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
    const pedal = createFootPedal(target, { active: () => true, changed: () => {}, kick: () => { kicks++; return true; } });
    const send = (type, code = 'Space', repeat = false) => { const e = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : 'j', repeat, cancelable: true }); target.dispatchEvent(e); return e.defaultPrevented; };
    const prevented = send('keydown'); send('keydown'); send('keydown', 'Space', true); send('keyup'); send('keydown'); send('keyup');
    const debounced = kicks === 1;
    pedal.detect(); send('keydown', 'KeyJ'); send('keyup', 'KeyJ');
    const saved = JSON.parse(stored).code === 'KeyJ';
    pedal.setImmersive(true); pedal.test(); pedal.tick(performance.now() + 13000);
    const noInput = pedal.state.status === 'WAITING FOR INPUT' && pedal.state.message.includes('입력 미감지');
    pedal.detect(); send('keydown', 'Escape'); const cancelled = !pedal.state.detecting && pedal.state.code === 'KeyJ';
    pedal.detect(); pedal.cancel(); const buttonCancelled = !pedal.state.detecting;
    pedal.dispose(); const n = kicks; send('keydown', 'KeyJ'); const disposed = kicks === n;
    let time = 0, total = 0; const gate = createPedalGripGate(() => time), hit = () => { total++; return true; };
    gate('pedal', hit); time = 10; gate('grip', hit); time = 70; gate('grip', hit); time = 80; gate('pedal', hit); time = 140; gate('pedal', hit);
    const restored = createFootPedal(target, { active: () => true, changed: () => {}, kick: () => true });
    const bindingRestored = restored.state.code === 'KeyJ';
    restored.setEnabled(false); restored.dispose();
    const disabled = createFootPedal(target, { active: () => true, changed: () => {}, kick: () => { throw Error('Disabled'); } });
    const enabledRestored = disabled.state.enabled === false; disabled.dispose();
    return { prevented, debounced, saved, bindingRestored, enabledRestored, noInput, cancelled, buttonCancelled, disposed, gate: total === 3 };
  });
  for (const [key, value] of Object.entries(cases)) assert.equal(value, true, key);
  // Actual MUSIC/start → hitDrum → highway.strike path. Only the XR device and
  // transport clock are controlled; chart, sound, interaction and judgments are real.
  await page.evaluate(async () => {
    const { VRMusicTransport } = await import('/src/components/vrMusicSong.ts');
    const descriptor = Object.getOwnPropertyDescriptor(VRMusicTransport.prototype, 'currentTime');
    Object.defineProperty(VRMusicTransport.prototype, 'currentTime', { ...descriptor,
      get() { return window.controlledSongTime ?? descriptor.get.call(this); } });
    window.panelClick(window.right, 200, 106);
    window.panelClick(window.right, 350, 430); window.panelStep(30);
    const detail = window.scene.getObjectByName('vr-song-detail'), rig = window.scene.getObjectByName('player-rig');
    const localX = 0, point = detail.localToWorld(new window.THREE.Vector3(localX, (.5 - 1050 / 1200) * .827, 0));
    const origin = new window.THREE.Vector3(.24, 1.15, .86);
    window.right.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
    window.right.targetRaySpace.quaternion = new window.THREE.Quaternion().setFromUnitVectors(new window.THREE.Vector3(0, 0, -1), point.sub(origin).normalize()).toArray();
    window.panelStep(3); window.right.gamepad.buttons[0].pressed = true; window.right.gamepad.buttons[0].value = 1;
    window.panelStep(); window.right.gamepad.buttons[0].pressed = false; window.right.gamepad.buttons[0].value = 0; window.panelStep(3);
  });
  await page.waitForFunction(() => window.scene.getObjectByName('vr-unified-panel').userData.panelState.minimized, { timeout: 30000 });
  const song = await page.evaluate(async () => {
    const { LOVE_COUNT_IN, loveChartOffset } = await import('/src/components/vrMusicSong.ts');
    const chart = await (await fetch('/songs/love/love_full_75_bars_DRAFT.json')).json();
    const kicks = chart.notes.filter(note => note.instrument === 'kick').slice(0, 3);
    const state = window.scene.getObjectByName('vr-unified-panel').userData.panelState;
    const results = [];
    for (const [i, note] of kicks.entries()) {
      await new Promise(resolve => setTimeout(resolve, 65));
      window.controlledSongTime = LOVE_COUNT_IN + loveChartOffset() + note.time + [0, .08, .3][i] + state.noteSyncMs / 1000;
      window.panelStep(2);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', cancelable: true }));
      results.push(state.judgment);
    }
    return results;
  });
  assert.deepEqual(song, ['Perfect', 'Great', 'Miss'], 'USB keyboard path reaches original MUSIC kick judgments');
  console.log('PASS actual MUSIC kick path: Perfect / Great / Miss using controlled song clock and mocked XR.');
  await page.getByRole('button', { name: 'Exit VR', exact: true }).click();
  await page.reload(); await page.locator('.vr-practice-hint').filter({ hasText: 'Click to play' }).waitFor();
  await page.locator('.foot-pedal-settings > summary').click();
  assert.match(await page.getByRole('region', { name: 'Foot pedal settings' }).innerText(), /CURRENT KEY: SPACE/);
  assert.deepEqual(errors, []);
  console.log('PASS Windows Edge browser: Space/repeat/release, auto detect F intercepts tom shortcut, save/cancel, indicator, shared kick audio path.');
  console.log('PASS ' + xrMode + ' mocked WebXR only: entry focus, fresh status, keyboard → existing kick, pedal/Grip dedupe both orders, Grip alone, XR diagnostics.');
  console.log('PASS lifecycle: debounce, preventDefault, no-input notice, disposal. Physical Quest 3 USB/WebXR NOT VERIFIED.');
} finally { await browser?.close(); await server.close(); }
