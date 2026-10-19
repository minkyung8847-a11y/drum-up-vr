import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const synthURL = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/utils/synth.ts')).name;
    const { drumSynth } = await import(synthURL);
    window.hits = [];
    window.animations = [];
    window.inactiveAtRest = true;
    const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (...args) => { window.hits.push(args[0]); return trigger(...args); };
    const ray = THREE.Raycaster.prototype.setFromCamera;
    let left, right;
    const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.23, 0, 0));
    THREE.Raycaster.prototype.setFromCamera = function (point, camera) {
      left = camera.getObjectByName('left-stick-swing');
      right = camera.getObjectByName('right-stick-swing');
      return ray.call(this, point, camera);
    };
    const slerp = THREE.Quaternion.prototype.slerpQuaternions;
    THREE.Quaternion.prototype.slerpQuaternions = function (...args) {
      const hand = this === left?.quaternion ? 'left' : this === right?.quaternion ? 'right' : null;
      if (hand && window.hits.length) {
        window.animations[window.hits.length - 1] = hand;
        const other = hand === 'left' ? right : left;
        if (other.quaternion.angleTo(rest) > 1e-7) window.inactiveAtRest = false;
      }
      return slerp.apply(this, args);
    };
  });
  // Misses and silent look gestures must not consume the first/next hand.
  await page.mouse.click(100, 150);
  const hits = [
    ['crash', 480, 320], ['ride', 980, 320], ['hihat-closed', 490, 440],
    ['tom-high', 650, 330], ['tom-mid', 790, 330], ['snare', 550, 550],
    ['kick', 720, 520], ['tom-floor', 880, 610],
  ];
  for (const [index, [pad, x, y]] of hits.entries()) {
    await page.mouse.click(x, y); // Every hit uses the LEFT button.
    await page.waitForFunction(i => !!window.animations[i], index);
    const observed = await page.evaluate(() => ({ hits: window.hits, hands: window.animations, inactive: window.inactiveAtRest }));
    assert.equal(observed.hits[index], pad);
    assert.equal(observed.hands[index], index % 2 === 0 ? 'left' : 'right');
    assert(observed.inactive);
    await page.waitForTimeout(250);
  }
  await page.mouse.click(100, 150);
  await page.keyboard.down('Shift');
  await page.mouse.click(550, 550);
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => window.hits.length), 8);
  await page.mouse.click(550, 550, { button: 'right' });
  await page.waitForFunction(() => !!window.animations[8]);
  assert.equal(await page.evaluate(() => window.animations[8]), 'left', 'Right button shares the same alternating state');
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  console.log('PASS: left clicks alternate L/R across all 8 instruments; other stick rests; misses/Shift do not advance; right button shares sequence; correct audio pads; no runtime errors.');
} finally {
  await browser.close();
}
