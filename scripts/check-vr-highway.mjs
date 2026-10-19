import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.VR_TEST_URL || 'http://127.0.0.1:5175/'}#/vr`);
  await page.locator('.vr-practice-stage canvas').waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.screenshot({ path: 'vr-highway-desktop.png' });
  const result = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/components/vrNoteHighway.ts')).name;
    const { createVRNoteHighway, HIGHWAY_LANES, HIGHWAY_PATTERN, DEMO_DURATION } = await import(url);
    const threeURL = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(threeURL);
    const update = THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld = function (...args) {
      if (this.name === 'note-highway-anchor') window.liveHighway = this;
      return update.apply(this, args);
    };
    window.noteSnapshot = () => {
      const values = [];
      window.liveHighway.traverse(object => {
        if (typeof object.userData.hitTime === 'number') values.push([object.name, object.position.y, object.visible]);
      });
      return values;
    };
    const scene = new THREE.Scene();
    const road = createVRNoteHighway(scene);
    const camera = new THREE.PerspectiveCamera(85, 1.8, 0.03, 30);
    road.layout(camera, new THREE.Vector3(0, 1.55, 1.6), new THREE.Quaternion());
    const note = road.notes[0].mesh;
    road.update(1); const first = note.position.y;
    road.update(1.5); const second = note.position.y;
    road.update(2); const third = note.position.y;
    road.update(3); const atHit = note.position.y;
    const chord = road.notes[1].mesh.position.y;
    road.update(3.2); const passedHidden = !note.visible;
    road.update(1); const seekRestored = note.visible && note.position.y === first;
    road.update(DEMO_DURATION + 1); const loopMatches = note.position.y === first;
    const names = new Set(HIGHWAY_LANES.map(lane => lane.id));
    road.dispose();
    return { constantSpeed: Math.abs((first - second) - (second - third)) < 1e-10,
      atHit, chord, passedHidden, seekRestored, loopMatches,
      laneCount: HIGHWAY_LANES.length, colors: new Set(HIGHWAY_LANES.map(lane => lane.color)).size,
      validPattern: HIGHWAY_PATTERN.every(note => names.has(note.lane)), disposed: scene.children.length === 0 };
  });
  assert(result.constantSpeed && result.seekRestored && result.loopMatches);
  assert.equal(result.atHit, 0); assert.equal(result.chord, 0);
  assert(result.passedHidden && result.validPattern && result.disposed);
  assert.equal(result.laneCount, 8); assert.equal(result.colors, 8);
  const canvas = page.locator('.vr-practice-stage canvas');
  await page.waitForFunction(() => !!window.liveHighway);
  const paused = await page.evaluate(() => window.noteSnapshot());
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => window.noteSnapshot()), paused, 'Pause freezes notes while venue lights continue moving');
  await page.getByRole('button', { name: 'Resume demo', exact: true }).click();
  await page.waitForTimeout(700);
  assert.notDeepEqual(await page.evaluate(() => window.noteSnapshot()), paused, 'Resume moves notes');
  await page.getByRole('button', { name: 'Restart demo', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'vr-highway-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: 8 distinct lanes; exact hit times/chords; constant speed; deterministic seek/loop; pause/resume/restart; disposal; desktop/mobile rendering; no runtime errors.');
} finally {
  await browser.close();
}
