import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.log('Browser:', message.text()); });
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  const canvas = page.locator('.vr-practice-stage canvas');
  await canvas.waitFor();
  if (await page.getByRole('button', { name: 'Pause demo', exact: true }).count()) await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 20000 }).catch(async error => {
    console.log('Audio status:', await page.getByRole('status').textContent());
    console.log(await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name;
      const { drumSynth: synth } = await import(url);
      return { kit: synth.getCurrentKitId(), state: synth.ctx?.state, loaded: synth.kitBuffers.get(synth.getCurrentKitId())?.size,
        pending: [...synth.loadingRegions.keys()] };
    }));
    throw error;
  });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name;
    const { drumSynth } = await import(url);
    const keys = { kick: 36, snare: 38, 'hihat-closed': 42, 'tom-high': 41,
      'tom-mid': 45, 'tom-floor': 43, crash: 49, ride: 51 };
    window.hitCalls = [];
    window.audioStarts = [];
    window.audioContext = drumSynth.ctx;
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    window.feedbackSeen = false;
    window.motionSeen = false;
    let targets = [];
    let activeCamera;
    const fromCamera = THREE.Raycaster.prototype.setFromCamera;
    THREE.Raycaster.prototype.setFromCamera = function (point, camera) {
      activeCamera = camera;
      return fromCamera.call(this, point, camera);
    };
    const intersect = THREE.Raycaster.prototype.intersectObjects;
    THREE.Raycaster.prototype.intersectObjects = function (objects, ...args) {
      targets = objects;
      return intersect.call(this, objects, ...args);
    };
    window.kitSnapshot = () => {
      const root = targets.find(object => object.userData.drumType === 'snare')?.parent.parent;
      const values = [];
      root?.traverse(object => values.push([object.id, ...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray(), object.material?.emissive?.getHex()]));
      return values;
    };
    window.hitPointFor = pad => {
      const id = { 'hihat-closed': 'hihat', 'tom-high': 'smallTom', 'tom-mid': 'middleTom', 'tom-floor': 'floorTom' }[pad] ?? pad;
      const canvas = document.querySelector('.vr-practice-stage canvas');
      const rect = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      for (const mesh of targets.filter(target => target.userData.drumType === id)) {
        mesh.geometry.computeBoundingBox();
        const radius = mesh.geometry.boundingBox.max.x;
        for (const ratio of [0.2, 0.5, 0.8]) for (let angle = 0; angle < 12; angle++) {
          const point = new THREE.Vector3(Math.cos(angle * Math.PI / 6) * radius * ratio,
            mesh.geometry.type === 'CylinderGeometry' ? mesh.geometry.boundingBox.max.y : 0.02,
            Math.sin(angle * Math.PI / 6) * radius * ratio).applyMatrix4(mesh.matrixWorld).project(activeCamera);
          if (Math.abs(point.x) >= 0.98 || Math.abs(point.y) >= 0.98) continue;
          ray.setFromCamera(new THREE.Vector2(point.x, point.y), activeCamera);
          const found = ray.intersectObjects(targets, true)[0];
          if (found?.object.userData.drumType === id) return { x: rect.left + (point.x + 1) * rect.width / 2,
            y: rect.top + (1 - point.y) * rect.height / 2 };
        }
      }
      throw Error(`No visible mouse target for ${id}`);
    };
    const observeFeedback = () => {
      for (const object of targets) {
        if (['crash', 'ride', 'hihat'].includes(object.userData.drumType)
            && object.material?.emissive?.b > 0 && object.material.emissive.b >= object.material.emissive.r
            && object.material.emissiveIntensity > 0) window.feedbackSeen = true;
        if (object.parent?.userData.drumType === 'snare'
            && object.geometry.type === 'RingGeometry'
            && Math.abs(object.position.y - 0.006) > 0.00001) window.motionSeen = true;
      }
      requestAnimationFrame(observeFeedback);
    };
    requestAnimationFrame(observeFeedback);
    const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (pad, velocity) => {
      window.hitCalls.push({ pad, time: performance.now() });
      return trigger(pad, velocity);
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args);
      const start = source.start.bind(source);
      source.start = (...startArgs) => {
        const hit = window.hitCalls.at(-1);
        const expected = drumSynth.kitBuffers.get(drumSynth.getCurrentKitId()).get(keys[hit.pad]);
        window.audioStarts.push({ pad: hit.pad, delay: performance.now() - hit.time,
          correctBuffer: source.buffer === expected, frames: source.buffer.length });
        return start(...startArgs);
      };
      return source;
    };
  });
  await page.mouse.click(100, 150);
  await page.waitForTimeout(500);
  const resting = await page.evaluate(() => window.kitSnapshot());
  const hits = ['crash', 'ride', 'hihat-closed', 'tom-high', 'tom-mid', 'snare', 'kick', 'tom-floor'];
  for (const [index, pad] of hits.entries()) {
    const { x, y } = await page.evaluate(pad => window.hitPointFor(pad), pad);
    const before = await page.evaluate(() => window.hitCalls.length);
    await page.mouse.click(x, y, { button: index % 2 === 0 ? 'left' : 'right' });
    const result = await page.evaluate(() => ({ count: window.hitCalls.length,
      hit: window.hitCalls.at(-1), audio: window.audioStarts.at(-1) }));
    assert.equal(result.count, before + 1, `One hit at ${pad}`);
    assert.equal(result.hit.pad, pad);
    assert(result.audio.correctBuffer && result.audio.frames > 0, `Existing sample for ${pad}`);
    assert(result.audio.delay < 30, `No loading wait for ${pad}: ${result.audio.delay}ms`);
  }
  await page.waitForTimeout(600);
  const beforeRapid = await page.evaluate(() => window.audioStarts.length);
  await page.evaluate(() => {
    const canvas = document.querySelector('.vr-practice-stage canvas');
    const point = window.hitPointFor('snare');
    for (let i = 0; i < 20; i++) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        button: 0, pointerId: 1, clientX: point.x, clientY: point.y, bubbles: true,
      }));
    }
  });
  assert.equal(await page.evaluate(() => window.audioStarts.length), beforeRapid + 20);
  await canvas.screenshot({ path: 'vr-hit-feedback.png' });
  assert(await page.evaluate(() => window.feedbackSeen), 'Highlight must reach a rendered frame');
  assert(await page.evaluate(() => window.motionSeen), 'Subtle movement must reach a rendered frame');
  await page.waitForTimeout(700);
  await canvas.screenshot({ path: 'vr-hits-resting.png' });
  assert.deepEqual(await page.evaluate(() => window.kitSnapshot()), resting, 'Kit must return exactly to its customized resting transforms');
  const count = await page.evaluate(() => window.audioStarts.length);
  await page.mouse.click(100, 150);
  await page.mouse.move(700, 420);
  await page.keyboard.down('Shift');
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1000, 650, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => window.audioStarts.length), count, 'Empty space and Shift-drag stay silent');
  assert.equal(await page.evaluate(() => window.audioContext.state), 'running');
  assert.deepEqual(errors, []);
  console.log('PASS: both mouse buttons select correct samples across all 8 instruments; 20 rapid hits start 20 voices; feedback restores exact positions; misses/Shift-drag are silent; audio context running; no runtime errors.');
} finally {
  await browser.close();
}
