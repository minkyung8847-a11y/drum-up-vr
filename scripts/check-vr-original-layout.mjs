import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright';

const ref = '7d3e13817d07686d9c6470b729d5306bf13f4c54';
const path = 'src/components/virtualDrumSet.ts';
const blob = execFileSync('git', ['rev-parse', `${ref}:${path}`], { encoding: 'utf8' }).trim();
const source = execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
const legacyJS = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5176/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  await page.evaluate(async () => {
    const THREE = await import(performance.getEntriesByType('resource').find(e => /\/three\.js\?/.test(e.name)).name);
    const update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) { window.originalTestScene = this; return update.apply(this, args); };
  });
  await page.waitForFunction(() => !!window.originalTestScene);
  const result = await page.evaluate(async ({ legacyJS, blob }) => {
    const url = performance.getEntriesByType('resource').find(e => /\/three\.js\?/.test(e.name)).name;
    const THREE = await import(url);
    const { ORIGINAL_IMPORTED_KIT: history } = await import('/src/components/originalImportedKit.ts');
    const { createVirtualDrumSet } = await import('/src/components/virtualDrumSet.ts');
    const { applyOriginalDrumTransforms, RESTORED_VR_SCALE: factor } = await import('/src/components/restoredVRDrumSet.ts');
    const { VR_DRUM_LAYOUT, VR_FREE_DRUMMING } = await import('/src/components/vrDrumConfig.ts');
    const { createVRAssistedStrikes } = await import('/src/components/vrAssistedStrikes.ts');
    const actualScene = window.originalTestScene;
    const actual = actualScene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
    const legacyURL = URL.createObjectURL(new Blob([legacyJS.replace(/from (['"])three\1/, `from '${url}'`)], { type: 'application/javascript' }));
    const legacyFactory = (await import(legacyURL)).createVirtualDrumSet;
    const legacyScene = new THREE.Scene(), original = legacyFactory(legacyScene);
    original.group.scale.setScalar(factor); legacyScene.updateMatrixWorld(true); URL.revokeObjectURL(legacyURL);
    const fixture = createVirtualDrumSet(new THREE.Scene(), { layout: VR_DRUM_LAYOUT });
    const hash = array => { let sum = 2166136261; for (const byte of new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) sum = Math.imul(sum ^ byte, 16777619); return sum >>> 0; };
    const fingerprints = geometry => JSON.stringify({ attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([key, value]) => [key, hash(value.array)])), index: geometry.index && hash(geometry.index.array) });
    const before = [];
    fixture.group.traverse(object => { if (object.isMesh) before.push({ object, geometry: object.geometry,
      hash: fingerprints(object.geometry), material: object.material,
      textures: Object.values(object.material).filter(value => value?.isTexture) }); });
    applyOriginalDrumTransforms(fixture);
    const unchangedGeometryAndMaterials = before.every(({ object, geometry, hash, material, textures }) =>
      object.geometry === geometry && fingerprints(geometry) === hash && object.material === material
      && textures.every(texture => Object.values(object.material).includes(texture)));
    const partFor = (group, id) => group.children.find(child => child.userData.drumType === id);
    const measurements = [];
    for (const [id, recorded] of Object.entries(history.instruments)) {
      const old = partFor(original.group, id), now = partFor(fixture.group, id), live = partFor(actual, id);
      const shell = old.children.find(child => child.geometry?.parameters.openEnded);
      const body = shell ?? old.children.find(child => child.geometry?.type === 'CylinderGeometry');
      const liveShell = live.children.find(child => child.geometry?.parameters.openEnded);
      const liveBody = liveShell ?? live.children.find(child => child.geometry?.type === 'LatheGeometry');
      const liveRadius = liveShell ? liveShell.geometry.parameters.radiusTop : liveBody.geometry.parameters.points.at(-1).x;
      const worldScale = live.getWorldScale(new THREE.Vector3());
      measurements.push({ id, positionError: now.position.distanceTo(old.position), rotationError: now.quaternion.angleTo(old.quaternion),
        livePositionError: live.getWorldPosition(new THREE.Vector3()).distanceTo(old.getWorldPosition(new THREE.Vector3())),
        liveRotationError: live.quaternion.angleTo(old.quaternion),
        diameter: 2 * liveRadius * worldScale.x, expectedDiameter: 2 * body.geometry.parameters.radiusTop * factor,
        depth: liveShell && liveShell.geometry.parameters.height * worldScale.y,
        expectedDepth: shell && shell.geometry.parameters.height * factor,
        snapshotMatchesGit: old.position.distanceTo(new THREE.Vector3(...recorded.position)) < 1e-10
          && Math.abs(2 * body.geometry.parameters.radiusTop - recorded.diameter) < 1e-10 });
    }
    let pending = [], maximumSupportError = 0, supportCount = 0;
    const expected = new THREE.Matrix4(), ratio = new THREE.Vector3(), oldSize = new THREE.Vector3(), newSize = new THREE.Vector3();
    const checkSupport = (now, old) => {
      now.geometry.computeBoundingBox(); old.geometry.computeBoundingBox();
      now.geometry.boundingBox.getSize(newSize); old.geometry.boundingBox.getSize(oldSize); ratio.copy(oldSize).divide(newSize);
      expected.copy(old.matrixWorld).multiply(new THREE.Matrix4().makeScale(...ratio.toArray()));
      expected.elements.forEach((value, index) => { maximumSupportError = Math.max(maximumSupportError, Math.abs(value - now.matrixWorld.elements[index])); });
      supportCount++;
    };
    for (const object of original.group.children) {
      if (object.isMesh) pending.push(object);
      const id = object.userData.drumType;
      if (id) {
        const current = fixture.layoutSupports.get(id);
        if (current.length !== pending.length) throw Error(`Historical support count differs: ${id}`);
        pending.forEach((old, index) => checkSupport(current[index], old)); pending = [];
      }
    }
    const floorLegs = part => part.children.filter(o => o.isMesh && ((o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 0.007)
      || (o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 0.028)));
    const oldLegs = floorLegs(partFor(original.group, 'floorTom')), newLegs = floorLegs(partFor(fixture.group, 'floorTom'));
    oldLegs.forEach((old, index) => checkSupport(newLegs[index], old));
    const hits = [], failures = [], head = new THREE.Vector3(0, 1.22, 1);
    for (const fps of [60, 72, 90, 120]) for (const hand of ['left', 'right']) for (const height of [0.08, 0.15, 0.2]) for (const surface of fixture.hitSurfaces) {
      const found = [], detector = createVRAssistedStrikes(fixture.hitSurfaces, id => found.push(id));
      const previous = new THREE.Vector3(0, height, 0).applyMatrix4(surface.mesh.matrixWorld);
      const current = new THREE.Vector3(0, height - 0.008, 0).applyMatrix4(surface.mesh.matrixWorld);
      detector.update(hand, { valid: true, previous, current, grip: current.clone().add(new THREE.Vector3(0, 0, 0.31)) }, 1 / fps, 1, head);
      hits.push(found);
      if (found.length !== 1 || found[0] !== surface.id) failures.push({ fps, hand, intended: surface.id, height, found });
    }
    const rig = actualScene.getObjectByName('player-rig');
    const notes = []; actualScene.traverse(o => { if (/^(note-|highway-)/.test(o.name)) notes.push(o.name); });
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1440, 900);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    const camera = new THREE.PerspectiveCamera(85, 1.6, 0.03, 30); camera.position.copy(head);
    camera.rotation.x = -Math.atan2(0.83, 1.45); camera.updateMatrixWorld(true); renderer.render(actualScene, camera);
    const image = renderer.domElement.toDataURL('image/png'); renderer.dispose();
    return { sourceCommit: history.sourceCommit, sourceBlobMatchesGit: history.sourceBlob === blob, factor, measurements,
      unchangedGeometryAndMaterials, maximumSupportError, supportCount, cases: hits.length, failures,
      rig: rig.position.toArray(), rootPosition: actual.position.toArray(), rootScale: actual.scale.toArray(),
      notes, fallingNotes: VR_FREE_DRUMMING.fallingNotes, image };
  }, { legacyJS, blob });
  await writeFile(`${process.env.VR_ARTIFACT_DIR || '.'}/vr-original-layout-restored.png`, Buffer.from(result.image.split(',')[1], 'base64'));
  delete result.image; console.log(JSON.stringify(result, null, 2));
  await writeFile(`${process.env.VR_ARTIFACT_DIR || '.'}/vr-original-layout-validation.json`, JSON.stringify(result, null, 2));
  assert.equal(result.sourceCommit, ref); assert(result.sourceBlobMatchesGit && result.unchangedGeometryAndMaterials);
  for (const measured of result.measurements) {
    assert(measured.snapshotMatchesGit && measured.positionError < 1e-8 && measured.rotationError < 1e-7
      && measured.livePositionError < 1e-8 && measured.liveRotationError < 1e-7, `${measured.id}: exact initial-Git pose`);
    assert(Math.abs(measured.diameter - measured.expectedDiameter) < 1e-8, `${measured.id}: original relative diameter`);
    if (measured.depth) assert(Math.abs(measured.depth - measured.expectedDepth) < 1e-8, `${measured.id}: original relative depth`);
  }
  assert(Math.abs(result.measurements.find(item => item.id === 'kick').diameter - 0.5588) < 1e-8, 'Current overall bass size preserved');
  assert(result.maximumSupportError < 1e-7); assert.equal(result.supportCount, 48);
  assert.deepEqual(result.failures, []); assert.deepEqual(result.rig, [0, 1.22, 1]); assert.deepEqual(result.rootPosition, [0, 0, 0]);
  assert(result.rootScale.every(value => Math.abs(value - result.factor) < 1e-10));
  assert.equal(result.fallingNotes, false); assert.deepEqual(result.notes, []); assert.deepEqual(errors, []);
  console.log('PASS: independently executed initial Git model matches restored poses, relative sizes and supports; current geometry/material identity and bass world size preserved; both-hand hit zones, seat and disabled notes preserved. Headset NOT tested.');
} finally { await browser.close(); }
