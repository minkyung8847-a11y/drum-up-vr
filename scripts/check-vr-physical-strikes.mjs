import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';

// Compile only the modules under test in memory; no browser, XR device, audio
// device or emitted test files required. Production synth is replaced by a spy.
const synth = { calls: [], trigger(id, velocity) { this.calls.push({ id, velocity }); } };
globalThis.__strikeTestSynth = synth;
const spyURL = `data:text/javascript,${encodeURIComponent('export const drumSynth = globalThis.__strikeTestSynth;')}`;
async function load(name, replacements = {}) {
  let source = await readFile(new URL(`../src/components/${name}.ts`, import.meta.url), 'utf8');
  source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
  source = source.replace(/from (['"])([^'"]+)\1/g, (all, quote, specifier) => {
    const resolved = replacements[specifier] ?? (specifier === 'three' ? import.meta.resolve('three') : new URL(`../src/components/${specifier}.ts`, import.meta.url).href);
    return `from ${quote}${resolved}${quote}`;
  });
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}
const { createVRStickCollision, STRIKE_LIMITS } = await load('vrStickCollision');
const { createVRSeating, VR_SEATING } = await load('vrSeating');
const { createXRDrumstickControllers } = await load('xrDrumstickControllers');
const { createVRDrumInteraction, VR_SOUND_IDS } = await load('vrDrumInteraction', { '../utils/synth': spyURL });

const mesh = new THREE.Mesh(new THREE.RingGeometry(0, 0.25), new THREE.MeshStandardMaterial());
const surface = { id: 'snare', mesh, radius: 0.25, cymbal: false, height: 0 };
const hits = [];
const detector = createVRStickCollision([surface], (...args) => hits.push(args));
let time = 0;
function sweep(from, to, hand = 'left', delta = 1 / 90, valid = true) {
  time += delta;
  detector.update(hand, { valid, previous: new THREE.Vector3(...from), current: new THREE.Vector3(...to) }, delta, time);
}
function strike(hand = 'left') { sweep([0, 0.08, 0], [0, -0.04, 0], hand); }
// Zone coordinates are X/Z with the playing normal +Y, independent of mesh shape.
sweep([0, 0.08, 0], [0, 0.08, 0]);
assert.equal(hits.length, 0, 'Hover is silent');
sweep([0, 0.004, 0], [0, 0.003, 0]);
assert.equal(hits.length, 0, 'Slow penetration is silent');
strike();
assert.equal(hits.length, 1, 'Fast tip sweep cannot tunnel through the head');
for (let i = 0; i < 12; i++) sweep([0, -0.04, 0], [0, -0.041, 0]);
assert.equal(hits.length, 1, 'Remaining inside is silent');
sweep([0, -0.04, 0], [0, 0.08, 0]);
assert.equal(hits.length, 1, 'Upward recovery is silent');
strike();
assert.equal(hits.length, 2, 'Lifting clear permits another stroke');
detector.reset();
hits.length = 0;
for (let i = 0; i < 15; i++) {
  sweep([0, -0.03, 0], [0, 0.07, 0], 'left', 1 / 90);
  sweep([0, -0.03, 0], [0, 0.07, 0], 'right', 1 / 90);
  strike('left'); strike('right');
}
assert.equal(hits.length, 30, 'Rapid rolls and independent hands');
const count = hits.length;
sweep([0.5, 0.08, 0], [0.5, -0.04, 0]);
sweep([0, 0.08, 0], [0, -0.04, 0], 'left', 0.2);
sweep([0, 1, 0], [0, -1, 0]);
sweep([0, 0.08, 0], [0, -0.04, 0], 'left', 1 / 90, false);
assert.equal(hits.length, count, 'Misses, long frame gaps, pose jumps and lost tracking are silent');
// Reacquisition inside a drum must not turn into a hit.
sweep([0, -0.04, 0], [0, -0.04, 0]);
sweep([0, -0.04, 0], [0, -0.06, 0]);
assert.equal(hits.length, count);

// Actual world-space transforms, including a vertical kick head and scaled tom.
for (const [id, rotation, scale] of [['kick', Math.PI / 2, 1], ['floorTom', -0.25, 0.8]]) {
  const m = mesh.clone();
  m.position.set(0.7, 0.65, -0.2); m.rotation.x = rotation; m.scale.setScalar(scale);
  m.updateWorldMatrix(true, false);
  let registered = 0;
  const d = createVRStickCollision([{ ...surface, id, mesh: m }], () => registered++);
  d.update('left', { valid: true,
    previous: new THREE.Vector3(0.05, 0.08, 0).applyMatrix4(m.matrixWorld),
    current: new THREE.Vector3(0.05, -0.04, 0).applyMatrix4(m.matrixWorld) }, 1 / 90, 1);
  assert.equal(registered, 1, `Transformed ${id} playing surface`);
}
const cymbal = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.01, 0.05), new THREE.Vector2(0.3, 0)]), new THREE.MeshStandardMaterial());
cymbal.userData.drumType = 'crash';
const cymbalSurface = { id: 'crash', mesh: cymbal, radius: 0.3, cymbal: true, height: 0 };
let cymbalHits = 0;
const cymbalDetector = createVRStickCollision([cymbalSurface], () => cymbalHits++);
cymbalDetector.update('left', { valid: true, previous: new THREE.Vector3(0.04, 0.1, 0), current: new THREE.Vector3(0.04, 0.03, 0) }, 1 / 90, 1);
assert.equal(cymbalHits, 1, 'Raised cymbal bell is hittable before the base plane');
let nearest = '';
const below = mesh.clone(); below.position.y = -0.03;
createVRStickCollision([surface, { ...surface, id: 'floorTom', mesh: below }], id => { nearest += id; }).update('left',
  { valid: true, previous: new THREE.Vector3(0, 0.07, 0), current: new THREE.Vector3(0, -0.06, 0) }, 1 / 90, 1);
