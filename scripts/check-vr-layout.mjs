import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Integration fixture uses ALL production instruments simultaneously. Never
// changes the application's camera or kit; diagnostic cameras are separate.
const artifactDir = process.env.VR_ARTIFACT_DIR || '.';
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5176/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      window.layoutScene = this;
      return update.apply(this, args);
    };
  });
  await page.waitForFunction(() => !!window.layoutScene);
  const result = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const { OBB } = await import('/node_modules/three/examples/jsm/math/OBB.js');
    const { createVirtualDrumSet } = await import('/src/components/virtualDrumSet.ts');
    const { VR_DRUM_LAYOUT, VR_FREE_DRUMMING } = await import('/src/components/vrDrumConfig.ts');
    const { createVRAssistedStrikes } = await import('/src/components/vrAssistedStrikes.ts');
    // Snapshot of the approved instrument dimensions, prior to rearrangement.
    const inch = 0.0254;
    const prior = {
      snare: { diameter: 14 * inch, depth: 5.5 * inch, position: [0, 0.67, 0.53] },
      kick: { diameter: 22 * inch, depth: 16 * inch, position: [0.12, 0.30, -0.10] },
      smallTom: { diameter: 10 * inch, depth: 8 * inch, position: [-0.18, 0.91, 0.02] },
      middleTom: { diameter: 12 * inch, depth: 9 * inch, position: [0.16, 0.93, 0] },
      floorTom: { diameter: 16 * inch, depth: 14 * inch, position: [0.43, 0.66, 0.48] },
      hihat: { diameter: 14 * inch, position: [-0.40, 0.83, 0.51] },
      crash: { diameter: 18 * inch, position: [-0.43, 1.04, 0.09] },
      ride: { diameter: 20 * inch, position: [0.49, 0.94, 0.23] },
    };
    const scene = window.layoutScene;
    const actual = scene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
    const fixtureScene = new THREE.Scene();
    const fixture = createVirtualDrumSet(fixtureScene, { layout: VR_DRUM_LAYOUT });
    const baselineScene = new THREE.Scene();
    const baseline = createVirtualDrumSet(baselineScene, { layout: prior });
    fixtureScene.updateMatrixWorld(true); baselineScene.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    const getPart = (kit, id) => kit.children.find(child => child.userData.drumType === id);
    const head = new THREE.Vector3(0, 1.22, 1);
    const mismatches = [], measurements = [], intersections = [], sightLines = [];
    let cases = 0;
    // Compare instrument vertex/index buffers, local mesh transforms and material
    // properties against the original kit. Mounts/stands follow placement.
    const signature = part => {
      const values = [];
      part.traverse(object => {
        if (!object.isMesh) return;
        const geometry = object.geometry;
        values.push({ type: geometry.type, attributes: Object.fromEntries(Object.entries(geometry.attributes)
          .map(([key, attribute]) => [key, Array.from(attribute.array)])), index: geometry.index && Array.from(geometry.index.array),
          position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(),
          material: (Array.isArray(object.material) ? object.material : [object.material]).map(material => ({
            type: material.type, color: material.color?.getHex(), roughness: material.roughness, metalness: material.metalness,
            opacity: material.opacity, side: material.side, clearcoat: material.clearcoat,
          })) });
      });
      return values;
    };
    const compare = (a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-7;
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every(key => compare(a[key], b[key]));
    };
    // Conservative oriented boxes around shells, heads and rims (excluding
    // intentional support hardware). Nonintersecting boxes prove body clearance.
    const bodies = fixture.group.children.filter(part => part.userData.drumType).map(part => {
      const id = part.userData.drumType;
      const shell = part.children.find(child => child.geometry?.parameters.openEnded);
      const body = part.children.find(child => child.geometry?.type === 'LatheGeometry');
      const radius = shell ? shell.geometry.parameters.radiusTop : body.geometry.parameters.points.at(-1).x;
      const depth = shell?.geometry.parameters.height;
      const localBox = new THREE.Box3(
        new THREE.Vector3(-radius - 0.023, id === 'kick' ? -depth / 2 - 0.06 : shell ? -depth - 0.03 : id === 'hihat' ? -0.09 : -0.003, -radius - 0.023),
        new THREE.Vector3(radius + 0.023, id === 'kick' ? depth / 2 + 0.06 : shell ? 0.041 : 0.07, radius + 0.023),
      );
      const obb = new OBB().fromBox3(localBox).applyMatrix4(part.matrixWorld);
      const live = getPart(actual, id), old = getPart(baseline.group, id);
      measurements.push({ id, diameter: radius * 2, depth, expected: prior[id], position: live.position.toArray(),
        rotation: live.rotation.toArray().slice(0, 3), scale: live.scale.toArray(),
        geometryAndMaterialsUnchanged: compare(signature(part), signature(old)),
        renderedMatchesFixture: compare(signature(live), signature(part)) });
      return { id, obb };
    });
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      if (bodies[i].obb.intersectsOBB(bodies[j].obb)) intersections.push([bodies[i].id, bodies[j].id]);
    }
    // The central 70% of each playable surface should have a clear line of
    // sight from the unchanged seat. Include cymbal bodies, shells and heads.
    const ray = new THREE.Raycaster();
    for (const surface of fixture.hitSurfaces.filter(surface => surface.id !== 'kick')) {
      let clear = 0, total = 0;
      const occluders = [];
      for (const ratio of [0, 0.35, 0.7]) for (let angle = 0; angle < (ratio ? 16 : 1); angle++) {
        const x = Math.cos(angle * Math.PI / 8) * surface.radius * ratio;
        const z = Math.sin(angle * Math.PI / 8) * surface.radius * ratio;
        const t = ratio;
        const y = surface.cymbal ? 0.049 * Math.exp(-((t / 0.2) ** 3)) + 0.019 * (1 - t) ** 2 : surface.height;
        const point = new THREE.Vector3(x, y, z).applyMatrix4(surface.mesh.matrixWorld);
        ray.set(head, point.clone().sub(head).normalize());
        ray.far = point.distanceTo(head) + 0.002;
        const obstruction = ray.intersectObjects(fixture.raycastTargets, true)
          .find(hit => hit.object.userData.drumType !== surface.id);
        total++;
        if (!obstruction) clear++;
        else occluders.push(obstruction.object.userData.drumType);
      }
      sightLines.push({ id: surface.id, clear, total, occluders });
    }
    // Core, near-edge and padded strikes at multiple heights: all zones active.
    // Forward and reversed zone order must select the same intended instrument.
    for (const fps of [60, 72, 90, 120]) for (const hand of ['left', 'right']) {
      for (const height of [0.08, 0.15, 0.20, 0.25, 0.30]) for (const surface of fixture.hitSurfaces) {
        const hits = [];
        const engine = createVRAssistedStrikes(fixture.hitSurfaces, id => hits.push(id));
        const previous = new THREE.Vector3(0, height, 0).applyMatrix4(surface.mesh.matrixWorld);
        const current = new THREE.Vector3(0, height - 0.006, 0).applyMatrix4(surface.mesh.matrixWorld);
        engine.update(hand, { valid: true, previous, current, grip: current.clone().add(new THREE.Vector3(0, 0, 0.31)) }, 1 / fps, 1, head);
        cases++;
        if (hits.length !== 1 || hits[0] !== surface.id) mismatches.push({ fps, hand, height, intended: surface.id, hits });
      }
    }
    for (const reversed of [false, true]) for (const hand of ['left', 'right']) {
      for (const surface of fixture.hitSurfaces) for (const ratio of [0.7, 0.95, 1.08]) for (let angle = 0; angle < 8; angle++) {
        const hits = [], engine = createVRAssistedStrikes(reversed ? [...fixture.hitSurfaces].reverse() : fixture.hitSurfaces, id => hits.push(id));
        const x = Math.cos(angle * Math.PI / 4) * surface.radius * ratio, z = Math.sin(angle * Math.PI / 4) * surface.radius * ratio;
        const previous = new THREE.Vector3(x, 0.20, z).applyMatrix4(surface.mesh.matrixWorld);
        const current = new THREE.Vector3(x, 0.194, z).applyMatrix4(surface.mesh.matrixWorld);
        engine.update(hand, { valid: true, previous, current, grip: current.clone().add(new THREE.Vector3(0, 0, 0.31)) }, 1 / 90, 1, head);
        cases++;
        // Some far-side points are intentionally beyond the fixed reach cap.
        if (hits.length > 1 || (hits.length && hits[0] !== surface.id)) mismatches.push({ hand, ratio, angle, intended: surface.id, hits });
        if (ratio <= 0.7 && !hits.length) mismatches.push({ hand, ratio, angle, intended: surface.id, hits });
      }
    }
    const notes = [];
    scene.traverse(object => { if (/^(note-|highway-)/.test(object.name)) notes.push(object.name); });
    // Render the real scene with separate QA cameras at the actual fixed seat,
    // then overhead. Neither the app's camera nor the objects are changed.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1440, 900); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    const seated = new THREE.PerspectiveCamera(85, 1.6, 0.03, 30);
    seated.position.copy(head); seated.rotation.x = -Math.atan2(0.83, 1.45); seated.updateMatrixWorld(true);
    renderer.render(scene, seated);
    const seatedImage = renderer.domElement.toDataURL('image/png');
    const overhead = new THREE.PerspectiveCamera(48, 1.6, 0.03, 30);
    overhead.position.set(0, 3.3, 0.9); overhead.lookAt(0, 0.5, 0.25); overhead.updateMatrixWorld(true);
    renderer.render(scene, overhead);
    const overheadImage = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    return { measurements, intersections, sightLines, mismatches, cases, notes, notesEnabled: VR_FREE_DRUMMING.fallingNotes,
      seatedImage, overheadImage };
  });
  for (const [name, data] of [['vr-arrangement-seated', result.seatedImage], ['vr-arrangement-overhead', result.overheadImage]]) {
    await writeFile(`${artifactDir}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
  delete result.seatedImage; delete result.overheadImage;
  await writeFile(`${artifactDir}/vr-arrangement-validation.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ measurements: result.measurements.map(({ id, geometryAndMaterialsUnchanged, renderedMatchesFixture }) =>
    ({ id, geometryAndMaterialsUnchanged, renderedMatchesFixture })), intersections: result.intersections,
    sightLines: result.sightLines, mismatches: result.mismatches, cases: result.cases }, null, 2));
  for (const measured of result.measurements) {
    assert.equal(measured.diameter, measured.expected.diameter, `${measured.id} diameter unchanged`);
    assert.equal(measured.depth, measured.expected.depth, `${measured.id} depth unchanged`);
    assert(measured.geometryAndMaterialsUnchanged, `${measured.id} geometry, materials and local transforms unchanged`);
    assert(measured.renderedMatchesFixture, `${measured.id} actual scene matches the tested fixture`);
    assert.deepEqual(measured.scale, [1, 1, 1]);
  }
  assert.deepEqual(result.intersections, [], 'No shell/head/cymbal envelope intersections');
  for (const view of result.sightLines) assert.equal(view.clear, view.total, `${view.id} main playing area unobstructed from the seat`);
  assert.deepEqual(result.mismatches, [], 'Both hands choose the intended instrument with all production zones active');
  assert.equal(result.notesEnabled, false); assert.deepEqual(result.notes, []); assert.deepEqual(errors, []);
  console.log(`PASS: ${result.cases} all-zone assisted strikes; unchanged instrument geometry/materials/dimensions; body clearance; seated sight lines; notes disabled. Hardware NOT tested.`);
} finally { await browser.close(); }
