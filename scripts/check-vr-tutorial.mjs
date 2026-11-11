import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { openVRPractice } from './helpers/open-vr-practice.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await server.listen();
const url = `${server.resolvedUrls.local[0]}#/vr`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const desktop = await browser.newPage();
  const errors = [];
  desktop.on('pageerror', error => errors.push(error.message));
  await openVRPractice(desktop, url, { firstTutorial: true });
  const replay = desktop.getByRole('button', { name: '튜토리얼 다시 보기' });
  await replay.click();
  const dialog = desktop.getByRole('dialog');
  await dialog.getByRole('button', { name: '튜토리얼 시작' }).click();
  await dialog.getByRole('heading', { name: 'STEP 01 / PLAY THE DRUMS' }).waitFor();
  for (const heading of [/RIGHT HAND/, /LEFT HAND/, /BOTH HANDS/, /NOTE TIMING/, /LEFT GRIP/]) {
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    await dialog.getByRole('heading', { name: heading }).waitFor();
  }
  await desktop.keyboard.down('h');
  await dialog.getByText('CLOSED HI-HAT', { exact: true }).waitFor();
  await desktop.keyboard.up('h');
  await dialog.getByText('OPEN HI-HAT', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '건너뛰기' }).click();
  await replay.waitFor();
  assert.equal(await desktop.evaluate(() => localStorage.getItem('drumup.vr.tutorial-seen.v1')), '1');
  await desktop.close();

  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await openVRPractice(page, url, { firstTutorial: true });
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = window.T = await import(url);
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-tutorial-panel')) window.scene = this;
      return update.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth);
    window.tutorialSounds = [];
    drumSynth.trigger = (id, velocity) => {
      window.tutorialSounds.push(id);
      return trigger(id, velocity);
    };
    window.longAudio = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.duration > 20) window.longAudio++;
      return start.apply(this, args);
    };
  });
  await page.waitForFunction(() => window.scene);
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  await page.evaluate(installUnifiedPanelControls);
  const result = await page.evaluate(() => {
    const { T, scene, testXR: session } = window;
    const left = session.connect('left'), right = session.connect('right');
    left.targetRaySpace = { ...left.gripSpace };
    right.targetRaySpace = { ...right.gripSpace };
    const panel = scene.getObjectByName('vr-tutorial-panel');
    const hub = scene.getObjectByName('vr-unified-panel');
    const rig = scene.getObjectByName('player-rig');
    const countdown = scene.getObjectByName('vr-song-countdown');
    const steps = [];
    const frame = (count = 1) => {
      const actual = performance.now.bind(performance);
      try { performance.now = () => session.time; session.step(count, 30); }
      finally { performance.now = actual; }
    };
    const click = x => {
      const { width, height } = panel.geometry.parameters;
      const point = panel.localToWorld(new T.Vector3((x / 1200 - .5) * width, (.5 - 343 / 403) * height, 0));
      const origin = new T.Vector3(.25, 1.15, .86);
      right.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
      right.targetRaySpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), point.sub(origin).normalize()).toArray();
      frame(2);
      right.gamepad.buttons[0].pressed = true;
      right.gamepad.buttons[0].value = 1;
      frame();
      window.panelEmit('selectstart', right);
      right.gamepad.buttons[0].pressed = false;
      right.gamepad.buttons[0].value = 0;
      frame();
      window.panelEmit('selectend', right);
      window.panelEmit('select', right);
      frame(13);
    };
    const highlighted = id => scene.getObjectByName(`vr-tutorial-highlight-${id}`).visible;
    const noteAnchor = () => scene.getObjectsByProperty('name', 'note-highway-anchor').find(anchor => anchor.visible);
    const feedback = () => noteAnchor()?.children.find(child => child.visible && child.userData.judgment)?.userData.judgment;
    frame(14);
    const firstPrompt = panel.visible && !hub.visible && panel.userData.step === 'welcome';
    click(445); steps.push(panel.userData.step);
    click(445); steps.push(panel.userData.step);
    const hatRing = highlighted('hihat');
    click(445); steps.push(panel.userData.step);
    const snareRing = highlighted('snare');
    click(445); steps.push(panel.userData.step);
    const tomRing = highlighted('smallTom');
    frame(31);
    const nextTom = highlighted('middleTom');
    click(445); steps.push(panel.userData.step);
    let demoPerfect = false, demoStick = false;
    for (let i = 0; i < 29; i++) {
      frame(4);
      demoPerfect ||= feedback() === 'Perfect';
      demoStick ||= scene.getObjectByName('vr-tutorial-demo-stick').visible;
    }
    click(445); steps.push(panel.userData.step);
    const lift = scene.getObjectByName('cymbal-lift-hihat');
    const open = lift.position.y;
    window.panelEmit('squeezestart', left);
    frame(7);
    const closed = lift.position.y;
    window.panelEmit('squeezeend', left);
    frame(7);
    const reopened = lift.position.y;
    const gripMarker = scene.getObjectByName('vr-tutorial-grip').visible;
    click(445); steps.push(panel.userData.step);
    const kickRing = highlighted('kick');
    const beater = scene.getObjectByName('kick-beater');
    const restBeater = beater.quaternion.clone();
    const beforeKick = window.tutorialSounds.filter(sound => sound === 'kick').length;
    window.panelEmit('squeezestart', right);
    window.panelEmit('squeezeend', right);
    frame();
    const beaterMoved = !beater.quaternion.equals(restBeater);
    frame(4);
    const kickCount = window.tutorialSounds.filter(sound => sound === 'kick').length - beforeKick;
    const actual = performance.now.bind(performance);
    try {
      performance.now = () => session.time;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', cancelable: true }));
    } finally { performance.now = actual; }
    frame(4);
    const pedalKickCount = window.tutorialSounds.filter(sound => sound === 'kick').length - beforeKick - kickCount;
    click(445); steps.push(panel.userData.step);
    click(445); steps.push(panel.userData.step);
    const labels = new Set(), notes = new Set();
    let sawMiss = false, earlyNote = false;
    for (let i = 0; i < 112; i++) {
      if (countdown.visible) labels.add(countdown.userData.label);
      const active = noteAnchor()?.children.filter(child => child.visible && child.name.startsWith('note-')) ?? [];
      if (countdown.visible && active.length) earlyNote = true;
      for (const note of active) notes.add(note.name);
      sawMiss ||= feedback() === 'Miss';
      if (panel.userData.step === 'complete') break;
      frame(4);
    }
    const complete = panel.userData.step === 'complete';
    frame(18);
    const lanesCleared = !scene.getObjectByName('vr-tutorial-lanes') && !countdown.visible;
    click(600);
    const restored = hub.visible && !panel.visible && !session.ended;
    const persisted = localStorage.getItem('drumup.vr.tutorial-seen.v1') === '1';
    window.panelClick(right, 880, 106);
    window.panelClick(right, 510, 866);
    frame(15);
    const reopenedFromSettings = panel.visible && !hub.visible && panel.userData.step === 'welcome';
    click(750);
    const skipped = hub.visible && !panel.visible && !session.ended;
    return { firstPrompt, steps, hatRing, snareRing, tomRing, nextTom, demoPerfect, demoStick,
      closed, open, reopened, gripMarker, kickRing, beaterMoved, kickCount, pedalKickCount, labels: [...labels], notes: [...notes],
      sawMiss, earlyNote, complete, lanesCleared, restored, persisted, reopenedFromSettings, skipped, longAudio: window.longAudio };
  });
  assert.deepEqual(result.steps, ['intro', 'hihat', 'snare', 'other', 'timing', 'hat-grip', 'kick', 'ready', 'practice']);
  assert.deepEqual(result.labels, ['3', '2', '1', 'GO!']);
  assert.equal(result.notes.filter(name => name.startsWith('note-hihat-')).length, 4);
  assert.equal(result.notes.filter(name => name.startsWith('note-snare-')).length, 4);
  assert.deepEqual(result.notes.map(name => Number(name.split('-').at(-1))).sort((a, b) => a - b),
    [6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000]);
  assert(result.closed < result.open - .02 && Math.abs(result.reopened - result.open) < .001, JSON.stringify(result));
  assert.equal(result.kickCount, 1);
  assert.equal(result.pedalKickCount, 1);
  assert.equal(result.longAudio, 0);
  assert.equal(result.earlyNote, false);
  for (const key of ['firstPrompt', 'hatRing', 'snareRing', 'tomRing', 'nextTom', 'demoPerfect', 'demoStick',
    'gripMarker', 'kickRing', 'beaterMoved', 'sawMiss', 'complete', 'lanesCleared', 'restored', 'persisted', 'reopenedFromSettings', 'skipped']) {
    assert(result[key], `${key}: ${JSON.stringify(result)}`);
  }
  await page.evaluate(() => window.testXR.end());
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  assert(await page.evaluate(() => {
    window.testXR.step(20);
    return window.scene.getObjectByName('vr-unified-panel').visible && !window.scene.getObjectByName('vr-tutorial-panel').visible;
  }), 'Returning after completion leaves the main UI open');
  assert.deepEqual(errors, []);
  console.log('PASS: desktop skip, XR Trigger steps, grip actions, demo judgment, 60 BPM count-in and eight notes, same-session restore and Settings replay.');
} finally {
  await browser?.close();
  await server.close();
}