assert.equal(nearest, 'floorTom', 'Overlapping contacts choose the visible surface nearest the current tip');

// Forgiving zones are invisible and shared by both controllers: above-surface,
// near-edge strokes, light taps, recovery, overlap resolution and fast sweeps.
for (const hand of ['left', 'right']) for (const id of ['snare', 'smallTom', 'middleTom', 'floorTom', 'hihat', 'ride', 'crash']) {
  const isCymbal = ['hihat', 'ride', 'crash'].includes(id);
  const target = new THREE.Mesh(new THREE.RingGeometry(0, 0.25), new THREE.MeshStandardMaterial());
  target.position.set(0.3, 0.7, 0.2); target.rotation.x = 0.18;
  target.scale.setScalar(id === 'floorTom' ? 0.8 : 1);
  target.updateWorldMatrix(true, false);
  const transform = target.matrixWorld.clone(), material = target.material;
  const scale = target.scale.y;
  const x = 0.28; // Outside the visible 25 cm radius, inside its forgiving margin.
  const lift = isCymbal ? STRIKE_LIMITS.cymbalLift : STRIKE_LIMITS.headLift;
  const contact = (lift + STRIKE_LIMITS.tipRadius) / scale;
  let clock = 0, registered = 0;
  const d = createVRStickCollision([{ id, mesh: target, radius: 0.25, cymbal: isCymbal, height: 0 }], () => registered++);
  const step = (from, to, dt = 1 / 90) => {
    clock += dt;
    d.update(hand, { valid: true,
      previous: new THREE.Vector3(x, from, 0).applyMatrix4(transform),
      current: new THREE.Vector3(x, to, 0).applyMatrix4(transform) }, dt, clock);
  };
  // Start armed, then tap at 0.135 m/s: lighter than the old 0.25 m/s gate.
  step(contact + 0.02 / scale, contact + 0.02 / scale);
  let y = contact + 0.02 / scale;
  for (let i = 0; i < 16; i++) { step(y, y - 0.0015 / scale); y -= 0.0015 / scale; }
  assert.equal(registered, 1, `${hand} ${id}: light tap outside visible rim, before entering model`);
  assert(y > 0, 'Strike triggers above the visible surface');
  for (let i = 0; i < 30; i++) step(y, y);
  // Small jitter in the zone cannot re-arm a stroke.
  for (let i = 0; i < 6; i++) { step(y, contact + 0.002 / scale); step(contact + 0.002 / scale, y); }
  assert.equal(registered, 1, `${hand} ${id}: resting contact/jitter stays silent`);
  step(y, contact + 0.02 / scale);
  assert.equal(registered, 1, 'Recovery does not strike');
  step(contact + 0.02 / scale, contact - 0.01 / scale);
  assert.equal(registered, 2, `${hand} ${id}: lift and restrike`);
  assert(target.matrixWorld.equals(transform) && target.material === material, 'Collider tuning never modifies visible models');
}

