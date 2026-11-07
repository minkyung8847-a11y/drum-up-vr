import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = vite.resolvedUrls.local[0];
let browser;
const errors = [];
async function setup(options) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable', ...options });
  await page.goto(`${origin}#/vr`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url);
    const original = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) {
        window.vrScene = this;
        this.onAfterRender = renderer => { window.vrRenderer = renderer; };
      }
      return original.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth);
    const success = drumSynth.playRhythmSuccess.bind(drumSynth);
    window.hits = [];
    window.successTones = [];
    drumSynth.trigger = (id, velocity) => { window.hits.push(id); return trigger(id, velocity); };
    drumSynth.playRhythmSuccess = perfect => { window.successTones.push(perfect); success(perfect); };
    window.THREE = T;
    window.get = name => window.vrScene.getObjectByName(name);
    window.aim = (source, name, x = 0, y = 0) => {
      const session = window.testXR;
      const panel = window.get(name), rig = window.get('player-rig');
      const ray = source.targetRaySpace;
      ray.tracked = false;
      session.step();
      ray.position = rig.worldToLocal(panel.localToWorld(new T.Vector3(x, y, .5))).toArray();
      ray.quaternion = panel.quaternion.toArray();
      ray.tracked = true;
      session.step(3);
    };
    window.select = source => window.testXR.emit('select', { inputSource: source, frame: window.testXR.frame() });
    window.cursor = source => {
      source.gamepad.buttons[4].value = 1;
      window.testXR.step(2);
      source.gamepad.buttons[4].value = 0;
      window.testXR.step();
    };
    window.startChart = source => {
      window.aim(source, 'vr-rhythm-controls', -.124, .005);
      if (!window.get('ar-hand-cursor')?.visible) window.cursor(source);
      window.select(source);
      window.chartStart = performance.now();
    };
    window.playSnare = source => {
      const session = window.testXR, rig = window.get('player-rig');
      const kit = window.get('vr-drum-kit');
      const snare = kit.children.find(object => object.userData.drumType === 'snare');
      const mesh = snare.children.find(object => object.isMesh && object.userData.drumType === 'snare' && object.position.y > 0);
      const normal = new T.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
      const target = mesh.getWorldPosition(new T.Vector3()).addScaledVector(normal, .12);
      const stick = rig.children.map(object => object.getObjectByName('right-stick-grip'))
        .find(object => object?.parent.name.startsWith('controller-'));
      const offset = stick.parent.parent.worldToLocal(stick.getObjectByName('right-stick-tip').getWorldPosition(new T.Vector3()));
      const axis = new T.Vector3(1, 0, 0), pitch = -23 * Math.PI / 180;
      offset.applyAxisAngle(axis, pitch);
      source.gripSpace.tracked = false;
      session.time = window.chartStart + 4400;
      session.step();
      source.gripSpace.position = rig.worldToLocal(target).sub(offset).toArray();
      source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(axis, pitch).toArray();
      source.gripSpace.tracked = true;
      session.step(6);
      source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(axis, pitch - .05).toArray();
      session.step(2);
    };
  });
  await page.waitForFunction(() => window.vrRenderer);
  return page;
}
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await setup();
  await page.getByRole('button', { name: 'Change background' }).click();
  await page.getByRole('menuitemradio', { name: /Concert Arena/ }).click();
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const modes = await page.evaluate(() => {
    const { testXR: session, get, aim, select, startChart } = window;
    const background = window.vrScene.background;
    const kit = get('vr-drum-kit');
    const lanes = get('vr-note-lanes');
    const panel = get('ar-mode-window');
    const venue = get('concert-stage-environment');
    const backgroundAlpha = () => {
      const scene = window.vrScene;
      const afterRender = scene.onAfterRender;
      const alphas = [];
      scene.onAfterRender = (renderer, ...rest) => {
        afterRender(renderer, ...rest);
        const gl = renderer.getContext(), pixel = new Uint8Array(4);
        for (const x of [.25, .75]) {
          gl.readPixels(Math.floor(gl.drawingBufferWidth * x), gl.drawingBufferHeight - 2,
            1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          alphas.push(pixel[3]);
        }
      };
      try { session.step(); } finally { scene.onAfterRender = afterRender; }
      return alphas;
    };
    const first = session.mode === 'immersive-ar' && background.isDataTexture
      && background.image.data[3] === 255 && venue.visible && panel.visible && panel.parent === window.vrScene
      && backgroundAlpha().every(alpha => alpha === 255);
    session.connect('right', { hand: new Map(), gripSpace: null });
    const left = session.connect('left');
    const source = session.connect('right', { profiles: ['generic-trigger-squeeze-thumbstick'] });
    session.step(3);
    const gripCheck = () => {
      const hitCount = window.hits.length, pulseCount = session.pulses.length;
      session.emit('squeezestart', { inputSource: left, frame: session.frame() });
      session.emit('squeezestart', { inputSource: left, frame: session.frame() });
      const silentLeft = window.hits.length === hitCount && session.pulses.length === pulseCount;
      session.emit('squeezestart', { inputSource: source, frame: session.frame() });
      session.emit('squeezestart', { inputSource: source, frame: session.frame() });
      session.emit('squeezeend', { inputSource: source, frame: session.frame() });
      session.emit('squeezeend', { inputSource: left, frame: session.frame() });
      return silentLeft && window.hits.length === hitCount + 1 && window.hits.at(-1) === 'kick'
        && session.pulses.length === pulseCount + 1 && session.pulses.at(-1).hand === 'right'
        && session.pulses.at(-1).strength === 1 && session.pulses.at(-1).duration === 90;
    };
    const gripsInVR = gripCheck();
    const rig = get('player-rig');
    const defaultHead = { ...session.head };
    const initialStickPose = panel.matrixWorld.clone();
    session.head.position = [.22, 1.36, -.12];
    session.head.quaternion = [0, Math.sin(.65), 0, Math.cos(.65)];
    let stickEyeDraws = 0;
    panel.onBeforeRender = () => stickEyeDraws++;
    session.step();
    panel.onBeforeRender = () => {};
    const followsViewInBothEyes = stickEyeDraws === 2 && !panel.matrixWorld.equals(initialStickPose);
    Object.assign(session.head, defaultHead);
    session.step();
    const stickVisible = hand => rig.children.map(object => object.getObjectByName(`${hand}-stick-grip`))
      .find(object => object?.parent.name.startsWith('controller-'))?.visible;
    left.gamepad.buttons[4].pressed = source.gamepad.buttons[5].pressed = true;
    session.step(2);
    const ignoredOtherButtons = !get('ar-hand-cursor')?.visible && stickVisible('left') && stickVisible('right');
    left.gamepad.buttons[4].pressed = source.gamepad.buttons[5].pressed = false;
    source.gamepad.buttons[4].value = 1;
    session.step(10);
    const toggledOnce = get('ar-hand-cursor')?.visible && stickVisible('left') && !stickVisible('right');
    source.gamepad.buttons[4].value = 0;
    session.step();
    startChart(source);
    session.time = window.chartStart + 600;
    session.step();
    const chart = get('note-highway-anchor'), kick = get('note-kick-3000');
    const before = kick.position.clone();
    const panelPose = panel.matrixWorld.clone();
    const kitPose = kit.matrixWorld.clone();
    aim(source, 'ar-mode-window');
    select(source);
    session.step(30);
    const ar = window.vrScene.background === null && !venue.visible && !get('xr-view-fade').visible
      && chart === get('note-highway-anchor') && lanes === get('vr-note-lanes')
      && kick.visible && kick.position.distanceTo(before) > .01 && get('vr-rhythm-controls').visible
      && backgroundAlpha().every(alpha => alpha === 0);
    const controllersRemainPresent = stickVisible('left') && stickVisible('right');
    const gripsInAR = gripCheck();
    window.playSnare(source);
    const judgedInAR = window.hits.includes('snare') && get('rhythm-ripple-snare').visible
      && !get('note-snare-4500').visible;
    aim(source, 'ar-mode-window');
    select(source);
    session.step(30);
    const restored = window.vrScene.background === background && venue.visible && !get('xr-view-fade').visible
      && kit === get('vr-drum-kit') && kit.matrixWorld.equals(kitPose) && panel.matrixWorld.equals(panelPose)
      && chart === get('note-highway-anchor') && lanes === get('vr-note-lanes') && window.testXR === session && !session.ended;
    return { first, followsViewInBothEyes, ignoredOtherButtons, toggledOnce, ar, judgedInAR, restored,
      controllersRemainPresent, gripsInVR, gripsInAR,
      removedUIAbsent: !get('vr-stick-mode-window') && !get('vr-drum-position-settings')
        && !get('tracked-hand-stick-left') && !get('tracked-hand-stick-right'),
      noHandTrackingRequested: !session.enabledFeatures.includes('hand-tracking') };
  });
  assert.deepEqual(modes, { first: true, followsViewInBothEyes: true,
    ignoredOtherButtons: true, toggledOnce: true, ar: true, judgedInAR: true, restored: true,
    controllersRemainPresent: true, gripsInVR: true, gripsInAR: true,
    removedUIAbsent: true, noHandTrackingRequested: true });
  await page.getByRole('button', { name: 'Exit VR', exact: true }).click();
  await page.getByRole('button', { name: 'Enter VR', exact: true }).waitFor();
  await page.close();

  const fallback = await setup({ rejectFirstAR: true });
  await fallback.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await fallback.getByText(/First AR request rejected/).waitFor();
  await fallback.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await fallback.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  await fallback.evaluate(() => {
    const { testXR: session, get, aim, select, startChart } = window;
    if (session.mode !== 'immersive-vr') throw Error('Expected opaque fallback session');
    const source = session.connect('right');
    session.step(3);
    startChart(source);
    session.step(9);
    window.previousSession = session;
    window.previousChart = get('note-highway-anchor');
    window.previousLanes = get('vr-note-lanes');
    window.previousKit = get('vr-drum-kit');
    aim(source, 'ar-mode-window');
    select(source);
  });
  await fallback.getByRole('button', { name: 'Enter AR', exact: true }).waitFor();
  assert(await fallback.evaluate(() => window.previousSession.ended && window.testXR === window.previousSession));
  await fallback.getByRole('button', { name: 'Enter AR', exact: true }).click();
  await fallback.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const preserved = await fallback.evaluate(() => {
    const { get, testXR: session } = window;
    const source = session.connect('right');
    session.step(5);
    const rig = get('player-rig');
    const stick = rig.children.map(object => object.getObjectByName('right-stick-grip'))
      .find(object => object?.parent.name.startsWith('controller-'));
    const removedUIAbsent = !get('vr-stick-mode-window') && !get('vr-drum-position-settings');
    const note = get('note-kick-3000');
    const before = note.position.clone();
    session.step(10);
    return removedUIAbsent && stick.visible && session.mode === 'immersive-ar' && window.vrScene.background === null
      && get('note-highway-anchor') === window.previousChart && get('vr-note-lanes') === window.previousLanes
      && get('vr-drum-kit') === window.previousKit && note.visible && !note.position.equals(before);
  });
  assert.equal(preserved, true);
  assert.deepEqual(errors, []);
  console.log('PASS: controller-only VR/AR, removed UI absent, unchanged Grip/haptics and note judgments, A cursor, backgrounds and session continuity.');
} finally {
  await browser?.close();
  await vite.close();
}
