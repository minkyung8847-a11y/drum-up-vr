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
    const sounds = [];
    drumSynth.trigger = id => { sounds.push(id); };
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
    const snareSurface = kit.hitSurfaces.find(item => item.id === 'snare');
    snareSurface.mesh.updateWorldMatrix(true, false);
    const snareRest = snareSurface.mesh.matrixWorld.toArray();
    const snareVisual = kit.tomVisuals.get('snare');
    const snareColor = snareVisual.head.material.color.getHex();
    const snareHasShell = snareVisual.group.children.some(child => child.geometry?.type === 'CylinderGeometry'
      && child.geometry.parameters.openEnded);
    const stand = kit.layoutSupports.get('snare')[0];
    stand.updateWorldMatrix(true, false);
    const standRest = stand.matrixWorld.toArray();
    interaction.hit('snare'); interaction.update(0.035);
    snareSurface.mesh.updateWorldMatrix(true, false);
    stand.updateWorldMatrix(true, false);
    const snare = { scale: snareVisual.group.scale.x, shell: snareHasShell,
      color: snareVisual.head.material.color.getHex(),
      fixed: JSON.stringify(snareSurface.mesh.matrixWorld.toArray()) === JSON.stringify(snareRest),
      standFixed: JSON.stringify(stand.matrixWorld.toArray()) === JSON.stringify(standRest) };
    interaction.update(0.2);
    snare.restored = snareVisual.group.scale.x === 1 && snareVisual.head.material.color.getHex() === snareColor;
    const kickVisual = kit.tomVisuals.get('kick');
    const kickSurface = kit.hitSurfaces.find(item => item.id === 'kick');
    kickSurface.mesh.updateWorldMatrix(true, false);
    const kickRest = kickSurface.mesh.matrixWorld.toArray();
    const kickShellInVisual = kickVisual.group.children.some(child => child.geometry?.type === 'CylinderGeometry'
      && child.geometry.parameters.openEnded);
    const spurs = kit.layoutSupports.get('kick');
    spurs.forEach(item => item.updateWorldMatrix(true, false));
    const spurRest = spurs.map(item => item.matrixWorld.toArray());
    const pedal = kit.group.getObjectByName('kick-pedal');
    pedal.updateWorldMatrix(true, false);
    const pedalRest = pedal.matrixWorld.toArray();
    interaction.hit('kick'); interaction.update(0.035);
    kickSurface.mesh.updateWorldMatrix(true, false);
    spurs.forEach(item => item.updateWorldMatrix(true, false));
    pedal.updateWorldMatrix(true, false);
    const kick = { scale: kickVisual.group.scale.x, shell: kickShellInVisual,
      fixed: JSON.stringify(kickSurface.mesh.matrixWorld.toArray()) === JSON.stringify(kickRest),
      spursFixed: spurs.every((item, index) => JSON.stringify(item.matrixWorld.toArray()) === JSON.stringify(spurRest[index])),
      pedalFixed: JSON.stringify(pedal.matrixWorld.toArray()) === JSON.stringify(pedalRest),
      beaterMoves: kit.kickMechanism.beater.rotation.x !== 0 };
    interaction.update(0.2);
    kick.restored = kickVisual.group.scale.x === 1;
    const crashMesh = kit.hitSurfaces.find(item => item.id === 'crash').mesh;
    const rideMesh = kit.hitSurfaces.find(item => item.id === 'ride').mesh;
    const crashRest = crashMesh.rotation.clone(), rideRest = rideMesh.rotation.clone();
    interaction.hit('crash'); interaction.hit('ride'); interaction.update(0.045);
    const cymbals = { crashSwing: Math.abs(crashMesh.rotation.x - crashRest.x),
      rideSwing: Math.abs(rideMesh.rotation.x - rideRest.x),
      crashSideSwing: Math.abs(crashMesh.rotation.z - crashRest.z) };
    interaction.update(0.8);
    cymbals.restored = crashMesh.rotation.equals(crashRest) && rideMesh.rotation.equals(rideRest);
    const closedGap = kit.hiHatLower.position.y;
    interaction.hit('hihat');
    interaction.setHiHatClosed(false);
    const openGap = kit.hiHatLower.position.y;
    interaction.hit('hihat');
    interaction.setHiHatClosed(true);
    interaction.hit('hihat');
    interaction.update(0.8);
    const hiHat = { openGap, closedGap, reclosed: kit.hiHatLower.position.y === closedGap,
      sounds: sounds.slice(-3), closed: interaction.isHiHatClosed() };
    interaction.dispose();
    return { samples, repeatPeak, snare, kick, cymbals, hiHat };
  });
  for (const sample of result.samples) {
    assert(sample.peak >= 1.075 && sample.peak <= 1.081, `${sample.id} should briefly expand about 8%`);
    assert.notEqual(sample.color, 0xf0e9dc, `${sample.id} head should brighten`);
    assert(sample.fixed, `${sample.id} collision transform must stay fixed`);
    assert(sample.othersStill, `${sample.id} must animate alone`);
    assert(sample.restored, `${sample.id} must return to its original appearance`);
  }
  assert(result.repeatPeak >= 1.075 && result.repeatPeak <= 1.081, 'rapid repeated hit should restart naturally');
  assert(result.snare.scale >= 1.075 && result.snare.scale <= 1.081, 'Whole snare should expand like the toms');
  assert(result.snare.shell, 'Snare shell must be part of the animated group');
  assert.notEqual(result.snare.color, 0xf0e9dc, 'Snare head should brighten');
  assert(result.snare.fixed && result.snare.standFixed && result.snare.restored,
    'Snare collision and stand stay fixed while the whole drum recovers');
  assert(result.kick.scale >= 1.075 && result.kick.scale <= 1.081, 'Whole kick should expand like the toms');
  assert(result.kick.shell && result.kick.fixed && result.kick.spursFixed && result.kick.pedalFixed,
    'Kick shell animates while hit detection, spurs and pedal placement remain fixed');
  assert(result.kick.beaterMoves && result.kick.restored, 'Kick beater moves and the drum recovers');
  assert(result.cymbals.crashSwing > result.cymbals.rideSwing * 3,
    'Left crash should swing noticeably more than the unchanged ride');
  assert(result.cymbals.crashSideSwing > 0.02 && result.cymbals.restored,
    'Crash should sway sideways and return to rest');
  assert(result.hiHat.openGap < result.hiHat.closedGap && result.hiHat.reclosed && result.hiHat.closed,
    'Left pedal opens hi-hat on release and closes it while pressed');
  assert.deepEqual(result.hiHat.sounds, ['hihat-closed', 'hihat-open', 'hihat-closed'],
    'Stick hits follow the held pedal state');
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
  console.log('PASS: entire snare expands 8% and recovers like the toms; its strike plane and stand stay fixed');
  console.log('PASS: entire kick expands 8% and recovers like the toms; hit plane, spurs and pedal stay fixed');
  console.log('PASS: left crash swings more than the ride, sways sideways and returns to rest');
  console.log('PASS: left pedal holds hi-hat closed, release opens it, and stick sounds follow pedal state');
  console.log('PASS: VR page keyboard and mouse hits trigger the same tom response');
} finally {
  await browser?.close();
  await vite.close();
}
