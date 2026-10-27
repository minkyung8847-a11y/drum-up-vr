import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = vite.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await page.goto(`${origin}#/vr`);
  await page.getByRole('complementary', { name: 'AR mode selection' }).getByRole('button', { name: 'AR 패스스루 시작 →' }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url);
    window.THREE = THREE;
    const original = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) {
        window.vrScene = this;
        this.onAfterRender = renderer => { window.vrRenderer = renderer; };
      }
      return original.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    window.hits = [];
    const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (id, velocity) => { window.hits.push({ id, velocity }); return trigger(id, velocity); };
  });
  await page.getByRole('button', { name: 'Enter VR' }).click();
  await page.waitForFunction(() => window.vrRenderer?.xr.isPresenting);
  const panelVisible = await page.evaluate(() => window.vrScene.getObjectByName('ar-mode-window')?.visible);
  assert.equal(panelVisible, true, 'AR window should appear inside headset view');
  const before = await page.evaluate(() => {
    const session = window.testXR;
    window.vrSession = session;
    const kit = window.vrScene.getObjectByName('kick-pedal').parent;
    const snapshot = { kitId: kit.id, position: kit.position.toArray(), meshes: [] };
    kit.traverse(object => { if (object.isMesh) snapshot.meshes.push(object.id); });
    const source = session.connect('right');
    session.step(3);
    const T = window.THREE;
    const panel = window.vrScene.getObjectByName('ar-mode-window');
    const rig = window.vrScene.getObjectByName('player-rig');
    panel.updateWorldMatrix(true, false);
    const origin = panel.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0, .5));
    rig.worldToLocal(origin);
    source.gripSpace.position = origin.toArray();
    source.gripSpace.quaternion = [0, 0, 0, 1];
    session.step(3);
    const handCursor = window.vrScene.getObjectByName('ar-hand-cursor');
    if (handCursor?.visible) throw Error('Hand cursor should start hidden');
    source.gamepad.buttons[4].pressed = true;
    session.step(1);
    source.gamepad.buttons[4].pressed = false;
    session.step(1);
    if (!window.vrScene.getObjectByName('ar-hand-cursor')?.visible || !window.vrScene.getObjectByName('ar-hand-ray')?.visible)
      throw Error(`A button should show the hand cursor and ray: ${JSON.stringify({
        cursor: window.vrScene.getObjectByName('ar-hand-cursor')?.visible, ray: window.vrScene.getObjectByName('ar-hand-ray')?.visible,
        buttons: source.gamepad.buttons.map(button => button.pressed),
        controllers: rig.children.filter(child => child.type === 'Group').map(child => ({ name: child.name, children: child.children.map(c => c.name) })),
      })}`);
    if (window.vrScene.getObjectByName('right-stick-grip')?.visible)
      throw Error('Right drumstick should hide while the hand cursor is active');
    session.emit('select', { inputSource: source, frame: session.frame() });
    return snapshot;
  });
  await page.waitForFunction(() => window.testXR !== window.vrSession && window.vrRenderer?.xr.isPresenting);
  const ar = await page.evaluate(() => {
    const scene = window.vrScene;
    const kit = scene.getObjectByName('kick-pedal').parent;
    const meshes = []; kit.traverse(object => { if (object.isMesh) meshes.push(object.id); });
    const session = window.testXR;
    const source = session.connect('right'); session.step(3);
    const T = window.THREE;
    const rig = scene.getObjectByName('player-rig');
    const group = kit.children.find(object => object.userData.drumType === 'snare');
    const mesh = group.children.find(object => object.isMesh && object.userData.drumType === 'snare' && object.position.y > 0);
    mesh.updateWorldMatrix(true, false);
    const target = mesh.getWorldPosition(new T.Vector3());
    const normal = new T.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
    target.addScaledVector(normal, .12);
    const offset = new T.Vector3(0, 0, -.31).applyAxisAngle(new T.Vector3(1, 0, 0), 12 * Math.PI / 180);
    rig.worldToLocal(target); target.sub(offset);
    source.gripSpace.position = target.toArray();
    source.gripSpace.quaternion = [0, 0, 0, 1]; session.step(6);
    source.gripSpace.quaternion = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -.05).toArray();
    session.step(10);
    return { mode: session.mode, kitId: kit.id, position: kit.position.toArray(), meshes,
      background: scene.background, environments: ['concert-stage-environment', 'cloud-concert-environment', 'dark-studio-environment']
        .map(name => scene.getObjectByName(name)?.visible), hits: window.hits.map(hit => hit.id) };
  });
  assert.equal(ar.mode, 'immersive-ar');
  assert.equal(ar.kitId, before.kitId);
  assert.deepEqual(ar.position, before.position);
  assert.deepEqual(ar.meshes, before.meshes);
  assert.equal(ar.background, null);
  assert(ar.environments.every(visible => visible !== true), 'Virtual backgrounds must be hidden');
  assert(ar.hits.includes('snare'), 'AR must use the VR stick collision and sound path');
  assert.deepEqual(errors, []);
  console.log('VR-to-AR passthrough preserves the same kit and stick hits');
} finally {
  await browser?.close();
  await vite.close();
}
