import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5176/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  const result = await page.evaluate(async () => {
    const THREE = await import(performance.getEntriesByType('resource').find(e => /\/three\.js\?/.test(e.name)).name);
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const { createVRHardwareInstances } = await import('/src/components/vrHardwareInstances.ts');
    const { createVRDrumInteraction } = await import('/src/components/vrDrumInteraction.ts');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101114);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-3, 6, 4); scene.add(light);
    const kit = createRestoredVRDrumSet(scene);
    const feedback = createVRDrumInteraction(kit);
    const camera = new THREE.PerspectiveCamera(85, 1.6, 0.03, 30);
    camera.position.set(0, 1.22, 1); camera.rotation.x = -Math.atan2(0.83, 1.45);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(960, 600);
    // Count the same complete geometry on both paths. Production instancing
    // culls whole batches, while ordinary meshes cull each tiny lug separately.
    scene.traverse(object => { if (object.isMesh) object.frustumCulled = false; });
    const snapshot = () => {
      renderer.render(scene, camera);
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 600;
      const ctx = canvas.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0);
      return { pixels: ctx.getImageData(0, 0, 960, 600).data,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    };
    const before = snapshot(), optimized = createVRHardwareInstances(kit.group);
    optimized.instances.children.forEach(mesh => { mesh.frustumCulled = false; });
    const after = snapshot();
    let error = 0, changed = 0, maximumMatrixError = 0, index = 0;
    for (let i = 0; i < before.pixels.length; i += 4) {
      let different = false;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(before.pixels[i + channel] - after.pixels[i + channel]);
        error += delta; if (delta > 3) different = true;
      }
      if (different) changed++;
    }
    const instanceMatrix = new THREE.Matrix4(), world = new THREE.Matrix4();
    let materialsIdentical = true;
    for (const batch of optimized.instances.children) for (let i = 0; i < batch.count; i++) {
      const source = optimized.sourceMeshes[index++];
      batch.getMatrixAt(i, instanceMatrix); world.multiplyMatrices(batch.matrixWorld, instanceMatrix);
      world.elements.forEach((value, j) => { maximumMatrixError = Math.max(maximumMatrixError, Math.abs(value - source.matrixWorld.elements[j])); });
      materialsIdentical &&= batch.material === source.material;
    }
    const hidden = optimized.sourceMeshes.length;
    const headsIndependent = kit.hitSurfaces.every(surface => surface.mesh.visible && !optimized.sourceMeshes.includes(surface.mesh));
    const cymbal = kit.hitSurfaces.find(surface => surface.id === 'crash').mesh;
    const originalRotation = cymbal.rotation.clone(); feedback.hit('crash', 0.8); feedback.update(0.015);
    const cymbalStillAnimates = !cymbal.rotation.equals(originalRotation); feedback.update(1);
    optimized.dispose();
    const restored = snapshot();
    const sourcesRestored = !kit.group.getObjectByName('vr-static-hardware-instances')
      && optimized.sourceMeshes.every(mesh => mesh.visible);
    const image = renderer.domElement.toDataURL('image/png');
    feedback.dispose(); renderer.dispose();
    return { before: { calls: before.calls, triangles: before.triangles }, after: { calls: after.calls, triangles: after.triangles },
      restored: { calls: restored.calls, triangles: restored.triangles }, hidden, instances: index, materialsIdentical,
      maximumMatrixError, changedPixelFraction: changed / (960 * 600), meanChannelError: error / (960 * 600 * 3),
      headsIndependent, cymbalStillAnimates, sourcesRestored, image };
  });
  await writeFile(`${process.env.VR_ARTIFACT_DIR || '.'}/vr-hardware-render-proof.png`, Buffer.from(result.image.split(',')[1], 'base64'));
  delete result.image; console.log(JSON.stringify(result, null, 2));
  assert(result.after.calls < result.before.calls * 0.5, 'Static hardware must substantially reduce draw calls');
  assert.equal(result.before.triangles, result.after.triangles, 'No geometry detail removed');
  assert.deepEqual(result.restored, result.before, 'Disposal restores the original rendering');
  assert.equal(result.hidden, result.instances); assert(result.materialsIdentical);
  assert(result.maximumMatrixError < 1e-6, 'Every rendered instance retains its source world transform');
  assert(result.changedPixelFraction < 0.005 && result.meanChannelError < 0.05, 'Rendering remains visually equivalent');
  assert(result.headsIndependent && result.cymbalStillAnimates && result.sourcesRestored);
  assert.deepEqual(errors, []);
  console.log('PASS: hardware draw-call reduction, exact triangle counts/materials, transform and pixel equivalence, independent feedback and reversible disposal. Hardware FPS NOT tested.');
} finally { await browser.close(); }
