import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const setFromCamera = THREE.Raycaster.prototype.setFromCamera;
    THREE.Raycaster.prototype.setFromCamera = function (point, camera) {
      window.testCamera = camera;
      return setFromCamera.call(this, point, camera);
    };
    window.cameraSnapshot = () => {
      const camera = window.testCamera;
      let scene = camera;
      while (scene.parent) scene = scene.parent;
      scene.updateMatrixWorld(true);
      const kit = scene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
      const roots = [kit, scene.getObjectByName('concert-stage-environment'), scene.getObjectByName('note-highway-anchor')];
      return {
        position: camera.getWorldPosition(new THREE.Vector3()).toArray(),
        direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        yaw: camera.parent.parent.rotation.y, pitch: camera.parent.rotation.x,
        fov: camera.fov,
        world: roots.map(root => root.matrixWorld.toArray()),
        kitParts: kit.children.map(part => part.matrixWorld.toArray()),
      };
    };
  });
  // An empty spot captures the actual camera without changing any drum state.
  await page.mouse.click(100, 150);
  const initial = await page.evaluate(() => window.cameraSnapshot());
  await page.mouse.move(100, 150);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => Math.abs(window.cameraSnapshot().yaw) > 1.5);
  const turned = await page.evaluate(() => window.cameraSnapshot());
  assert.deepEqual(turned.position, initial.position, 'Look rotates around the fixed eye position');
  assert.deepEqual(turned.world, initial.world, 'Kit, venue, and highway remain world-anchored');
  assert.deepEqual(turned.kitParts, initial.kitParts, 'Individual drum transforms remain unchanged');
  assert.equal(turned.fov, initial.fov, 'Looking does not zoom or reframe');
  assert.notDeepEqual(turned.direction, initial.direction);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.waitForFunction(() => Math.abs(window.cameraSnapshot().yaw) < 0.001);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(100, 400);
    await page.mouse.down();
    await page.mouse.move(1350, 400, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForFunction(() => window.cameraSnapshot().yaw < -Math.PI * 2);
  assert.deepEqual((await page.evaluate(() => window.cameraSnapshot())).position, initial.position);
  await page.mouse.move(100, 400);
  await page.mouse.down();
  await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 1, clientX: 100, clientY: -100000, bubbles: true,
  })));
  await page.waitForFunction(() => Math.abs(window.cameraSnapshot().pitch - 80 * Math.PI / 180) < 0.005);
  await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 1, clientX: 100, clientY: 100000, bubbles: true,
  })));
  await page.waitForFunction(() => Math.abs(window.cameraSnapshot().pitch + 80 * Math.PI / 180) < 0.005);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.waitForFunction(() => Math.abs(window.cameraSnapshot().yaw) < 0.001
    && Math.abs(window.cameraSnapshot().pitch + Math.atan2(0.83, 1.45)) < 0.001);
  const reset = await page.evaluate(() => window.cameraSnapshot());
  assert.deepEqual(reset.position, initial.position);
  assert.deepEqual(reset.world, initial.world);
  await page.mouse.move(100, 150);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const stoppedYaw = (await page.evaluate(() => window.cameraSnapshot())).yaw;
  await page.mouse.move(900, 150, { steps: 8 });
  await page.mouse.up();
  assert(Math.abs((await page.evaluate(() => window.cameraSnapshot())).yaw - stoppedYaw) < 0.01, 'Blur cancels dragging');
  await page.screenshot({ path: 'vr-first-person-camera.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: unmodified drag looks around; >360° yaw; ±80° pitch limits; fixed eye position/FOV; world and drums stationary; reset and blur cleanup. Physical headset tracking not tested.');
} finally {
  await browser.close();
}
