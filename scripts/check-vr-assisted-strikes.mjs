import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import ts from 'typescript';
async function load(name) {
  const text = await readFile(new URL(`../src/components/${name}.ts`, import.meta.url), 'utf8');
  let js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
  js = js.replace(/from (['"])three\1/g, `from '${import.meta.resolve('three')}'`);
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}
const { createVRAssistedStrikes, ASSISTED_STRIKE } = await load('vrAssistedStrikes');
const { VR_DRUM_LAYOUT, VR_FREE_DRUMMING } = await load('vrDrumConfig');
const { createVRSeating, VR_SEATING } = await load('vrSeating');
assert.equal(VR_FREE_DRUMMING.fallingNotes, false);
const head = new THREE.Vector3(0, 1.2, 1.0);
function makeSurface(id) {
  const config = VR_DRUM_LAYOUT[id];
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0, config.diameter / 2));
  mesh.position.fromArray(config.position);
  mesh.rotation.x = id === 'kick' ? Math.PI / 2 : id.includes('Tom') ? 0.4 : 0.08;
  mesh.updateMatrixWorld(true);
  return { id, mesh, radius: config.diameter / 2, cymbal: ['hihat', 'ride', 'crash'].includes(id), height: 0 };
}
for (const fps of [60, 72, 90, 120]) for (const hand of ['left', 'right']) for (const id of Object.keys(VR_DRUM_LAYOUT)) {
  const surface = makeSurface(id), hits = [];
  const original = surface.mesh.matrixWorld.clone();
  const engine = createVRAssistedStrikes([surface], (...args) => hits.push(args));
  let time = 0;
  const step = (a, b, valid = true, delta = 1 / fps) => {
    time += delta;
    const previous = new THREE.Vector3(0, a, 0).applyMatrix4(original);
    const current = new THREE.Vector3(0, b, 0).applyMatrix4(original);
    engine.update(hand, { valid, previous, current, grip: current.clone().add(new THREE.Vector3(0, 0, 0.31)) }, delta, time, head);
  };
  step(0.2, 0.2);
  assert.equal(hits.length, 0, 'Stationary does not play');
  // A low-speed flick accumulates only 4 mm, well above the actual model.
  let y = 0.2;
  for (let i = 0; i < Math.ceil(0.005 / (0.08 / fps)); i++) { step(y, y - 0.08 / fps); y -= 0.08 / fps; }
  assert.equal(hits.length, 1, `${fps} Hz ${hand} ${id}: light non-contact wrist flick`);
  assert(y > 0.18, 'Exact surface contact is unnecessary');
  for (let i = 0; i < 16; i++) { step(y, y); }
  step(y, y - 0.03);
  assert.equal(hits.length, 1, 'Holding or continuing the swing cannot retrigger');
  step(y - 0.03, y - 0.02);
  step(y - 0.02, y - 0.026);
  assert.equal(hits.length, 2, 'Lift and flick re-arms');
  assert(surface.mesh.matrixWorld.equals(original), 'Assistance never moves geometry');
}

const snare = makeSurface('snare'), tom = makeSurface('middleTom');
const hits = [];
const engine = createVRAssistedStrikes([tom, snare], (id, hand) => hits.push([id, hand]));
let time = 0;
const sampleAt = (surface, a, b, hand, overrides = {}) => {
  time += 1 / 90;
  const previous = new THREE.Vector3(0, a, 0).applyMatrix4(surface.mesh.matrixWorld);
  const current = new THREE.Vector3(0, b, 0).applyMatrix4(surface.mesh.matrixWorld);
  engine.update(hand, { valid: true, previous, current, grip: current.clone().add(new THREE.Vector3(0, 0, 0.31)), ...overrides }, 1 / 90, time, head);
};
sampleAt(snare, 0.2, 0.194, 'left'); sampleAt(snare, 0.2, 0.194, 'right');
assert.deepEqual(hits, [['snare', 'left'], ['snare', 'right']], 'Independent hands may strike the same instrument');
sampleAt(tom, 0.2, 0.194, 'left');
assert.equal(hits.length, 2, 'One swing cannot hit another instrument');
engine.reset(); hits.length = 0;
sampleAt(snare, 0.2, 0.194, 'left', { grip: new THREE.Vector3(4, 4, 4) });
sampleAt(snare, 0.5, 0.494, 'left');
sampleAt(snare, 0.2, 0.194, 'left', { valid: false });
sampleAt(snare, 0.194, 0.2, 'left');
assert.equal(hits.length, 0, 'Out-of-reach, wrong direction and tracking loss stay silent');
sampleAt(snare, 0.2, 0.0, 'left');
assert.equal(hits.length, 1, 'Swept fast strokes cannot tunnel through');

// Overlapping assistance zones resolve to the nearest intended instrument,
// regardless of source order. There is never a multi-instrument chord per hand.
for (const reverse of [false, true]) {
  const a = makeSurface('snare'), b = makeSurface('floorTom');
  a.mesh.position.set(-0.1, 0.7, 0.5); b.mesh.position.set(0.1, 0.7, 0.5);
  a.mesh.rotation.set(0, 0, 0); b.mesh.rotation.set(0, 0, 0);
  const selected = [];
  const collision = createVRAssistedStrikes(reverse ? [b, a] : [a, b], id => selected.push(id));
  collision.update('left', { valid: true, previous: new THREE.Vector3(0.15, 0.9, 0.5), current: new THREE.Vector3(0.15, 0.894, 0.5), grip: new THREE.Vector3(0.15, 0.9, 0.8) }, 1 / 90, 1, head);
  assert.deepEqual(selected, ['floorTom']);
}
const rig = new THREE.Group(), kit = new THREE.Group(); rig.position.set(0, 1.22, 1);
let refreshed = 0;
const seating = createVRSeating(rig, kit, () => refreshed++);
seating.enter(); seating.enter();
seating.update({ getViewerPose: () => ({ transform: { position: { x: 0.3, y: 1.15, z: -0.4 } } }) }, {});
assert.deepEqual(rig.position.toArray(), [-0.3, 0, 1.4]);
const fixed = rig.position.clone();
seating.update({ getViewerPose: () => ({ transform: { position: { x: 0.6, y: 1.4, z: 0.2 } } }) }, {});
assert(rig.position.equals(fixed), 'No ongoing camera correction');
assert.equal(VR_SEATING.eyeLift, 0); assert.equal(VR_SEATING.kitForward, 0);
assert(kit.position.equals(new THREE.Vector3()));
seating.exit(); assert.deepEqual(rig.position.toArray(), [0, 1.22, 1]); assert.equal(refreshed, 2);
assert.equal(ASSISTED_STRIKE.strokeDistance, 0.004);
console.log('PASS: all 8 assisted instruments, both hands, 60/72/90/120 Hz wrist flicks above models, stationary/continued swing rejection, recovery, nearest target, reach limits, fast sweeps, tracking loss, floor-relative seating and notes-disabled configuration. Hardware NOT tested.');
