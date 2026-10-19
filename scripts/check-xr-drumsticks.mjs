import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Pose reset screenshots need a static environment, not moving stage lights.
  await page.addInitScript(() => localStorage.setItem('drumup_vr_environment', 'studio'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  if (await page.getByRole('button', { name: 'Pause demo', exact: true }).count()) await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.getByText('Stick setup', { exact: true }).click();
  const canvas = page.locator('.vr-practice-stage canvas');
  const baseline = await canvas.screenshot();
  await page.getByRole('slider', { name: 'left preview position X', exact: true }).focus();
  await page.keyboard.press('End');
  assert(!baseline.equals(await canvas.screenshot()), 'Desktop translation changes the preview');
  await page.getByRole('button', { name: 'Reset left pose', exact: true }).click();
  assert(baseline.equals(await canvas.screenshot()), 'Preview reset restores original pose');
  await page.getByRole('slider', { name: 'left preview rotation X', exact: true }).focus();
  await page.keyboard.press('End');
  assert(!baseline.equals(await canvas.screenshot()), 'Desktop rotation changes the preview');
  await page.getByRole('button', { name: 'Reset left pose', exact: true }).click();
  await page.getByLabel('Adjust', { exact: true }).selectOption('offset');
  const offsetBaseline = await canvas.screenshot();
  await page.getByRole('slider', { name: 'left offset rotation X', exact: true }).focus();
  await page.keyboard.press('End');
  assert(!offsetBaseline.equals(await canvas.screenshot()), 'Grip offset has an independent desktop preview');
  await page.getByRole('button', { name: 'Reset left offset', exact: true }).click();
  assert(offsetBaseline.equals(await canvas.screenshot()));
  await page.screenshot({ path: 'vr-stick-controller-preview.png' });
  const results = await page.evaluate(async () => {
    const moduleURL = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/components/xrDrumstickControllers.ts')).name;
    const { createXRDrumstickControllers } = await import(moduleURL);
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    const rig = new THREE.Group();
    rig.position.set(0, 0, 1.6);
    const grips = [new THREE.Group(), new THREE.Group()];
    const mockXR = { getControllerGrip: index => grips[index] };
    const controller = createXRDrumstickControllers(mockXR, rig);
    const source = hand => ({ handedness: hand, targetRayMode: 'tracked-pointer', gripSpace: {} });
    controller.setActive(true);
    // Deliberately reverse index order: handedness must determine stick identity.
    grips[0].dispatchEvent({ type: 'connected', data: source('right') });
    grips[1].dispatchEvent({ type: 'connected', data: source('left') });
    const handedness = !!grips[0].getObjectByName('right-drumstick') && !!grips[1].getObjectByName('left-drumstick');
    grips[1].position.set(-0.3, 1.1, -0.4);
    grips[1].rotation.set(0.2, -0.3, 0.1);
    controller.update();
    const tip = controller.tips.left;
    const point = tip.getWorldPosition(new THREE.Vector3());
    const followsPose = controller.tipSamples.left.current.distanceTo(point) < 1e-10;
    const localTip = grips[1].worldToLocal(point.clone());
    const gripAligned = localTip.distanceTo(new THREE.Vector3(0, 0, -0.31)) < 1e-10;
    const previous = point.clone();
    grips[1].position.x += 0.2;
    controller.update();
    const realTimeInheritance = Math.abs(controller.tipSamples.left.current.x - previous.x - 0.2) < 1e-10
      && controller.tipSamples.left.previous.distanceTo(previous) < 1e-10;
    const rightBefore = controller.tips.right.getWorldPosition(new THREE.Vector3());
    controller.setOffset('left', { position: [0.02, 0.01, -0.03], rotation: [15, 0, 0] });
    controller.update();
    const offsetWorks = controller.tipSamples.left.current.distanceTo(point) > 0.01
      && controller.tips.right.getWorldPosition(new THREE.Vector3()).distanceTo(rightBefore) < 1e-10;
    grips[1].visible = false;
    controller.update();
    const trackingLost = !controller.tipSamples.left.valid;
    grips[1].visible = true;
    grips[1].dispatchEvent({ type: 'disconnected' });
    controller.update();
    const disconnectHides = !grips[1].getObjectByName('left-drumstick') && !controller.tipSamples.left.valid;
    grips[1].dispatchEvent({ type: 'connected', data: source('left') });
    controller.update();
    const reconnectWorks = controller.tipSamples.left.valid;
    controller.setActive(false);
    controller.update();
    const sessionEndHides = !controller.tipSamples.left.valid && !controller.tipSamples.right.valid
      && !grips[0].getObjectByName('right-drumstick');
    controller.dispose();
    return { handedness, followsPose, gripAligned, realTimeInheritance, offsetWorks,
      trackingLost, disconnectHides, reconnectWorks, sessionEndHides, disposed: rig.children.length === 0 };
  });
  for (const [name, passed] of Object.entries(results)) assert(passed, name);
  await page.getByRole('link', { name: 'Back to DRUM UP', exact: true }).click();
  await page.locator('.vr-practice').waitFor({ state: 'detached' });
  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: async () => true,
      requestSession: async () => { throw new Error('Test headset unavailable'); },
    } });
  });
  await denied.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await denied.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await denied.getByText('Could not enter VR: Test headset unavailable', { exact: true }).waitFor();
  assert(await denied.getByRole('button', { name: 'Enter VR', exact: true }).isEnabled(), 'Rejected sessions remain retryable');
  await denied.close();
  assert.deepEqual(errors, []);
  console.log('PASS: desktop position/rotation/reset/offset preview; mocked controller handedness, inherited pose, grip alignment, offsets, tip samples, loss/reconnect/end/disposal. Real headset tracking NOT tested.');
} finally {
  await browser.close();
}