// Both raised zones cross in this sweep. The nearer actual instrument must win
// even if its forgiving plane is crossed later or its entry is last in the list.
for (const reverse of [false, true]) for (const hand of ['left', 'right']) {
  const far = mesh.clone(), near = mesh.clone();
  far.position.x = -0.25; near.position.x = 0.25;
  const entries = [{ ...surface, id: 'snare', mesh: far }, { ...surface, id: 'middleTom', mesh: near }];
  if (reverse) entries.reverse();
  const selected = [];
  const d = createVRStickCollision(entries, (id, hitHand) => selected.push([id, hitHand]));
  d.update(hand, { valid: true, previous: new THREE.Vector3(0.04, 0.08, 0), current: new THREE.Vector3(0.04, 0.02, 0) }, 1 / 90, 1);
  assert.deepEqual(selected, [['middleTom', hand]], 'Overlap priority independent of hand and zone enumeration');
}
let fastHits = 0;
createVRStickCollision([surface], () => fastHits++).update('right',
  { valid: true, previous: new THREE.Vector3(0, 0.14, 0), current: new THREE.Vector3(0, -0.08, 0) }, 1 / 90, 1);
assert.equal(fastHits, 1, 'Fast 19.8 m/s sweep still crosses the zone');
let noiseHits = 0;
const noiseDetector = createVRStickCollision([surface], () => noiseHits++);
noiseDetector.update('left', { valid: true, previous: new THREE.Vector3(0, 0.06, 0), current: new THREE.Vector3(0, 0.06, 0) }, 1 / 90, 1);
let noiseY = 0.06;
for (let i = 0; i < 65; i++) {
  noiseDetector.update('left', { valid: true, previous: new THREE.Vector3(0, noiseY, 0), current: new THREE.Vector3(0, noiseY - 0.0005, 0) }, 1 / 90, 1 + (i + 1) / 90);
  noiseY -= 0.0005;
}
assert.equal(noiseHits, 0, 'Subthreshold drift across the raised plane remains silent');

