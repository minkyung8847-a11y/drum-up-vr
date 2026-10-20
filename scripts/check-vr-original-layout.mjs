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
    const { applyOriginalDrumTransforms, applyCurrentDrumLayout, RESTORED_VR_SCALE: factor } = await import('/src/components/restoredVRDrumSet.ts');
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
    const geometryAndMaterialsPreserved = () => before.every(({ object, geometry, hash, material, textures }) =>
      object.geometry === geometry && fingerprints(geometry) === hash && object.material === material
      && textures.every(texture => Object.values(object.material).includes(texture)));
    const partFor = (group, id) => group.children.find(child => child.userData.drumType === id);
    const measurements = [];
    // Independent expected deltas: metres and degrees, relative to initial Git.
    const adjustments = {
      smallTom: [-0.03, 0.16, 0, 15], middleTom: [0.03, 0.16, 0, 15],
      snare: [0, 0, 0.11, 0], floorTom: [-0.02, 0, 0.14, 0],
      hihat: [-0.12, 0, 0, 4], crash: [0, 0, 0, 4], ride: [0.03, 0, 0, 4], kick: [0, 0, 0, 0],
    };
    const targetHeights = { snare: 0.75, floorTom: 0.75, hihat: 0.8805578947368421, crash: 1.10, ride: 1.02 };
    for (const [id, recorded] of Object.entries(history.instruments)) {
      const old = partFor(original.group, id), now = partFor(fixture.group, id), live = partFor(actual, id);
      const shell = old.children.find(child => child.geometry?.parameters.openEnded);
      const body = shell ?? old.children.find(child => child.geometry?.type === 'CylinderGeometry');
      const liveShell = live.children.find(child => child.geometry?.parameters.openEnded);
      const liveBody = liveShell ?? live.children.find(child => child.geometry?.type === 'LatheGeometry');
      const liveRadius = liveShell ? liveShell.geometry.parameters.radiusTop : liveBody.geometry.parameters.points.at(-1).x;
      const worldScale = live.getWorldScale(new THREE.Vector3());
      const [dx, dy, dz, tilt] = adjustments[id];
      const expectedPosition = old.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(dx, dy, dz));
      if (id in targetHeights) expectedPosition.y = targetHeights[id];
      const expectedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(recorded.rotation[0] + tilt * Math.PI / 180, 0, recorded.rotation[2]));
      measurements.push({ id, positionError: now.position.distanceTo(old.position), rotationError: now.quaternion.angleTo(old.quaternion),
        livePositionError: live.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPosition),
        liveRotationError: live.quaternion.angleTo(expectedRotation),
        worldPosition: live.getWorldPosition(new THREE.Vector3()).toArray(), tiltDegrees: live.rotation.x * 180 / Math.PI,
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
    // The historical restoration stays exact; the active factory adds only the
    // requested layout adjustments before collision/feedback caches are built.
    const footPosition = o => new THREE.Vector3().applyMatrix4(o.matrixWorld);
    const standIds = ['snare', 'hihat', 'crash', 'ride'];
    const groundSupports = standIds.flatMap(id => fixture.layoutSupports.get(id).slice(1, 7));
    groundSupports.push(...floorLegs(partFor(fixture.group, 'floorTom')).filter(o => o.geometry.type === 'SphereGeometry'));
    const groundHeights = groundSupports.map(o => footPosition(o).y);
    const poleEnds = standIds.map(id => {
      const o = fixture.layoutSupports.get(id)[0];
      return { id, object: o, base: footPosition(o).y,
        top: new THREE.Vector3(0, 0, o.geometry.parameters.height).applyMatrix4(o.matrixWorld).y,
        lift: targetHeights[id] - partFor(fixture.group, id).getWorldPosition(new THREE.Vector3()).y };
    });
    const scalesBefore = fixture.group.children.filter(o => o.userData.drumType).map(o => o.scale.toArray());
    applyCurrentDrumLayout(fixture);
    const unchangedGeometryAndMaterials = geometryAndMaterialsPreserved();
    const scalesUnchanged = fixture.group.children.filter(o => o.userData.drumType).every((o, i) => o.scale.toArray().every((v, j) => v === scalesBefore[i][j]));
    const groundHeightError = Math.max(...groundSupports.map((o, i) => Math.abs(footPosition(o).y - groundHeights[i])));
    const poleErrors = poleEnds.map(({ object, base, top, lift, id }) => ({ id,
      base: Math.abs(footPosition(object).y - base),
      top: Math.abs(new THREE.Vector3(0, 0, object.geometry.parameters.height).applyMatrix4(object.matrixWorld).y - top - lift) }));
    const bounds = id => new THREE.Box3().setFromObject(partFor(actual, id));
    const kickBox = bounds('kick'), beaterBox = new THREE.Box3().setFromObject(actual.getObjectByName('kick-beater'));
    // A global AABB incorrectly treats the curved bass shell as a solid square.
    // Project every original mesh vertex (including hardware) onto XY axes.
    // A positive separating gap proves the complete convex hulls are disjoint.
    const vertices = (group, excluded = new Set()) => {
      const points = [], point = new THREE.Vector3();
      group.traverse(o => {
        const positions = o.geometry?.attributes.position;
        if (!positions || excluded.has(o)) return;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld); points.push(point.x, point.y, point.z);
        }
      });
      return points;
    };
    const project = (points, x, y, z = 0) => {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < points.length; i += 3) {
        const dot = points[i] * x + points[i + 1] * y + points[i + 2] * z;
        min = Math.min(min, dot); max = Math.max(max, dot);
      }
      return { min, max };
    };
    const bassVertices = vertices(partFor(actual, 'kick'));
    const clearance = ['smallTom', 'middleTom'].map(id => {
      const box = bounds(id);
      const tomVertices = vertices(partFor(actual, id));
      let bassSeparatingGap = -Infinity;
      for (let degrees = 0; degrees <= 90; degrees++) {
        const theta = degrees * Math.PI / 180, x = Math.cos(theta) * (id === 'smallTom' ? -1 : 1), y = Math.sin(theta);
        bassSeparatingGap = Math.max(bassSeparatingGap, project(tomVertices, x, y).min - project(bassVertices, x, y).max);
      }
      return { id, aabbVerticalGap: box.min.y - kickBox.max.y, bassSeparatingGap, aboveBeater: box.min.y - beaterBox.max.y };
    });
    // Floor legs are allowed to span lower than the bass; compare the actual
    // playable body/hardware, excluding only its three legs and rubber feet.
    const floorBody = partFor(actual, 'floorTom').clone();
    floorLegs(floorBody).forEach(o => floorBody.remove(o));
    const floorVertices = vertices(floorBody);
    let floorBassGap = -Infinity;
    for (let azimuth = 0; azimuth <= 90; azimuth += 5) for (let elevation = 0; elevation <= 90; elevation += 5) {
      const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
      const x = Math.cos(a) * Math.cos(e), y = Math.sin(e), z = Math.sin(a) * Math.cos(e);
      floorBassGap = Math.max(floorBassGap, project(floorVertices, x, y, z).min - project(bassVertices, x, y, z).max);
    }
    // All 28 pairs: use complete body, rim and hardware vertices. Exclude only
    // floor legs/feet and separate stand assemblies, which are not drum bodies.
    // Positive projection gaps prove separation of every triangle, rather than
    // inferring non-intersection from a few sampled points or screenshots.
    const bodies = Object.keys(history.instruments).map(id => {
      const group = partFor(actual, id);
      const points = vertices(group, new Set(id === 'floorTom' ? floorLegs(group) : []));
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(axis => project(points, ...axis));
      return { id, points, axes, centre: axes.map(({ min, max }) => (min + max) / 2) };
    });
    const pairClearances = [];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const gap = (ea, eb) => Math.max(ea.min - eb.max, eb.min - ea.max);
      let separation = Math.max(...a.axes.map((ea, axis) => gap(ea, b.axes[axis])));
      const testAxis = axis => { separation = Math.max(separation, gap(project(a.points, ...axis), project(b.points, ...axis))); };
      if (separation < 0.01) {
        const axis = new THREE.Vector3(...b.centre).sub(new THREE.Vector3(...a.centre)).normalize();
        testAxis(axis.toArray());
      }
      if (separation < 0.01) {
        for (let az = 0; az < 180 && separation < 0.01; az += 10) for (let el = -80; el <= 80 && separation < 0.01; el += 10) {
          const a = az * Math.PI / 180, e = el * Math.PI / 180;
          testAxis([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]);
        }
      }
      pairClearances.push({ a: a.id, b: b.id, separation });
    }
    const hihatPedalAligned = Math.abs(actual.getObjectByName('hihat-pedal').getWorldPosition(new THREE.Vector3()).x
      - partFor(actual, 'hihat').getWorldPosition(new THREE.Vector3()).x) < 1e-8;
    const cymbalTomIntersections = [];
    for (const cymbal of ['hihat', 'crash', 'ride']) for (const tom of ['smallTom', 'middleTom']) {
      if (bounds(cymbal).intersectsBox(bounds(tom))) cymbalTomIntersections.push([cymbal, tom]);
    }
    const centrePost = fixture.layoutSupports.get('rackPost');
    const postCentred = centrePost.every(o => Math.abs(o.position.x) < 1e-10);
    const hits = [], failures = [], head = new THREE.Vector3(0, 1.22, 1);
    for (const fps of [60, 72, 90, 120]) for (const hand of ['left', 'right']) for (const height of [0.08, 0.15, 0.2]) for (const surface of fixture.hitSurfaces) {
      const found = [], detector = createVRAssistedStrikes(fixture.hitSurfaces, id => found.push(id));
      // The raised hi-hat sits under the crash. A high approach to its centre
      // would physically cross the crash's area; use its unobstructed front
      // playing edge for those approaches, and also test low centre flicks.
      const front = surface.id === 'hihat' && height > 0.1 ? surface.radius * 0.9 : 0;
      const previous = new THREE.Vector3(0, height, front).applyMatrix4(surface.mesh.matrixWorld);
      const current = new THREE.Vector3(0, height - 0.008, front).applyMatrix4(surface.mesh.matrixWorld);
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
      unchangedGeometryAndMaterials, maximumSupportError, supportCount, scalesUnchanged, groundHeightError, poleErrors,
      floorBassGap, clearance, pairClearances, hihatPedalAligned, cymbalTomIntersections, postCentred, cases: hits.length, failures,
      rig: rig.position.toArray(), rootPosition: actual.position.toArray(), rootScale: actual.scale.toArray(),
      notes, fallingNotes: VR_FREE_DRUMMING.fallingNotes, image };
  }, { legacyJS, blob });
  await writeFile(`${process.env.VR_ARTIFACT_DIR || '.'}/vr-current-layout.png`, Buffer.from(result.image.split(',')[1], 'base64'));
  delete result.image; console.log(JSON.stringify(result, null, 2));
  await writeFile(`${process.env.VR_ARTIFACT_DIR || '.'}/vr-current-layout-validation.json`, JSON.stringify(result, null, 2));
  assert.equal(result.sourceCommit, ref); assert(result.sourceBlobMatchesGit && result.unchangedGeometryAndMaterials);
  for (const measured of result.measurements) {
    assert(measured.snapshotMatchesGit && measured.positionError < 1e-8 && measured.rotationError < 1e-7
      && measured.livePositionError < 1e-8 && measured.liveRotationError < 1e-7, `${measured.id}: original restoration and requested current pose`);
    assert(Math.abs(measured.diameter - measured.expectedDiameter) < 1e-8, `${measured.id}: original relative diameter`);
    if (measured.depth) assert(Math.abs(measured.depth - measured.expectedDepth) < 1e-8, `${measured.id}: original relative depth`);
  }
  assert(Math.abs(result.measurements.find(item => item.id === 'kick').diameter - 0.5588) < 1e-8, 'Current overall bass size preserved');
  assert(result.maximumSupportError < 1e-7); assert.equal(result.supportCount, 48);
  assert(result.scalesUnchanged && result.postCentred);
  assert(result.groundHeightError < 1e-8, 'Raised drums keep all tripod and floor feet grounded');
  assert(result.poleErrors.every(e => e.base < 1e-8 && e.top < 1e-6), 'Stand tops extend with raised instruments while bases stay fixed');
  assert(result.floorBassGap > 0.005, 'Floor tom body and all its hardware have a separating plane from the bass drum');
  assert.equal(result.pairClearances.length, 28);
  assert(result.pairClearances.every(pair => pair.separation > 0.01), `All bodies must have 1cm clearance: ${JSON.stringify(result.pairClearances.filter(pair => pair.separation <= 0.01))}`);
  assert(result.hihatPedalAligned, 'Hi-hat pedal follows its lateral position');
  assert(result.clearance.every(c => c.bassSeparatingGap > 0.002 && c.aboveBeater > 0.002), 'Raised tom geometry clears bass and beater geometry');
  assert.deepEqual(result.cymbalTomIntersections, [], 'Cymbals do not intersect rack tom bounds');
  assert.deepEqual(result.failures, []); assert.deepEqual(result.rig, [0, 1.22, 1]); assert.deepEqual(result.rootPosition, [0, 0, 0]);
  assert(result.rootScale.every(value => Math.abs(value - result.factor) < 1e-10));
  assert.equal(result.fallingNotes, false); assert.deepEqual(result.notes, []); assert.deepEqual(errors, []);
  console.log('PASS: original restoration and current poses, unchanged geometry/materials/sizes, grounded stands, all 28 body pairs separated by >1cm; 192 active both-hand hits, unchanged seat and disabled notes. Headset NOT tested.');
} finally { await browser.close(); }
