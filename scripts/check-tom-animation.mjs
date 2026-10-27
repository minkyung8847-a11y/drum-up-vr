import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = vite.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createVirtualDrumSet } = await import('/src/components/virtualDrumSet.ts');
    const { createVRDrumInteraction } = await import('/src/components/vrDrumInteraction.ts');
    const { drumSynth } = await import('/src/utils/synth.ts');
    drumSynth.trigger = () => {};
    const scene = new THREE.Scene();
    const kit = createVirtualDrumSet(scene);
    const interaction = createVRDrumInteraction(kit);
    const ids = ['smallTom', 'middleTom', 'floorTom'];
    const rest = Object.fromEntries(ids.map(id => {
      const surface = kit.hitSurfaces.find(item => item.id === id);
      surface.mesh.updateWorldMatrix(true, false);
      const visual = kit.tomVisuals.get(id);
      return [id, { surface: surface.mesh.matrixWorld.toArray(), color: visual.head.material.color.getHex() }];
    }));
    const samples = [];
    for (const id of ids) {
      interaction.hit(id);
      interaction.update(0.035);
      const visual = kit.tomVisuals.get(id);
      const surface = kit.hitSurfaces.find(item => item.id === id);
      surface.mesh.updateWorldMatrix(true, false);
      samples.push({ id, peak: visual.group.scale.x, color: visual.head.material.color.getHex(),
        fixed: JSON.stringify(surface.mesh.matrixWorld.toArray()) === JSON.stringify(rest[id].surface),
        othersStill: ids.filter(other => other !== id).every(other => kit.tomVisuals.get(other).group.scale.x === 1) });
      interaction.update(0.145);
      samples.at(-1).restored = visual.group.scale.x === 1 && visual.head.material.color.getHex() === rest[id].color;
    }
    interaction.hit('smallTom'); interaction.update(0.05);
    interaction.hit('smallTom'); interaction.update(0.035);
    const repeatPeak = kit.tomVisuals.get('smallTom').group.scale.x;
    interaction.dispose();
    return { samples, repeatPeak };
  });
  for (const sample of result.samples) {
    assert(sample.peak >= 1.075 && sample.peak <= 1.081, `${sample.id} should briefly expand about 8%`);
    assert.notEqual(sample.color, 0xf0e9dc, `${sample.id} head should brighten`);
    assert(sample.fixed, `${sample.id} collision transform must stay fixed`);
    assert(sample.othersStill, `${sample.id} must animate alone`);
    assert(sample.restored, `${sample.id} must return to its original appearance`);
  }
  assert(result.repeatPeak >= 1.075 && result.repeatPeak <= 1.081, 'rapid repeated hit should restart naturally');
  await page.goto(`${origin}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    const original = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) {
        window.vrScene = this;
        this.onAfterRender = renderer => { window.vrRenderer = renderer; };
      }
      return original.apply(this, args);
    };
    window.THREE = THREE;
  });
  await page.waitForFunction(() => window.vrRenderer);
  const inputs = await page.evaluate(async () => {
    const scene = window.vrScene;
    const visual = id => scene.getObjectByName(`${id}-visual`);
    const sample = async () => {
      let peak = 1;
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        peak = Math.max(peak, visual('smallTom').scale.x);
      }
      return peak;
    };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
    const keyboard = await sample();
    const camera = scene.getObjectByName('player-camera');
    const target = scene.getObjectByName('smallTom-head-hit-proxy');
    target.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    const projected = target.getWorldPosition(new window.THREE.Vector3()).project(camera);
    const canvas = window.vrRenderer.domElement;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: rect.left + (projected.x + 1) * rect.width / 2,
      clientY: rect.top + (1 - projected.y) * rect.height / 2,
      button: 0, buttons: 0, pointerId: 1, bubbles: true,
    }));
    const mouse = await sample();
    return { keyboard, mouse };
  });
  assert(inputs.keyboard > 1.04, 'F keyboard input should animate the high tom');
  assert(inputs.mouse > 1.04, 'Mouse hit on the high tom should animate it');
  console.log('PASS: three independent toms expand 8%, brighten and recover in 180ms; hit transforms stay fixed; repeated hit restarts');
  console.log('PASS: VR page keyboard and mouse hits trigger the same tom response');
} finally {
  await browser?.close();
  await vite.close();
}
