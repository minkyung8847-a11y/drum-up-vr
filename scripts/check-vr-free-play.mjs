import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5176/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Pause demo', exact: true }).count(), 0);
  assert.equal(await page.getByText('120 BPM · VISUAL DEMO', { exact: true }).count(), 0);
  await page.evaluate(async () => {
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    const update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      window.freePlayScene = this;
      return update.apply(this, args);
    };
  });
  await page.waitForFunction(() => !!window.freePlayScene);
  const result = await page.evaluate(async () => {
    const { VR_FREE_DRUMMING } = await import('/src/components/vrDrumConfig.ts');
    const { ORIGINAL_IMPORTED_KIT } = await import('/src/components/originalImportedKit.ts');
    const { RESTORED_VR_SCALE } = await import('/src/components/restoredVRDrumSet.ts');
    const { createVirtualDrumSet } = await import('/src/components/virtualDrumSet.ts');
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    const scene = window.freePlayScene;
    const kit = scene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
    scene.updateMatrixWorld(true);
    const instruments = Object.entries(ORIGINAL_IMPORTED_KIT.instruments).map(([id, original]) => {
      const expected = { diameter: original.diameter * RESTORED_VR_SCALE,
        depth: original.depth && original.depth * RESTORED_VR_SCALE,
        position: original.position.map(value => value * RESTORED_VR_SCALE) };
      const part = kit.children.find(child => child.userData.drumType === id);
      const shell = part.children.find(child => child.geometry?.type === 'CylinderGeometry' && child.geometry.parameters.openEnded);
      const body = part.children.find(child => child.geometry?.type === 'LatheGeometry');
      const radius = shell ? shell.geometry.parameters.radiusTop : body.geometry.parameters.points.at(-1).x;
      const scale = part.getWorldScale(new THREE.Vector3());
      return { id, diameter: 2 * radius * scale.x, depth: shell && shell.geometry.parameters.height * scale.y,
        expected, position: part.getWorldPosition(new THREE.Vector3()).toArray(),
        scale: part.getWorldScale(new THREE.Vector3()).toArray() };
    });
    const notes = [];
    scene.traverse(object => { if (/^(note-|highway-)/.test(object.name)) notes.push(object.name); });
    const defaultScene = new THREE.Scene();
    const legacy = createVirtualDrumSet(defaultScene);
    const kick = legacy.group.children.find(child => child.userData.drumType === 'kick');
    const defaultKickDiameter = 2 * kick.children.find(child => child.geometry?.parameters.openEnded).geometry.parameters.radiusTop;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    defaultScene.traverse(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    return { instruments, notes, notesEnabled: VR_FREE_DRUMMING.fallingNotes,
      rootScale: kit.scale.toArray(), rootPosition: kit.position.toArray(), defaultKickDiameter, expectedRootScale: RESTORED_VR_SCALE };
  });
  for (const instrument of result.instruments) {
    assert(Math.abs(instrument.diameter - instrument.expected.diameter) < 1e-8, `${instrument.id} measured diameter`);
    if (instrument.depth) assert(Math.abs(instrument.depth - instrument.expected.depth) < 1e-8);
    assert(instrument.position.every((value, axis) => Math.abs(value - instrument.expected.position[axis]) < 1e-8), `${instrument.id} original normalized position`);
  }
  assert(result.rootScale.every(value => Math.abs(value - result.expectedRootScale) < 1e-10)); assert.deepEqual(result.rootPosition, [0, 0, 0]);
  assert.deepEqual(result.notes, []); assert.equal(result.notesEnabled, false);
  assert.equal(result.defaultKickDiameter, 0.88, 'Shared default kit remains unchanged');
  await page.screenshot({ path: 'vr-free-play-real-scale.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: actual rendered diameters/depths and all seated positions, metre-scale transforms, shared default kit preserved, no note/guide objects or demo UI, no page errors.');
  console.log(JSON.stringify(result.instruments.map(({ id, diameter, depth, position }) => ({ id, diameter, depth, position }))));
} finally { await browser.close(); }
