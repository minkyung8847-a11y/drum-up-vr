import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await page.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url); window.T = T;
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-drum-kit')) window.scene = this;
      return update.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth);
    window.sounds = [];
    drumSynth.trigger = (...args) => { window.sounds.push(args[0]); return trigger(...args); };
  });
  await page.waitForFunction(() => window.scene);
  const model = await page.evaluate(async () => {
    const T = window.T;
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const { createVRDrumLayout, DRUM_POSITION_STORAGE } = await import('/src/components/vrDrumLayout.ts');
    const scene = new T.Scene(), kit = createRestoredVRDrumSet(scene);
    const original = [];
    kit.group.traverse(object => { if (object.isMesh) original.push([object, object.matrixWorld.clone()]); });
    const memory = new Map();
    const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
    const layout = createVRDrumLayout(kit, storage);
    const sameMatrix = (a, b) => a.elements.every((value, index) => Math.abs(value - b.elements[index]) < 1e-8);
    const groupingPreservesEveryMesh = original.every(([object, matrix]) => sameMatrix(object.matrixWorld, matrix));
    const assemblies = [...layout.roots].every(([id, root]) => {
      const supports = kit.layoutSupports.get(id) ?? [];
      const belongs = object => { for (let parent = object; parent; parent = parent.parent) if (parent === root) return true; return false; };
      return supports.every(belongs)
        && (id !== 'hihat' || belongs(kit.group.getObjectByName('hihat-pedal')))
        && (id !== 'kick' || ['kick-pedal', 'kick-beater'].every(name => belongs(kit.group.getObjectByName(name))));
    });
    const defaultPose = JSON.stringify(layout.snapshot());
    let independentMoves = 0;
    for (const [id, root] of layout.roots) {
      const records = [];
      for (const [otherId, other] of layout.roots) other.traverse(object => {
        if (object.isMesh) records.push({ id: otherId, object, world: object.matrixWorld.clone() });
      });
      const delta = new T.Vector3(.11, .08, -.13);
      root.position.add(delta); kit.group.updateWorldMatrix(true, true);
      const worldDelta = delta.clone().multiply(kit.group.scale);
      const valid = records.every(record => {
        const expected = record.world.clone();
        if (record.id === id) { expected.elements[12] += worldDelta.x; expected.elements[13] += worldDelta.y; expected.elements[14] += worldDelta.z; }
        return sameMatrix(record.object.matrixWorld, expected);
      });
      if (valid) independentMoves++;
      layout.reset();
    }
    const root = layout.roots.get('snare'); root.position.x += .15; root.rotation.y += .23;
    const expected = JSON.stringify(layout.snapshot());
    const saved = layout.save(); root.position.x += .3;
    const loaded = layout.load() && JSON.stringify(layout.snapshot()) === expected;
    layout.reset();
    const reset = JSON.stringify(layout.snapshot()) === defaultPose && !memory.has(DRUM_POSITION_STORAGE);
    memory.set(DRUM_POSITION_STORAGE, JSON.stringify({ version: 1, instruments: { snare: { position: [null, 0, 0], quaternion: [0, 0, 0, 1] } } }));
    const invalidIgnored = !layout.load() && JSON.stringify(layout.snapshot()) === defaultPose;
    return { groupingPreservesEveryMesh, assemblies, independentMoves, saved, loaded, reset, invalidIgnored };
  });
  assert.equal(model.independentMoves, 8);
  for (const [name, value] of Object.entries(model)) if (name !== 'independentMoves') assert(value, name);
  console.log('PASS: all 8 rigid assemblies preserve every default mesh matrix; independent supports, save/load/reset and invalid-storage guards.');

  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const edit = await page.evaluate(async () => {
    const T = window.T, session = window.testXR, scene = window.scene;
    const get = name => scene.getObjectByName(name);
    const kit = get('vr-drum-kit'), rig = get('player-rig');
    const roots = new Map(kit.children.filter(object => object.userData.positionEditRoot).map(object => [object.userData.positionEditRoot, object]));
    const left = session.connect('left'), right = session.connect('right'); session.step(3);
    const panel = get('vr-drum-position-settings');
    const nativeNow = performance.now.bind(performance);
    const emit = (type, input) => {
      try { performance.now = () => session.time; session.emit(type, { inputSource: input, frame: session.frame() }); }
      finally { performance.now = nativeNow; }
    };
    const aim = (input, object, x = 0, y = 0) => {
      input.gripSpace.position = rig.worldToLocal(object.localToWorld(new T.Vector3(x, y, .55))).toArray();
      input.gripSpace.quaternion = object.getWorldQuaternion(new T.Quaternion()).toArray();
      session.step(2);
    };
    const click = input => { emit('selectstart', input); emit('selectend', input); emit('select', input); session.step(); };
    const row = (input, index) => { aim(input, panel, 0, .5 - (112.5 + index * 80) / 480); click(input); };
    // Use existing rhythm control; its authored pattern and timeline stay alive.
    const rhythm = get('vr-rhythm-controls');
    aim(right, rhythm, -.124, .005);
    right.gamepad.buttons[4].pressed = true; session.step();
    right.gamepad.buttons[4].pressed = false; session.step();
    click(right); session.step(10);
    const chart = get('note-highway-anchor'), oldLines = get('vr-note-lanes');
    const beforeRoots = new Map([...roots].map(([id, root]) => [id, root.matrixWorld.clone()]));
    const originalEnds = [...roots.keys()].map((id, index) => ({ id,
      point: new T.Vector3().fromBufferAttribute(oldLines.geometry.getAttribute('position'), index * 2) }));
    const notes = chart.children.filter(object => object.name.startsWith('note-'));
    const note = get('note-kick-3000');
    const wasMoving = note.visible;
    let stereo = 0; panel.onBeforeRender = () => stereo++; session.step(); panel.onBeforeRender = () => {};
    const fixedPanelPose = panel.matrixWorld.clone();
    session.head.position[0] += .1; session.step();
    const worldFixed = panel.matrixWorld.equals(fixedPanelPose);
    aim(left, panel);
    // Completed Trigger selection must work even without a forwarded start.
    emit('select', left); session.step();
    const settingsAlreadyPaused = !oldLines.visible && !chart.visible;
    const settingsSoundCount = window.sounds.length, settingsPulseCount = session.pulses.length;
    session.squeeze(right); session.step(3);
    // Attempt a physical snare stroke before entering the inner edit screen.
    const snareRoot = roots.get('snare');
    const snareHead = snareRoot.children.find(object => object.isMesh && object.userData.drumType === 'snare' && object.position.y > 0);
    const snareNormal = new T.Vector3(0, 1, 0).applyNormalMatrix(new T.Matrix3().getNormalMatrix(snareHead.matrixWorld));
    const snareTarget = snareHead.getWorldPosition(new T.Vector3()).addScaledVector(snareNormal, .12);
    const menuStick = rig.children.map(object => object.getObjectByName('right-stick-grip'))
      .find(object => object?.parent.name.startsWith('controller-'));
    const menuOffset = menuStick.parent.parent.worldToLocal(menuStick.getObjectByName('right-stick-tip').getWorldPosition(new T.Vector3()));
    const menuAxis = new T.Vector3(1, 0, 0), menuPitch = -23 * Math.PI / 180;
    menuOffset.applyAxisAngle(menuAxis, menuPitch);
    right.gripSpace.tracked = false; session.step();
    right.gripSpace.position = rig.worldToLocal(snareTarget).sub(menuOffset).toArray();
    right.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(menuAxis, menuPitch).toArray();
    right.gripSpace.tracked = true; session.step(6);
    right.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(menuAxis, menuPitch - .05).toArray(); session.step(2);
    const settingsAlreadySilent = window.sounds.length === settingsSoundCount && session.pulses.length === settingsPulseCount;
    row(left, 0);
    const hidden = !oldLines.visible && !chart.visible;
    const frozenPosition = note.position.clone();
    const soundCount = window.sounds.length, pulseCount = session.pulses.length;
    session.squeeze(right); session.step(90);
    const silentEdit = window.sounds.length === soundCount && session.pulses.length === pulseCount;
    const frozen = note.position.equals(frozenPosition);
    const surfaceOf = id => {
      const root = roots.get(id);
      if (['hihat', 'crash', 'ride'].includes(id)) return root.children.find(object => object.isMesh && object.geometry.type === 'LatheGeometry');
      return root.getObjectByName(`${id}-head-hit-proxy`)
        ?? root.children.find(object => object.isMesh && object.userData.drumType === id && object.position.y > 0);
    };
    const aimAtDrum = (input, id) => {
      const surface = surfaceOf(id);
      surface.updateWorldMatrix(true, false);
      const normal = new T.Vector3(0, 1, 0).applyNormalMatrix(new T.Matrix3().getNormalMatrix(surface.matrixWorld));
      // Aim on the cymbal playing area, outside the real model's spindle hole.
      const target = surface.localToWorld(new T.Vector3(['hihat', 'crash', 'ride'].includes(id) ? .06 : 0, id === 'kick' ? .009 : .02, 0));
      input.gripSpace.position = rig.worldToLocal(target.addScaledVector(normal, .5)).toArray();
      input.gripSpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), normal.negate()).toArray();
      session.step(2);
    };
    const drag = (input, id, delta) => {
      const root = roots.get(id); aimAtDrum(input, id);
      const before = root.getWorldPosition(new T.Vector3());
      emit('selectstart', input); session.step();
      const noJump = root.getWorldPosition(new T.Vector3()).distanceTo(before) < 1e-8;
      input.gripSpace.position = input.gripSpace.position.map((value, index) => value + delta[index]); session.step(3);
      const moved = root.getWorldPosition(new T.Vector3()).distanceTo(before.clone().add(new T.Vector3(...delta))) < 1e-7;
      const outline = get(`drum-position-outline-${id}`).visible;
      emit('selectend', input);
      const released = root.position.clone(); input.gripSpace.position[0] += .1; session.step(2);
      const fixed = root.position.equals(released);
      return noJump && moved && outline && fixed;
    };
    const hihatMoved = drag(left, 'hihat', [.12, .06, -.08]);
    const smallTomMoved = drag(right, 'smallTom', [-.08, .05, -.07]);
    const middleTomMoved = drag(left, 'middleTom', [.08, .02, -.08]);
    row(right, 0); aimAtDrum(right, 'snare');
    const snare = roots.get('snare'), snarePosition = snare.position.clone(), snareScale = snare.scale.clone(), snareRotation = snare.quaternion.clone();
    emit('selectstart', right);
    const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .2);
    right.gripSpace.quaternion = turn.multiply(new T.Quaternion().fromArray(right.gripSpace.quaternion)).toArray();
    session.step(3); emit('selectend', right);
    const rotated = snare.quaternion.angleTo(snareRotation) > .15 && snare.position.equals(snarePosition) && snare.scale.equals(snareScale);
    row(left, 1);
    const { DRUM_POSITION_STORAGE } = await import('/src/components/vrDrumLayout.ts');
    const saved = JSON.parse(localStorage.getItem(DRUM_POSITION_STORAGE));
    const savedAll = Object.keys(saved.instruments).length === 8;
    window.savedDrumPose = saved.instruments;
    row(left, 3);
    const lines = get('vr-note-lanes');
    const preserved = chart === get('note-highway-anchor') && notes.every(mesh => chart.children.includes(mesh));
    const rebuilt = lines !== oldLines && oldLines.parent === null && lines.visible && chart.visible;
    const sameTargets = [...roots.keys()].every(id => {
      const surface = surfaceOf(id); surface.updateWorldMatrix(true, false);
      const normal = new T.Vector3(0, 1, 0).applyNormalMatrix(new T.Matrix3().getNormalMatrix(surface.matrixWorld));
      const rim = get(`rhythm-rim-${id}`);
      return rim.position.distanceTo(surface.localToWorld(new T.Vector3(0, ['hihat', 'crash', 'ride'].includes(id) ? 0 : id === 'kick' ? .009 : .024, 0)).addScaledVector(normal, .006)) < 1e-7
        && new T.Vector3(0, 0, 1).applyQuaternion(rim.quaternion).distanceTo(normal) < 1e-7;
    });
    const endpointsRetargeted = originalEnds.every(({ id, point }, index) => {
      const delta = roots.get(id).matrixWorld.clone().multiply(beforeRoots.get(id).clone().invert());
      const endpoint = new T.Vector3().fromBufferAttribute(lines.geometry.getAttribute('position'), index * 2);
      return endpoint.distanceTo(point.applyMatrix4(delta)) < 1e-6;
    });
    const resumedPosition = note.position.clone(); session.step(5);
    const resumed = !note.position.equals(resumedPosition);
    const kickIndex = [...roots.keys()].indexOf('kick') * 2;
    const kickTarget = new T.Vector3().fromBufferAttribute(lines.geometry.getAttribute('position'), kickIndex);
    const far = new T.Vector3().fromBufferAttribute(lines.geometry.getAttribute('position'), kickIndex + 1);
    const remaining = note.position.distanceTo(kickTarget) / kickTarget.distanceTo(far) * 3000;
    session.time += remaining - 1000 / 90; session.step();
    const noteArrivesAtMovedTarget = note.position.distanceTo(kickTarget) < 1e-5;
    const pulsesBefore = session.pulses.length;
    emit('squeezestart', right); emit('squeezeend', right);
    const kickJudgedAfterEdit = !note.visible && get('rhythm-success-kick').visible
      && session.pulses.length === pulsesBefore + 1 && session.pulses.at(-1).hand === 'right';
    // Existing physical stick collision must follow the moved hi-hat too.
    const surface = surfaceOf('hihat');
    const normal = new T.Vector3(0, 1, 0).applyNormalMatrix(new T.Matrix3().getNormalMatrix(surface.matrixWorld));
    const target = surface.getWorldPosition(new T.Vector3()).addScaledVector(normal, .14);
    const stick = rig.children.map(object => object.getObjectByName('right-stick-grip'))
      .find(object => object?.parent.name.startsWith('controller-'));
    const offset = stick.parent.parent.worldToLocal(stick.getObjectByName('right-stick-tip').getWorldPosition(new T.Vector3()));
    const axis = new T.Vector3(1, 0, 0), pitch = -23 * Math.PI / 180;
    offset.applyAxisAngle(axis, pitch);
    right.gripSpace.tracked = false; session.step();
    right.gripSpace.position = rig.worldToLocal(target).sub(offset).toArray();
    right.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(axis, pitch).toArray();
    right.gripSpace.tracked = true;
    const beforePhysical = window.sounds.length, beforePhysicalPulses = session.pulses.length;
    session.step(6);
    right.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(axis, pitch - .05).toArray(); session.step(2);
    const movedHiHatCanBeStruck = window.sounds.slice(beforePhysical).some(id => id.startsWith('hihat-'))
      && session.pulses.length > beforePhysicalPulses && session.pulses.at(-1).hand === 'right'
      && get('rhythm-ripple-hihat').visible;
    const poseBeforeSwitch = [...roots].map(([id, root]) => [id, root.matrixWorld.toArray()]);
    aim(right, get('ar-mode-window')); click(right); session.step(30);
    const arPreservesLayout = scene.background === null && poseBeforeSwitch.every(([id, matrix]) =>
      roots.get(id).matrixWorld.elements.every((value, index) => Math.abs(value - matrix[index]) < 1e-8))
      && chart === get('note-highway-anchor') && panel.visible;
    aim(right, panel); click(right); row(right, 0);
    const editableInAR = !get('vr-note-lanes').visible && !chart.visible;
    row(right, 3);
    const doneInAR = chart.visible && get('vr-note-lanes').visible;
    return { stereo, worldFixed, wasMoving, settingsAlreadyPaused, settingsAlreadySilent, hidden, silentEdit, frozen, hihatMoved, smallTomMoved,
      middleTomMoved, rotated, savedAll, preserved, rebuilt, sameTargets, resumed, endpointsRetargeted,
      noteArrivesAtMovedTarget, kickJudgedAfterEdit, movedHiHatCanBeStruck, arPreservesLayout, editableInAR, doneInAR };
  });
  assert.equal(edit.stereo, 2);
  for (const [name, value] of Object.entries(edit)) if (name !== 'stereo') assert(value, name);
  console.log('PASS: stereo SETTINGS, world-fixed panel, Trigger drag/release with both hands, rotation, silent editing, paused chart, save, retargeted feedback and resumed timeline.');

  await page.getByRole('button', { name: 'Exit VR', exact: true }).click();
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  const savedAfterReload = await page.evaluate(async () => {
    const { DRUM_POSITION_STORAGE } = await import('/src/components/vrDrumLayout.ts');
    const saved = JSON.parse(localStorage.getItem(DRUM_POSITION_STORAGE));
    // Install scene hook again in this fresh page, then compare actual roots.
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url), update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-drum-kit')) window.scene = this;
      return update.apply(this, args);
    };
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const kit = window.scene.getObjectByName('vr-drum-kit');
    return kit.children.filter(object => object.userData.positionEditRoot).every(root => {
      const pose = saved.instruments[root.userData.positionEditRoot];
      return root.position.distanceTo(new T.Vector3().fromArray(pose.position)) < 1e-8
        && root.quaternion.angleTo(new T.Quaternion().fromArray(pose.quaternion)) < 1e-7;
    });
  });
  assert(savedAfterReload, 'Saved transforms are applied to actual models after page reload');
  const vrOnly = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vrOnly.on('pageerror', error => errors.push(error.message));
  await vrOnly.addInitScript(installMockWebXR, { mode: 'immersive-vr' });
  await vrOnly.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await vrOnly.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await vrOnly.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url); window.T = T;
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-drum-kit')) window.scene = this;
      return update.apply(this, args);
    };
  });
  await vrOnly.waitForFunction(() => window.scene);
  await vrOnly.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await vrOnly.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const nativeVR = await vrOnly.evaluate(async () => {
    const T = window.T, session = window.testXR, scene = window.scene;
    const rig = scene.getObjectByName('player-rig'), panel = scene.getObjectByName('vr-drum-position-settings');
    const root = scene.getObjectByName('vr-drum-kit').children.find(object => object.userData.positionEditRoot === 'hihat');
    const rest = root.position.clone(), input = session.connect('right'); session.step(3);
    const click = y => {
      input.gripSpace.position = rig.worldToLocal(panel.localToWorld(new T.Vector3(0, y, .55))).toArray();
      input.gripSpace.quaternion = panel.quaternion.toArray(); session.step(2);
      for (const type of ['selectstart', 'selectend', 'select']) session.emit(type, { inputSource: input, frame: session.frame() });
      session.step();
    };
    let draws = 0; panel.onBeforeRender = () => draws++; session.step(); panel.onBeforeRender = () => {};
    click(0); click(.5 - 112.5 / 480);
    const editing = !scene.getObjectByName('vr-note-lanes').visible;
    root.position.x += .15; root.updateWorldMatrix(true, true);
    click(.5 - 192.5 / 480);
    const { DRUM_POSITION_STORAGE } = await import('/src/components/vrDrumLayout.ts');
    const saved = !!localStorage.getItem(DRUM_POSITION_STORAGE);
    click(.5 - 272.5 / 480);
    const reset = root.position.equals(rest) && !localStorage.getItem(DRUM_POSITION_STORAGE);
    click(.5 - 352.5 / 480);
    return { nativeSession: session.mode === 'immersive-vr', visible: panel.visible, draws, editing, saved, reset,
      done: scene.getObjectByName('vr-note-lanes').visible };
  });
  assert.deepEqual(nativeVR, { nativeSession: true, visible: true, draws: 2, editing: true, saved: true, reset: true, done: true });
  assert.deepEqual(errors, []);
  console.log('PASS: saved kit reload, actual immersive-vr without AR support, stereo settings, save/reset UI and DONE. Physical Quest 3 controller/compositor behavior NOT tested.');
} finally { await browser?.close(); await vite.close(); }