// Hand identity comes from XRInputSource, not controller array index.
const rig = new THREE.Group(), grips = [new THREE.Group(), new THREE.Group()];
const controller = createXRDrumstickControllers({ getControllerGrip: i => grips[i], getReferenceSpace: () => ({}) }, rig);
const pulses = [];
const input = hand => ({ handedness: hand, targetRayMode: 'tracked-pointer', gripSpace: {}, gamepad: {
  hapticActuators: [{ pulse: (strength, duration) => { pulses.push({ hand, strength, duration }); return Promise.resolve(true); } }],
} });
controller.setActive(true);
grips[0].dispatchEvent({ type: 'connected', data: input('right') });
grips[1].dispatchEvent({ type: 'connected', data: input('left') });
grips[1].position.set(-0.3, 1.2, -0.5); grips[1].rotation.set(0.2, -0.3, 0.1);
controller.update();
assert(controller.tipSamples.left.current.distanceTo(new THREE.Vector3(0, 0, -0.31).applyMatrix4(grips[1].matrixWorld)) < 1e-9);
controller.pulse('left', 0.7); controller.pulse('right', 0.8);
assert.deepEqual(pulses.map(p => p.hand), ['left', 'right']);
assert(pulses.every(p => p.duration === 18 && p.strength <= 0.3));
controller.setOffset('left', { position: [0.01, 0, 0], rotation: [0, 15, 0] });
assert.equal(controller.tipSamples.left.valid, false, 'Calibration invalidates strike history');
grips[1].visible = false; controller.update();
assert.equal(controller.tipSamples.left.valid, false);
grips[1].visible = true; controller.update();
assert(controller.tipSamples.left.previous.equals(controller.tipSamples.left.current), 'Tracking recovery resets sweep');
controller.update({ session: { visibilityState: 'visible' }, getPose: () => ({ emulatedPosition: true }) });
assert.equal(controller.tipSamples.left.valid, false, 'Emulated position is not a physical strike');
controller.update({ session: { visibilityState: 'visible-blurred' }, getPose: () => ({ emulatedPosition: false }) });
assert.equal(controller.tipSamples.left.valid, false, 'Obscured sessions cannot strike');
controller.update({ session: { visibilityState: 'visible' }, getPose: () => null });
assert.equal(controller.tipSamples.left.valid, false, 'Missing grip pose cannot strike');
controller.update({ session: { visibilityState: 'visible' }, getPose: () => ({ emulatedPosition: false }) });
assert(controller.tipSamples.left.valid && controller.tipSamples.left.previous.equals(controller.tipSamples.left.current));
let dualRumble = 0;
grips[1].dispatchEvent({ type: 'connected', data: { ...input('left'), gamepad: { vibrationActuator: {
  playEffect(type, effect) { assert.equal(type, 'dual-rumble'); assert.equal(effect.duration, 18); dualRumble++; return Promise.resolve('complete'); },
} } } });
controller.pulse('left', 0.5);
assert.equal(dualRumble, 1, 'Dual-rumble fallback');
grips[1].dispatchEvent({ type: 'connected', data: { ...input('left'), gamepad: {} } });
assert.doesNotThrow(() => controller.pulse('left', 0.5));
grips[1].dispatchEvent({ type: 'connected', data: { ...input('left'), gamepad: { hapticActuators: [{ pulse() { throw Error('Unsupported'); } }] } } });
assert.doesNotThrow(() => controller.pulse('left', 0.5));
grips[1].dispatchEvent({ type: 'connected', data: { ...input('left'), gamepad: { hapticActuators: [{ pulse() { return Promise.reject(Error('Disconnected')); } }] } } });
controller.pulse('left', 0.5);
controller.setActive(false); controller.update();
assert(!controller.tipSamples.left.valid && !controller.tipSamples.right.valid);
controller.dispose(); assert.equal(rig.children.length, 0);

// Feedback affects head/cymbal meshes, leaving every parent/body transform alone.
const drum = new THREE.Group(); drum.add(mesh);
const cymbalGroup = new THREE.Group(); cymbalGroup.add(cymbal);
const originalMaterial = mesh.material, originalCymbalMaterial = cymbal.material;
const before = drum.position.clone(), headBefore = mesh.position.clone();
const originalRotation = cymbal.rotation.clone();
const feedback = createVRDrumInteraction({ hitSurfaces: [surface, cymbalSurface] });
feedback.hit('snare', 0.8); feedback.hit('crash', 0.9); feedback.update(0.015);
assert(drum.position.equals(before) && !mesh.position.equals(headBefore));
assert(!cymbal.rotation.equals(originalRotation));
assert(cymbal.material.emissive.b >= cymbal.material.emissive.r && cymbal.material.emissive.b > 0);
feedback.update(1);
assert(mesh.position.equals(headBefore) && cymbal.rotation.equals(originalRotation));
feedback.dispose();
assert.equal(mesh.material, originalMaterial); assert.equal(cymbal.material, originalCymbalMaterial);
assert.deepEqual(VR_SOUND_IDS, { kick: 'kick', snare: 'snare', hihat: 'hihat-closed', smallTom: 'tom-high', middleTom: 'tom-mid', floorTom: 'tom-floor', crash: 'crash', ride: 'ride' });
assert.deepEqual(synth.calls.map(call => call.id), ['snare', 'crash']);

