import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await page.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    window.THREE = THREE;
    const original = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) window.scene = this;
      return original.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth);
    const playRhythmSuccess = drumSynth.playRhythmSuccess.bind(drumSynth);
    window.hits = [];
    window.successTones = [];
    drumSynth.trigger = (id, velocity) => { window.hits.push(id); return trigger(id, velocity); };
    drumSynth.playRhythmSuccess = perfect => { window.successTones.push(perfect); playRhythmSuccess(perfect); };
  });
  await page.waitForFunction(() => window.scene);
  assert(await page.evaluate(() => !window.scene.getObjectByName('note-highway-anchor')
    && !window.scene.getObjectByName('vr-note-lanes')
    && !window.scene.getObjectByName('vr-rhythm-controls').visible), 'Desktop preview is unaffected');
  await page.getByRole('button', { name: 'Change background' }).click();
  await page.getByRole('menuitemradio', { name: /Concert Arena/ }).click();
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();

  const preview = await page.evaluate(() => {
    const lines = window.scene.getObjectByName('vr-note-lanes');
    let eyeDraws = 0;
    lines.onBeforeRender = () => eyeDraws++;
    window.testXR.step();
    lines.onBeforeRender = () => {};
    return { eyeDraws, visible: lines.visible, hasMovingNotes: window.scene.getObjectByName('note-kick-3000').visible,
      venueVisible: window.scene.getObjectByName('concert-stage-environment').visible };
  });
  assert.deepEqual(preview, { eyeDraws: 2, visible: true, hasMovingNotes: false, venueVisible: true });

  const immersive = await page.evaluate(() => {
    const T = window.THREE;
    const scene = window.scene;
    const session = window.testXR;
    const source = session.connect('right');
    const rig = scene.getObjectByName('player-rig');
    const panel = scene.getObjectByName('vr-rhythm-controls');
    const environment = scene.getObjectByName('concert-stage-environment');
    const get = name => scene.getObjectByName(name);
    const lines = get('vr-note-lanes');
    const lanesStay = () => get('vr-note-lanes') === lines && lines.visible;
    const point = x => {
      const origin = panel.localToWorld(new T.Vector3(x, .005, .5));
      source.gripSpace.position = rig.worldToLocal(origin).toArray();
      source.gripSpace.quaternion = panel.quaternion.toArray();
      session.step(3);
    };
    const select = () => session.emit('select', { inputSource: source, frame: session.frame() });
    const showCursor = () => {
      source.gamepad.buttons[4].pressed = true;
      session.step();
      source.gamepad.buttons[4].pressed = false;
      session.step();
    };
    session.step(3);
    const menuTransform = panel.matrixWorld.clone();
    const head = { ...session.head };
    session.head.position = [.24, 1.38, -.12];
    session.head.quaternion = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 1.25).toArray();
    session.step();
    const fixedRhythmMenu = panel.parent === scene && panel.matrixWorld.equals(menuTransform);
    Object.assign(session.head, head);
    session.step();
    point(-.124);
    showCursor();
    select();
    const active = get('note-highway-anchor').visible && environment.visible && lanesStay();
    const kick = get('note-kick-3000');
    let eyeDraws = 0;
    kick.onBeforeRender = () => eyeDraws++;
    session.time = performance.now() + 850;
    session.step();
    const moved = kick.position.clone();
    const eightLanes = lines.geometry.attributes.position.count === 8 * 2;
    showCursor();
    select();
    session.step();
    const paused = kick.position.clone();
    session.step(30);
    const froze = kick.position.equals(paused) && lanesStay();
    select();
    session.step(25);
    const resumed = !kick.position.equals(paused) && lanesStay();
    point(.124);
    showCursor();
    select();
    session.time = performance.now();
    session.step();
    const restarted = kick.visible && kick.position.distanceTo(moved) > .2 && lanesStay();

    // Swing a tracked stick into the existing assisted snare target on beat 3.
    const kit = get('kick-pedal').parent;
    const snare = kit.children.find(object => object.userData.drumType === 'snare');
    const mesh = snare.children.find(object => object.isMesh && object.userData.drumType === 'snare' && object.position.y > 0);
    const normal = new T.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
    const target = mesh.getWorldPosition(new T.Vector3()).addScaledVector(normal, .12);
    const stick = rig.children.map(object => object.getObjectByName('right-stick-grip'))
      .find(object => object?.parent.name.startsWith('controller-'));
    const grip = stick.parent.parent;
    const offset = grip.worldToLocal(stick.getObjectByName('right-stick-tip').getWorldPosition(new T.Vector3()));
    const pitchAxis = new T.Vector3(1, 0, 0);
    const wristPitch = -23 * Math.PI / 180;
    offset.applyAxisAngle(pitchAxis, wristPitch);
    source.gripSpace.tracked = false;
    source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(pitchAxis, wristPitch).toArray();
    session.time += 4090;
    session.step();
    source.gripSpace.position = rig.worldToLocal(target).sub(offset).toArray();
    source.gripSpace.tracked = true;
    session.step(6);
    source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(pitchAxis, wristPitch - .05).toArray();
    session.step(2);
    return { active, eightLanes, froze, resumed, restarted, fixedRhythmMenu, eyeDraws,
      snareRipple: get('rhythm-ripple-snare').visible, snareRim: get('rhythm-rim-snare').visible,
      snareRemoved: !get('note-snare-4200').visible, hits: window.hits, successTones: window.successTones };
  });
  assert(immersive.eyeDraws >= 2, 'A note is submitted in the stereo render loop');
  for (const check of ['active', 'eightLanes', 'froze', 'resumed', 'restarted', 'fixedRhythmMenu', 'snareRipple', 'snareRim', 'snareRemoved']) {
    assert(immersive[check], check);
  }
  assert.deepEqual(immersive.hits, ['snare']);
  assert.equal(immersive.successTones.length, 1, 'Successful XR hit triggers exactly one chime');
  console.log('PASS: immersive controls, 8 lanes, stereo submission, tracked stick judgment, effects and drum sound path');

  const checks = await page.evaluate(async () => {
    const T = window.THREE;
    const { captureRhythmSurfaces, createVRNoteLanes, createVRNoteHighway, RHYTHM_BPM } = await import('/src/components/vrNoteHighway.ts');
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const scene = new T.Scene();
    const kit = createRestoredVRDrumSet(scene);
    const eye = new T.Vector3(0, 1.35, 1);
    const statuses = [];
    const surfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const guide = createVRNoteLanes(surfaces, eye);
    scene.add(guide.lines);
    const endpoints = [];
    const slopes = [];
    const guideAlignment = surfaces.every((surface, index) => {
      const path = guide.paths.get(surface.id);
      const near = path(0, new T.Vector3());
      const far = path(1, new T.Vector3());
      const mid = path(0.5, new T.Vector3());
      const target = new T.Vector3(0, surface.cymbal ? .008 : surface.height, surface.cymbal ? surface.radius * .35 : 0)
        .applyMatrix4(surface.world);
      const direction = point => point.clone().sub(eye).divideScalar(eye.z - point.z);
      const offset = direction(near).sub(direction(far));
      slopes.push(offset.x / offset.y);
      endpoints.push(far);
      const line = new T.Line3(near, far);
      const positions = guide.lines.geometry.attributes.position;
      for (let vertex = index * 2; vertex < (index + 1) * 2; vertex++) {
        const point = new T.Vector3().fromBufferAttribute(positions, vertex);
        if (line.closestPointToPoint(point, true, new T.Vector3()).distanceTo(point) > 1e-6) return false;
      }
      const projectedMid = direction(near).lerp(direction(far), .5);
      return Math.abs(near.distanceTo(target) - .012) < 1e-8 && direction(mid).distanceTo(projectedMid) < 1e-8;
    });
    const converges = endpoints.length === 8 && endpoints[0].x === eye.x && endpoints[0].y > eye.y
      && endpoints.every(point => point.distanceTo(endpoints[0]) < 1e-8);
    slopes.sort((a, b) => a - b);
    const separate = slopes.slice(1).every((slope, i) => slope - slopes[i] > .06);
    const vrColor = guide.lines.material.color.clone();
    const strongVRLines = guide.lines.material.opacity >= 0.8;
    guide.setPassthrough(true);
    const arContrast = strongVRLines && guide.lines.material.opacity >= 0.9
      && guide.lines.material.color.r < vrColor.r;
    const road = createVRNoteHighway(scene, surfaces, guide.paths,
      (state, judgment) => statuses.push(judgment ?? state));
    const get = name => scene.getObjectByName(name);
    const kick = get('note-kick-3000');
    const crash = get('note-crash-3000');
    const judge = (id, time) => road.strike(id, time);
    const ordinaryHits = surfaces.every(({ id }) => judge(id, 900) === undefined
      && get(`rhythm-ripple-${id}`).visible && get(`rhythm-rim-${id}`).visible
      && !get(`rhythm-success-${id}`).visible);
    road.update(1500, eye);
    const ordinaryHitsFade = surfaces.every(({ id }) => !get(`rhythm-rim-${id}`).visible);
    const windows = [-121, -120, -51, -50, 50, 51, 120, 121].map(offset => {
      road.restart(1000);
      return judge('kick', 4000 + offset);
    });
    road.restart(1000);
    road.update(1000, eye);
    const spawn = kick.visible && kick.position.distanceTo(endpoints[0]) < 1e-8 && kick.material.opacity === 1;
    const farColor = kick.material.color.clone();
    road.update(1800, eye);
    const before = kick.position.clone(), beforeSize = kick.scale.x;
    const alongLine = before.distanceTo(guide.paths.get('kick')(2200 / 3000, new T.Vector3())) < 1e-8;
    const midOpacity = kick.material.opacity;
    road.update(2200, eye);
    const moved = !kick.position.equals(before);
    road.update(1800, eye);
    const independent = kick.position.equals(before);
    road.update(4000, eye);
    const surface = kit.hitSurfaces.find(surface => surface.id === 'kick');
    const local = surface.mesh.worldToLocal(kick.position.clone());
    const aligned = Math.abs(local.x) < 1e-8 && Math.abs(local.z) < 1e-8 && Math.abs(local.y - surface.height) < .02;
    const growsWithoutFade = kick.scale.x > beforeSize && midOpacity === 1 && kick.material.opacity === 1
      && kick.material.color.equals(farColor);
    const chord = [judge('kick', 4000), judge('kick', 4001), judge('crash', 4001)];
    road.update(4010, eye);
    const wave = get('rhythm-ripple-crash'), rim = get('rhythm-rim-crash');
    const success = get('rhythm-success-crash');
    const effects = !kick.visible && !crash.visible && wave.visible && rim.visible
      && success.visible && wave.material.color.equals(rim.material.color) && wave.quaternion.equals(rim.quaternion);
    const startRadius = wave.scale.x;
    road.update(4250, eye);
    const perfectRadius = wave.scale.x, perfectGlow = rim.material.opacity;
    const expands = wave.visible && perfectRadius > startRadius && rim.visible && perfectGlow < 1;
    road.update(4422, eye);
    const effectsFade = !wave.visible && !rim.visible && !success.visible;
    road.restart(1000);
    judge('crash', 4070);
    road.update(4319, eye);
    const softerGreat = wave.visible && success.visible && wave.scale.x < perfectRadius && rim.material.opacity < perfectGlow;
    road.restart(1000);
    judge('crash', 4121);
    const missHasOnlyBase = wave.visible && rim.visible && !success.visible;
    road.restart(1000);
    road.update(4120, eye);
    const atBoundary = kick.visible;
    road.update(4121, eye);
    const expired = !kick.visible && statuses.at(-1) === 'Miss';
    road.update(22000, eye);
    const finished = statuses.at(-1) === 'finished' && !kick.visible && guide.lines.visible;
    road.dispose();
    guide.dispose();
    return { guideAlignment, converges, separate, arContrast, ordinaryHits, ordinaryHitsFade, spawn, alongLine, bpm: RHYTHM_BPM, windows, chord,
      moved, independent, aligned, growsWithoutFade, effects, expands, effectsFade, softerGreat, missHasOnlyBase, atBoundary, expired,
      finished, disposed: !get('note-highway-anchor') };
  });
  assert.equal(checks.bpm, 100);
  assert.deepEqual(checks.windows, ['Miss', 'Great', 'Great', 'Perfect', 'Perfect', 'Great', 'Great', 'Miss']);
  assert.deepEqual(checks.chord, ['Perfect', 'Miss', 'Perfect']);
  for (const check of ['guideAlignment', 'converges', 'separate', 'arContrast', 'ordinaryHits', 'ordinaryHitsFade',
    'spawn', 'alongLine', 'moved', 'independent', 'aligned', 'growsWithoutFade', 'effects', 'expands', 'effectsFade',
    'softerGreat', 'missHasOnlyBase', 'atBoundary', 'expired', 'finished', 'disposed']) {
    assert(checks[check], check);
  }
  await page.getByRole('button', { name: 'Exit VR', exact: true }).click();
  await page.getByRole('button', { name: 'Enter VR', exact: true }).waitFor();
  const exit = await page.evaluate(() => ({
    highway: !!window.scene.getObjectByName('note-highway-anchor'),
    preview: !!window.scene.getObjectByName('vr-note-lanes'),
    concert: window.scene.getObjectByName('concert-stage-environment').visible,
    controls: window.scene.getObjectByName('vr-rhythm-controls').visible,
  }));
  assert.deepEqual(exit, { highway: false, preview: false, concert: true, controls: false }, 'XR exit restores free play');
  assert.deepEqual(errors, []);
  console.log('PASS: persistent straight lanes, full-opacity note spawn, fixed rhythm menu, timing windows, base and success ripples, misses and cleanup');
} finally {
  await browser?.close();
  await vite.close();
}
