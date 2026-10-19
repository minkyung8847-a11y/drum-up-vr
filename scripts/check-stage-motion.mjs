import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Shader Error|VALIDATE_STATUS|gl\.getError/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  const results = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/components/concertStage.ts')).name;
    const { createConcertStage } = await import(url);
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    const scene = new THREE.Scene();
    const venue = createConcertStage(scene);
    const sticks = venue.group.getObjectByName('audience-glow-sticks');
    const anchors = Array.from(sticks.instanceMatrix.array);
    const snapshot = () => {
      const values = [];
      venue.group.traverse(object => {
        if (object.geometry?.type === 'CylinderGeometry' && object.material?.type === 'ShaderMaterial')
          values.push([...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]);
      });
      return JSON.stringify(values);
    };
    venue.update(3); const at3 = snapshot();
    venue.update(13); const at13 = snapshot();
    venue.update(3); const repeated3 = snapshot();
    for (let frame = 0; frame <= 180; frame++) venue.update(frame / 30);
    const thirtyFPS = snapshot();
    for (let frame = 0; frame <= 540; frame++) venue.update(frame / 90);
    const ninetyFPS = snapshot();
    let people = 0;
    venue.group.traverse(object => { if (/audience-(heads|bodies)/.test(object.name) || object.geometry?.type === 'SphereGeometry') people++; });
    const originalRaycast = THREE.Raycaster.prototype.setFromCamera;
    THREE.Raycaster.prototype.setFromCamera = function (point, camera) {
      window.sceneCamera = camera;
      return originalRaycast.call(this, point, camera);
    };
    const result = { people, count: sticks.count, spotlightsMove: at3 !== at13,
      deterministic: at3 === repeated3, frameIndependent: thirtyFPS === ninetyFPS,
      anchored: JSON.stringify(anchors) === JSON.stringify(Array.from(sticks.instanceMatrix.array)),
      varied: new Set(sticks.geometry.getAttribute('speed').array).size > 100,
      timeUpdated: sticks.material.uniforms.time.value === 6 };
    venue.dispose();
    result.disposed = scene.children.length === 0;
    return result;
  });
  assert.equal(results.people, 0);
  assert(results.count > 2000);
  for (const name of ['spotlightsMove', 'deterministic', 'frameIndependent', 'anchored', 'varied', 'timeUpdated', 'disposed']) assert(results[name], name);
  await page.mouse.click(100, 150);
  const depth = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const camera = window.sceneCamera;
    let scene = camera;
    while (scene.parent) scene = scene.parent;
    scene.updateMatrixWorld(true);
    const kit = scene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
    const floor = kit.children.find(part => part.userData.drumType === 'floorTom');
    const kick = kit.children.find(part => part.userData.drumType === 'kick');
    const shell = floor.children.find(child => child.geometry?.type === 'CylinderGeometry' && child.userData.drumType === 'floorTom');
    const front = new THREE.Box3().setFromObject(shell);
    const bass = new THREE.Box3().setFromObject(kick);
    const point = floor.localToWorld(new THREE.Vector3(-0.12, 0.006, 0)).project(camera);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
    const targets = [];
    kit.traverse(object => { if (object.isMesh && object.userData.drumType) targets.push(object); });
    const nearest = ray.intersectObjects(targets, false)[0]?.object.userData.drumType;
    return { scale: floor.scale.toArray(), floorZ: floor.position.z, kickZ: kick.position.z,
      shellAhead: front.min.z > bass.max.z, nearest, renderOrder: floor.renderOrder,
      depthTest: shell.material.depthTest, depthWrite: shell.material.depthWrite };
  });
  assert.deepEqual(depth.scale, [0.8, 0.8, 0.8]);
  assert(Math.abs(depth.floorZ - 0.72) < 1e-10);
  assert.equal(depth.kickZ, 0.08);
  assert(depth.shellAhead && depth.depthTest && depth.depthWrite);
  assert.equal(depth.renderOrder, 0);
  assert.equal(depth.nearest, 'floorTom');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'vr-stage-motion.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: no audience bodies/heads; 2,000+ anchored GPU light sticks with varied phases; moving spotlights; deterministic time-based motion; cleanup; floor tom scale preserved and physically ahead of kick; correct ray hit/depth testing; no shader/runtime errors.');
} finally {
  await browser.close();
}