// Seating translates only roots, recalculates hit zones, and anchors once to the
// initial tracked head position. It must never cancel subsequent head movement.
const seatRig = new THREE.Group(); seatRig.position.set(0, 1.55, 1.6);
const camera = new THREE.PerspectiveCamera(); seatRig.add(camera);
camera.rotation.set(0.1, -0.2, 0.03);
const cameraOrientation = camera.quaternion.clone();
const seatKit = new THREE.Group(), seatHead = mesh.clone();
seatHead.position.set(0, 0.7, 0.64); seatKit.add(seatHead);
const localHead = seatHead.matrix.clone();
seatHead.updateMatrix(); localHead.copy(seatHead.matrix);
const seatHits = [];
const seatCollision = createVRStickCollision([{ ...surface, mesh: seatHead }], id => seatHits.push(id));
const seat = createVRSeating(seatRig, seatKit, () => seatCollision.refreshSurfaces());
seat.enter(); seat.enter();
assert.deepEqual(seatKit.position.toArray(), [0, 0, 0.35], 'No cumulative translation');
assert.deepEqual(seatRig.position.toArray(), [0, 0.08, 1.25]);
seat.update({ getViewerPose: () => null }, {});
seat.update({ getViewerPose: () => ({ transform: { position: { x: 0.3, y: 1.48, z: -0.4 } } }) }, {});
assert.deepEqual(seatRig.position.toArray(), [-0.3, 0.08, 1.65]);
const anchoredRig = seatRig.position.clone();
seat.update({ getViewerPose: () => ({ transform: { position: { x: 0.8, y: 1.7, z: 0.1 } } }) }, {});
assert(seatRig.position.equals(anchoredRig), 'Do not follow/recenter subsequent headset movement');
assert(camera.quaternion.equals(cameraOrientation), 'No imposed camera rotation');
assert.equal(1.48 + seatRig.position.y, 1.56, 'Only a small lift, not doubled floor height');
seatHead.updateMatrix();
assert(seatHead.matrix.equals(localHead), 'Instrument local arrangement and scale remain unchanged');
assert.equal(seatHead.material, originalMaterial);
const movedZ = 0.64 + VR_SEATING.kitForward;
seatCollision.update('left', { valid: true,
  previous: new THREE.Vector3(0, 0.78, movedZ), current: new THREE.Vector3(0, 0.66, movedZ) }, 1 / 90, 1);
assert.deepEqual(seatHits, ['snare'], 'Moved head and collision zone coincide');
assert(Math.abs((1.6 - 0.64) - (VR_SEATING.playerZ - movedZ) - 0.7) < 1e-9, '70 cm closer without scaling');
seat.exit();
assert.deepEqual(seatRig.position.toArray(), [0, 1.55, 1.6]);
assert.deepEqual(seatKit.position.toArray(), [0, 0, 0]);
seatCollision.update('right', { valid: true,
  previous: new THREE.Vector3(0, 0.78, 0.64), current: new THREE.Vector3(0, 0.66, 0.64) }, 1 / 90, 2);
assert.equal(seatHits.length, 2, 'Desktop hit zone restored');
seat.enter();
assert.deepEqual(seatKit.position.toArray(), [0, 0, 0.35], 'Re-entry keeps the same placement');
seat.exit();
await new Promise(resolve => setImmediate(resolve));
delete globalThis.__strikeTestSynth;
console.log('PASS: physical strikes, rolls, both hands, tracking guards, haptics, audio mapping and feedback; seated proximity/elevation, initial head anchoring, unrestricted subsequent tracking, unchanged component transforms, moved/restored collision zones and session re-entry. Hardware NOT tested.');
