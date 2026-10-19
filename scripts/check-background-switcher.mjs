import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Shader Error|VALIDATE_STATUS/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const ray = THREE.Raycaster.prototype.setFromCamera;
    THREE.Raycaster.prototype.setFromCamera = function (point, camera) {
      window.sceneCamera = camera;
      return ray.call(this, point, camera);
    };
    window.originalCanvas = document.querySelector('canvas');
    const synthURL = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name;
    const { drumSynth } = await import(synthURL);
    window.originalAudio = drumSynth.ctx;
    window.backgroundSnapshot = () => {
      const camera = window.sceneCamera;
      let scene = camera;
      while (scene.parent) scene = scene.parent;
      scene.updateMatrixWorld(true);
      const kit = scene.children.find(child => child.children.some(part => part.userData.drumType === 'snare'));
      const notes = [];
      scene.getObjectByName('note-highway-anchor').traverse(object => {
        if (typeof object.userData.hitTime === 'number') notes.push(object.position.y);
      });
      const transforms = [];
      kit.traverse(object => { if (object.isMesh) transforms.push([object.id, object.material.uuid, object.geometry.uuid, ...object.matrixWorld.toArray()]); });
      return { canvasSame: document.querySelector('canvas') === window.originalCanvas,
        camera: [...camera.matrixWorld.toArray(), camera.fov], kit: transforms, notes,
        audioSame: drumSynth.ctx === window.originalAudio, audioState: drumSynth.ctx.state,
        lighting: scene.children.filter(child => child.isLight).map(light => [light.id, light.intensity, light.color.getHex()]),
        reflections: scene.environment.uuid };
    };
    window.selectBackground = name => {
      const button = [...document.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.includes(name));
      button.click();
    };
  });
  await page.mouse.click(100, 150);
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.waitForTimeout(300);
  const original = await page.evaluate(() => window.backgroundSnapshot());
  for (const name of ['Cloud Concert', 'Dark Studio', 'Concert Arena', 'Cloud Concert']) {
    await page.getByRole('button', { name: 'Change background', exact: true }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
    const next = await page.evaluate(() => window.backgroundSnapshot());
    assert.deepEqual(next, original, `${name} preserves paused notes, canvas, camera, kit, audio context and lighting`);
    await page.getByRole('button', { name: 'Change background', exact: true }).click();
    assert.equal(await page.getByRole('menuitemradio', { name: new RegExp(name) }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'vr-cloud-concert.png' });
  await page.getByRole('button', { name: 'Resume demo', exact: true }).click();
  const before = await page.evaluate(() => window.backgroundSnapshot());
  await page.getByRole('button', { name: 'Change background', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Concert Arena/ }).click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.backgroundSnapshot());
  assert(after.notes[0] < before.notes[0], 'Running note clock continues forward across switching');
  assert.deepEqual(after.camera, original.camera);
  assert.deepEqual(after.kit, original.kit);
  assert(after.canvasSame && after.audioSame);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Change background', exact: true }).click();
  const bounds = await page.getByRole('menu', { name: 'Background environments' }).boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Mobile menu stays inside the viewport');
  await page.screenshot({ path: 'vr-background-menu-mobile.png' });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS: all 3 environments; checked selection and keyboard dismissal; switching preserves canvas, camera, kit geometry/materials/transforms, lighting/reflections, audio context, and note clock; mobile menu fits; no runtime/shader errors.');
} finally {
  await browser.close();
}
