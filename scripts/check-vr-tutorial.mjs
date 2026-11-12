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
  const dialog = desktop.getByRole('dialog');
  await dialog.getByText('A 키 · 확인').waitFor();
  await desktop.keyboard.press('a');
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
  await desktop.close();

  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button', { name: 'VR ZONE' }).click();
  await page.getByRole('button', { name: 'YES', exact: true }).click();
  await page.waitForFunction(() => window.testXR?.callbacks.size);
  await page.evaluate(() => {
    window.testXR.head.position = [.55, 1.5, .2];
    window.testXR.step();
    window.testXR.step(1, .45);
  });
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
  await page.evaluate(() => window.testXR.step(15));
  await page.waitForFunction(() => window.scene);
  await page.evaluate(installUnifiedPanelControls);
  await page.waitForFunction(() => ['left', 'right'].every(hand =>
    window.scene.getObjectByName(`vr-tutorial-controller-${hand}`)?.children.length));
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
    const aim = point => {
      const origin = new T.Vector3(.25, 1.15, .86);
      right.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
      right.targetRaySpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), point.sub(origin).normalize()).toArray();
      frame(2);
    };
    const click = x => {
      const { width, height } = panel.geometry.parameters;
      aim(panel.localToWorld(new T.Vector3((x / 1200 - .5) * width, (.5 - 343 / 403) * height, 0)));
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
    left.gamepad.buttons[4].pressed = true;
    right.gamepad.buttons[5].pressed = true;
    frame(14);
    const ignoresOtherButtons = panel.userData.step === 'welcome';
    left.gamepad.buttons[4].pressed = false;
    right.gamepad.buttons[5].pressed = false;
    right.gamepad.buttons[4].pressed = true;
    frame(28); steps.push(panel.userData.step);
    right.gamepad.buttons[4].pressed = false;
    frame();
    click(445); steps.push(panel.userData.step);
    const hatRing = highlighted('hihat');
    const rightModel = scene.getObjectByName('vr-tutorial-controller-right');
    const leftModel = scene.getObjectByName('vr-tutorial-controller-left');
    const rightGuide = rightModel.visible && !leftModel.visible && scene.getObjectByName('vr-tutorial-guide-line-right').visible;
    click(445); steps.push(panel.userData.step);
    const snareRing = highlighted('snare');
    const leftGuide = leftModel.visible && !rightModel.visible && scene.getObjectByName('vr-tutorial-guide-line-left').visible;
    click(445); steps.push(panel.userData.step);
    const tomRing = highlighted('smallTom');
    const bothGuides = leftModel.visible && rightModel.visible;
    frame(31);
    const nextTom = highlighted('middleTom');
    click(445); steps.push(panel.userData.step);
    let demoPerfect = false, demoStick = false;
    const eye = rig.localToWorld(new T.Vector3(...session.head.position));
    const elevation = point => {
      point.sub(eye);
      return Math.atan2(point.y, Math.hypot(point.x, point.z));
    };
    const line = scene.getObjectByName('vr-tutorial-lanes').getObjectByName('vr-judgment-line');
    const panelBottom = panel.localToWorld(new T.Vector3(0, -panel.geometry.parameters.height / 2, 0));
    const lineUncovered = elevation(panelBottom) > elevation(line.getWorldPosition(new T.Vector3())) + .07;
    for (let i = 0; i < 29; i++) {
      frame(4);
      demoPerfect ||= feedback() === 'Perfect';
      demoStick ||= scene.getObjectByName('vr-tutorial-demo-stick').visible;
    }
    click(445); steps.push(panel.userData.step);
    const lift = scene.getObjectByName('cymbal-lift-hihat');
    const open = lift.position.y;
    frame(21);
    const automaticHatClosed = lift.position.y < open - .02;
    frame(26);
    const automaticHatOpened = Math.abs(lift.position.y - open) < .001;
    window.panelEmit('squeezestart', left);
    frame(7);
    const closed = lift.position.y;
    const pressedGrip = leftModel.getObjectByName('xr_standard_squeeze_pressed_value');
    const maxGrip = leftModel.getObjectByName('xr_standard_squeeze_pressed_max');
    const nativeGripPressed = pressedGrip.quaternion.angleTo(maxGrip.quaternion) < .001;
    window.panelEmit('squeezeend', left);
    frame(7);
    const reopened = lift.position.y;
    const gripMarker = scene.getObjectByName('vr-tutorial-grip').visible;
    click(445); steps.push(panel.userData.step);
    const kickRing = highlighted('kick');
    const beater = scene.getObjectByName('kick-beater');
    const beforeAutomaticKick = window.tutorialSounds.filter(sound => sound === 'kick').length;
    frame(19);
    const automaticKick = window.tutorialSounds.filter(sound => sound === 'kick').length === beforeAutomaticKick + 1;
    frame(7);
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
    const beforeDrag = panel.position.clone();
    const handle = scene.getObjectByName('vr-tutorial-drag-handle');
    aim(handle.getWorldPosition(new T.Vector3()));
    const handleHovered = handle.material.opacity > .9;
    const kicksBeforeDrag = window.tutorialSounds.filter(sound => sound === 'kick').length;
    window.panelEmit('squeezestart', right);
    const [gripX, gripY, gripZ] = right.gripSpace.position;
    right.gripSpace.position = [gripX + 4, gripY + 4, gripZ + 4];
    frame(2);
    const bounded = panel.position.clone().sub(eye);
    const boundedDrag = -bounded.z >= 1.03 && bounded.x <= -.49 * bounded.z && bounded.y <= -.51 * bounded.z;
    right.gripSpace.position = [gripX + .17, gripY - .14, gripZ];
    frame(5);
    const moved = panel.position.clone();
    const movedDuringDrag = moved.distanceTo(beforeDrag) > .19;
    try {
      performance.now = () => session.time;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', cancelable: true }));
    } finally { performance.now = actual; }
    window.panelEmit('squeezeend', right);
    right.gripSpace.position = [gripX, gripY, gripZ];
    frame(4);
    const retainedPosition = panel.position.distanceTo(moved) < .001;
    const noKickOnDrag = window.tutorialSounds.filter(sound => sound === 'kick').length === kicksBeforeDrag;
    click(445); steps.push(panel.userData.step);
    const retainedNextStep = panel.position.distanceTo(moved) < .001;
    click(445); steps.push(panel.userData.step);
    const practiceClear = !leftModel.visible && !rightModel.visible && panel.scale.x < 1;
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
    right.gamepad.buttons[4].pressed = true;
    frame(14);
    right.gamepad.buttons[4].pressed = false;
    frame();
    const restored = hub.visible && !panel.visible && !session.ended;
    window.panelClick(right, 880, 106);
    window.panelClick(right, 510, 866);
    frame(15);
    const reopenedFromSettings = panel.visible && !hub.visible && panel.userData.step === 'welcome';
    click(750);
    const skipped = hub.visible && !panel.visible && !session.ended;
    return { firstPrompt, ignoresOtherButtons, steps, hatRing, snareRing, tomRing, nextTom, demoPerfect, demoStick, lineUncovered, rightGuide, leftGuide, bothGuides,
      closed, open, reopened, gripMarker, nativeGripPressed, kickRing, beaterMoved, kickCount, pedalKickCount,
      automaticHatClosed, automaticHatOpened, automaticKick, handleHovered, boundedDrag, movedDuringDrag,
      retainedPosition, retainedNextStep, noKickOnDrag, practiceClear, labels: [...labels], notes: [...notes],
      sawMiss, earlyNote, complete, lanesCleared, restored, reopenedFromSettings, skipped, longAudio: window.longAudio };
  });
  assert(result.ignoresOtherButtons);
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
  for (const key of ['firstPrompt', 'hatRing', 'snareRing', 'tomRing', 'nextTom', 'demoPerfect', 'demoStick', 'lineUncovered', 'rightGuide', 'leftGuide',
    'bothGuides', 'gripMarker', 'nativeGripPressed', 'kickRing', 'beaterMoved', 'automaticHatClosed', 'automaticHatOpened', 'automaticKick',
    'handleHovered', 'boundedDrag', 'movedDuringDrag', 'retainedPosition',
    'retainedNextStep', 'noKickOnDrag', 'practiceClear', 'sawMiss', 'complete', 'lanesCleared', 'restored', 'reopenedFromSettings', 'skipped']) {
    assert(result[key], `${key}: ${JSON.stringify(result)}`);
  }
  await page.evaluate(() => window.testXR.end());
  await page.getByRole('button', { name: 'VR ZONE' }).waitFor();
  await page.goto(url);
  await page.getByRole('dialog', { name: 'DRUM UP TUTORIAL' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: A confirmation on desktop and XR, Trigger steps, grip actions, eight practice notes, Settings replay and automatic tutorial on return.');
} finally {
  await browser?.close();
  await server.close();
}
