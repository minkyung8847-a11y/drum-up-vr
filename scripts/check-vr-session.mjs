import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createRelay } from '../server/relay.mjs';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

// Real application + Three WebXRManager + real Web Audio and WebSockets.
// Only the headset/poses/haptic actuator are mocked. No product code is patched.
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const relay = createRelay({ origins: [origin] });
await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
const endpoint = `ws://127.0.0.1:${relay.server.address().port}/pedal`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const vr = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const laptop = await browser.newPage();
  const errors = [];
  for (const page of [vr, laptop]) {
    page.setDefaultTimeout(30_000);
    page.on('pageerror', error => errors.push(error.message));
  }
  await vr.addInitScript(installMockWebXR);
  await vr.goto(`${origin}/#/vr`);
  await vr.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await vr.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url); window.THREE = THREE;
    const update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) {
        window.scene = this;
        this.onAfterRender = (renderer, scene, camera) => {
          window.renderer = renderer;
          window.stereoEyes = camera.isArrayCamera ? camera.cameras.length : 0;
        };
      }
      return update.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    window.synth = drumSynth; window.hits = []; window.voices = [];
    const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (id, velocity) => {
      window.hits.push({ id, velocity, at: performance.now() }); return trigger(id, velocity);
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args), start = source.start.bind(source);
      source.start = (...params) => {
        const note = [...drumSynth.kitBuffers.get(drumSynth.getCurrentKitId()).entries()].find(([, buffer]) => buffer === source.buffer)?.[0];
        window.voices.push({ note, delay: performance.now() - window.hits.at(-1).at }); return start(...params);
      }; return source;
    };
    window.snapshotKit = () => {
      const values = [];
      window.scene.getObjectByName('kick-pedal').parent.traverse(object => {
        values.push([object.id, ...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]);
      });
      return values;
    };
  });
  await vr.waitForFunction(() => window.renderer);
  const original = await vr.evaluate(() => ({
    kit: window.snapshotKit(),
    rig: window.scene.getObjectByName('player-rig').position.toArray(),
    camera: window.scene.getObjectByName('player-camera').matrix.toArray(),
  }));
  await vr.getByRole('button', { name: 'Kick pedal', exact: true }).click();
  await vr.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await vr.getByRole('button', { name: '새 연결 코드' }).click();
  await vr.getByTestId('pairing-code').waitFor();
  const code = await vr.getByTestId('pairing-code').textContent();
  await vr.getByRole('checkbox').check();
  await laptop.goto(`${origin}/#/pedal`);
  await laptop.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await laptop.getByLabel('VR 연결 코드').fill(code);
  await laptop.getByRole('button', { name: 'VR에 연결', exact: true }).click();
  await laptop.getByTestId('pedal-connection').filter({ hasText: '연결됨' }).waitFor();

  await vr.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await vr.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const entry = await vr.evaluate(() => {
    const session = window.testXR;
    // Deliberately reverse source order; hand identity must never depend on it.
    window.right = session.connect('right'); window.left = session.connect('left');
    session.step(3);
    const tracked = hand => [0, 1, 2, 3].some(index => {
      const grip = window.renderer.xr.getControllerGrip(index);
      return grip.visible && grip.getObjectByName(`${hand}-stick-grip`)?.visible === true;
    });
    return { active: window.renderer.xr.isPresenting, eyes: window.stereoEyes,
      left: tracked('left'), right: tracked('right'), hits: window.hits.length, running: window.synth.isAudioRunning() };
  });
  assert.deepEqual(entry, { active: true, eyes: 2, left: true, right: true, hits: 0, running: true });
  console.log('PASS: actual Enter VR handler, local-floor session, Three stereo render loop, both tracked sticks and audio unlock');

  const strikes = await vr.evaluate(() => {
    const T = window.THREE, session = window.testXR, rig = window.scene.getObjectByName('player-rig');
    const root = window.scene.getObjectByName('kick-pedal').parent;
    const rest = window.snapshotKit();
    const ids = ['snare', 'smallTom', 'middleTom', 'floorTom', 'hihat', 'crash', 'ride'];
    const samples = [];
    window.placeStick = (hand, id) => {
      window.lift(hand);
      const source = window[hand]; source.gripSpace.tracked = false; session.step();
      const group = root.children.find(object => object.userData.drumType === id);
      const cymbal = ['hihat', 'crash', 'ride'].includes(id);
      const mesh = group.children.find(object => object.isMesh && object.userData.drumType === id
        && (cymbal ? object.geometry.type === 'LatheGeometry' : object.position.y > 0));
      mesh.updateWorldMatrix(true, false);
      const target = mesh.getWorldPosition(new T.Vector3());
      const normal = new T.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
      target.addScaledVector(normal, cymbal ? .14 : .12);
      const offset = new T.Vector3(0, 0, -.31).applyAxisAngle(new T.Vector3(1, 0, 0), 12 * Math.PI / 180);
      rig.worldToLocal(target); target.sub(offset);
      source.gripSpace.position = target.toArray();
      source.gripSpace.quaternion = [0, 0, 0, 1];
      source.gripSpace.tracked = true; session.step(6);
    };
    window.flick = hand => {
      // 2.9-degree wrist turn, no grip translation or direct drum contact.
      const source = window[hand];
      source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -.05).toArray();
      session.step();
    };
    window.lift = hand => { window[hand].gripSpace.quaternion = [0, 0, 0, 1]; session.step(6); };
    for (const hand of ['left', 'right']) {
      for (const id of ids) {
        const before = window.hits.length, hapticsBefore = session.pulses.length;
        window.placeStick(hand, id); window.flick(hand);
        session.step(10);
        samples.push({ hand, id, hits: window.hits.slice(before), pulses: session.pulses.slice(hapticsBefore) });
        // Settle effects before choosing the next instrument's world surface.
        session.step(55);
      }
    }
    const after = window.snapshotKit();
    const sameRest = JSON.stringify(rest) === JSON.stringify(after);
    // Two independently re-armed hands, one shared snare, one hit per flick.
    window.placeStick('left', 'snare'); window.placeStick('right', 'snare');
    const beforeRoll = window.hits.length;
    for (let i = 0; i < 6; i++) { const hand = i % 2 ? 'right' : 'left'; window.lift(hand); window.flick(hand); }
    session.step(55);
    return { samples, roll: window.hits.slice(beforeRoll), sameRest, voices: window.voices };
  });
  const soundIds = { snare: 'snare', smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor',
    hihat: 'hihat-closed', crash: 'crash', ride: 'ride' };
  for (const sample of strikes.samples) {
    assert.deepEqual(sample.hits.map(hit => hit.id), [soundIds[sample.id]], `${sample.hand} wrist flick toward ${sample.id}`);
    assert.equal(sample.pulses.length, 1);
    assert.equal(sample.pulses[0].hand, sample.hand);
    assert.equal(sample.pulses[0].duration, 18);
  }
  assert.equal(strikes.roll.length, 6);
  assert(strikes.roll.every(hit => hit.id === 'snare'));
  assert(strikes.sameRest, 'Resting kit transforms unchanged by XR hits');
  assert.equal(strikes.voices.length, 20);
  assert(strikes.voices.every(voice => Number.isFinite(voice.note)));
  console.log('PASS: both hands, 14 non-contact wrist strikes on actual kit, 6 alternating hits, 20 sample voices, per-hand haptic calls');

  const tracking = await vr.evaluate(() => {
    const session = window.testXR, T = window.THREE;
    session.head.position = [.13, 1.25, -.09];
    session.head.quaternion = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .25).toArray();
    session.step(2);
    const camera = window.renderer.xr.getCamera(), position = camera.getWorldPosition(new T.Vector3());
    const orientation = camera.getWorldQuaternion(new T.Quaternion());
    const followsHead = Math.abs(position.y - 1.25) < 1e-5 && Math.abs(position.z - .91) < .04
      && Math.abs(orientation.y - Math.sin(.125)) < 1e-5;
    const before = window.hits.length;
    window.left.gripSpace.tracked = false;
    window.left.gripSpace.position = [-.2, .7, -.3];
    session.step(3);
    window.left.gripSpace.tracked = true; session.step(3);
    session.visibilityState = 'visible-blurred'; window.flick('right'); session.step(2);
    session.visibilityState = 'visible'; session.step(3);
    session.reference.dispatchEvent(new Event('reset')); session.step(3);
    return { followsHead, noPhantomHits: before === window.hits.length };
  });
  assert.deepEqual(tracking, { followsHead: true, noPhantomHits: true });
  console.log('PASS: head translation/rotation, tracking loss/recovery, blurred session and reference reset without phantom hits');

  const kickBefore = await vr.evaluate(() => window.hits.length);
  // Immersive VR can hide the DOM. The XR session visibility must take priority.
  await vr.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
  await laptop.getByRole('button', { name: 'TEST KICK', exact: true }).click();
  await laptop.getByTestId('played-count').filter({ hasText: /^1$/ }).waitFor();
  await laptop.keyboard.press('Space');
  await laptop.getByTestId('played-count').filter({ hasText: /^2$/ }).waitFor();
  const kickResult = await vr.evaluate(() => {
    window.testXR.step(2);
    const moved = Math.abs(window.scene.getObjectByName('kick-beater').rotation.x) > .001;
    window.testXR.squeeze(window.left); window.testXR.squeeze(window.right);
    window.testXR.step(55);
    return { moved, hits: window.hits.slice(-4).map(hit => hit.id), notes: window.voices.slice(-4).map(voice => voice.note) };
  });
  assert.equal(await vr.evaluate(() => window.hits.length), kickBefore + 4);
  assert(kickResult.moved); assert.deepEqual(kickResult.hits, ['kick', 'kick', 'kick', 'kick']);
  assert.deepEqual(kickResult.notes, [36, 36, 36, 36]);
  await vr.evaluate(() => { window.testXR.visibilityState = 'visible-blurred'; });
  await laptop.keyboard.press('Space'); await laptop.waitForTimeout(100);
  assert.equal(await vr.evaluate(() => window.hits.length), kickBefore + 4);
  await vr.evaluate(() => { window.testXR.visibilityState = 'visible'; window.testXR.step(3); });
  assert.equal(await vr.evaluate(() => window.hits.length), kickBefore + 4, 'No deferred kick on visibility recovery');
  console.log('PASS: immersive remote TEST/Space and both grip buttons use existing kick sample/animation; hidden DOM accepted, blurred XR rejected');

  await vr.evaluate(() => { delete document.visibilityState; });
  await vr.getByRole('button', { name: 'Exit VR', exact: true }).click();
  await vr.getByRole('button', { name: 'Enter VR', exact: true }).waitFor();
  await vr.waitForFunction(() => !window.renderer.xr.isPresenting && window.stereoEyes === 0);
  const restored = await vr.evaluate(() => ({
    kit: window.snapshotKit(),
    rig: window.scene.getObjectByName('player-rig').position.toArray(),
    camera: window.scene.getObjectByName('player-camera').matrix.toArray(),
  }));
  assert.deepEqual(restored, original, 'XR exit restores exact drum transforms and desktop viewpoint');
  await vr.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await vr.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  await vr.evaluate(() => {
    window.left = window.testXR.connect('left'); window.right = window.testXR.connect('right'); window.testXR.step(3);
  });
  const beforeReentry = await vr.evaluate(() => window.hits.length);
  await vr.evaluate(() => window.testXR.squeeze(window.left));
  assert.equal(await vr.evaluate(() => window.hits.length), beforeReentry + 1, 'Reentry has one live kick listener');
  await vr.getByRole('button', { name: 'Exit VR', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: exit/reentry, exact kit/viewpoint restoration, no duplicate kick listeners or browser errors');
  console.log('SIMULATION ONLY: no real headset, physical pedal, native compositor, network/Wi-Fi or audible latency verification.');
} finally {
  await browser?.close(); await relay.close(); await vite.close();
}
