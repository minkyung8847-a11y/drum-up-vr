import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';
import { installUnifiedPanelControls } from './helpers/unified-panel-controls.mjs';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  await page.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await page.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url); window.T = T;
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-unified-panel')) window.scene = this;
      return update.apply(this, args);
    };
    const { drumSynth } = await import('/src/utils/synth.ts');
    const trigger = drumSynth.trigger.bind(drumSynth); window.hits = [];
    drumSynth.trigger = (...args) => { window.hits.push(args[0]); return trigger(...args); };
  });
  await page.waitForFunction(() => window.scene);
  assert(await page.evaluate(() => !window.scene.getObjectByName('vr-unified-panel').visible), 'No desktop UI change');
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const initial = await page.evaluate(() => {
    const T = window.T, scene = window.scene, session = window.testXR;
    const panel = scene.getObjectByName('vr-unified-panel');
    session.step(3);
    let draws = 0; panel.onBeforeRender = () => draws++; session.step(); panel.onBeforeRender = () => {};
    const z = panel.geometry.getAttribute('position').array.filter((_, index) => index % 3 === 2);
    const matrix = panel.matrixWorld.clone(), head = structuredClone(session.head);
    session.head.position[0] += .2; session.head.quaternion = [0, Math.sin(.4), 0, Math.cos(.4)]; session.step(2);
    const fixed = panel.matrixWorld.equals(matrix); Object.assign(session.head, head); session.step();
    const canvas = panel.material.map.image, ctx = canvas.getContext('2d');
    const opaque = ctx.getImageData(750, 700, 1, 1).data[3] === 255;
    const clearGap = ctx.getImageData(15, 150, 1, 1).data[3] === 0;
    const eye = new T.Vector3(0, session.head.position[1] + .08, 1);
    const ray = new T.Raycaster(), positions = scene.getObjectByName('vr-note-lanes').geometry.getAttribute('position');
    let overlaps = 0;
    for (let lane = 0; lane < 8; lane++) {
      const target = new T.Vector3().fromBufferAttribute(positions, lane * 2);
      const far = new T.Vector3().fromBufferAttribute(positions, lane * 2 + 1);
      for (let index = 0; index <= 20; index++) {
        const point = target.clone().lerp(far, index / 20);
        ray.set(eye, point.sub(eye).normalize());
        const hit = ray.intersectObject(panel)[0];
        if (hit?.uv && ctx.getImageData(Math.floor(hit.uv.x * canvas.width), Math.floor((1 - hit.uv.y) * canvas.height), 1, 1).data[3] > 128) overlaps++;
      }
    }
    return { draws, fixed, curved: Math.max(...z) - Math.min(...z) > .03, worldParent: panel.parent === scene,
      leftAbove: panel.position.x < -.8 && panel.position.y > 2, opaque, clearGap, overlaps,
      image: canvas.toDataURL('image/png') };
  });
  const preview = process.env.VR_PANEL_PREVIEW || join(tmpdir(), 'drum-up-unified-panel.png');
  await writeFile(preview, Buffer.from(initial.image.split(',')[1], 'base64'));
  delete initial.image;
  assert.deepEqual(initial, { draws: 2, fixed: true, curved: true, worldParent: true, leftAbove: true, opaque: true, clearGap: true, overlaps: 0 });
  console.log(`PREVIEW: ${preview}`);
  await page.evaluate(installUnifiedPanelControls);
  const checks = await page.evaluate(async () => {
    const T = window.T, session = window.testXR, scene = window.scene;
    const get = name => scene.getObjectByName(name), panel = get('vr-unified-panel'), state = panel.userData.panelState;
    const rig = get('player-rig'), kit = get('vr-drum-kit'), kitMatrix = kit.matrixWorld.clone();
    const { unifiedPanelPoint } = await import('/src/components/vrUnifiedPanel.ts');
    const { drumSynth } = await import('/src/utils/synth.ts');
    const inputs = ['left', 'right'].map(hand => session.connect(hand));
    for (const input of inputs) { input.gamepad.axes = [0, 0, 0, 0]; input.targetRaySpace = { ...input.gripSpace }; }
    session.step(3);
    function aim(x, y, input = inputs[1]) {
      const target = panel.localToWorld(unifiedPanelPoint(x, y, new T.Vector3()));
      const origin = new T.Vector3(input.handedness === 'left' ? -.24 : .24, 1.15, .86);
      input.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
      input.targetRaySpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), target.sub(origin).normalize()).toArray();
      session.step(3);
    }
    function click(x, y, input = inputs[1], mixed = false) {
      aim(x, y, input); input.gamepad.buttons[0].pressed = true; input.gamepad.buttons[0].value = 1; session.step(2);
      if (mixed) session.emit('selectstart', { inputSource: input, frame: session.frame() });
      input.gamepad.buttons[0].pressed = false; input.gamepad.buttons[0].value = 0; session.step(2);
      if (mixed) { session.emit('selectend', { inputSource: input, frame: session.frame() }); session.emit('select', { inputSource: input, frame: session.frame() }); }
      session.step(3);
    }
    const hitsBefore = window.hits.length;
    click(204, 338); const all = state.genre === 'All';
    click(308, 338); const pop = state.genre === 'Pop';
    click(350, 510); const selectedPop = state.song === 3;
    click(130, 338); aim(400, 650);
    inputs[1].gamepad.axes[3] = 1; session.step(50); inputs[1].gamepad.axes[3] = 0;
    const stickScroll = state.scroll === 160;
    click(340, 818); const lastSong = state.song === 7;
    // Drag upward to scroll, using the left controller's front Trigger.
    click(432, 106); const practiceTab = state.tab === 'PRACTICE';
    click(700, 450); const rudiment = state.practice === 'RUDIMENT';
    click(200, 106); aim(400, 600, inputs[0]);
    inputs[0].gamepad.buttons[0].pressed = true; inputs[0].gamepad.buttons[0].value = 1; session.step();
    aim(400, 740, inputs[0]); inputs[0].gamepad.buttons[0].pressed = false; inputs[0].gamepad.buttons[0].value = 0; session.step();
    const dragScroll = state.scroll < 40 && state.song === 7;
    click(656, 106); click(180, 480);
    const concert = state.background === 'concert' && get('concert-stage-environment').visible;
    click(490, 480);
    const cloud = state.background === 'cloud' && get('cloud-concert-environment').visible;
    click(800, 480);
    const background = concert && cloud && state.background === 'studio' && get('dark-studio-environment').visible;
    click(880, 106); const settings = state.tab === 'SETTINGS';
    click(160, 430); const beforeVolume = drumSynth.getVolume(); click(124, 646, inputs[1], true);
    const audio = Math.abs(drumSynth.getVolume() - (beforeVolume - .05)) < 1e-8;
    click(900, 646); click(394, 430); const controllerCard = state.setting === 'CONTROLLER';
    click(630, 430); const noteCard = state.setting === 'NOTE'; click(866, 430); const generalCard = state.setting === 'GENERAL';
    const noPlayback = get('note-highway-anchor').children.filter(mesh => mesh.name.startsWith('note-')).every(mesh => !mesh.visible);
    const quietUI = window.hits.length === hitsBefore && session.pulses.length === 0;
    // Grip retains its normal functions while using the new panel.
    session.squeeze(inputs[1]); const grip = window.hits.at(-1) === 'kick' && session.pulses.at(-1).hand === 'right';
    const beforeLeft = window.hits.length; session.squeeze(inputs[0]); const leftGripQuiet = window.hits.length === beforeLeft;
    window.panelStart(inputs[1]);
    const chart = get('note-highway-anchor'), kick = get('note-kick-3000'), beforeSongTab = kick.position.clone();
    window.panelClick(inputs[1], 200, 106); window.panelClick(inputs[1], 350, 430); window.panelStep(6);
    const chartContinues = kick.visible && !kick.position.equals(beforeSongTab) && get('note-highway-anchor') === chart;
    const pose = panel.matrixWorld.clone();
    window.panelMode(inputs[1], 'ar');
    const ar = scene.background === null && panel.visible && panel.matrixWorld.equals(pose) && state.tab === 'BACKGROUND';
    return { all, pop, selectedPop, stickScroll, lastSong, practiceTab, rudiment, dragScroll, background, settings, audio,
      controllerCard, noteCard, generalCard, noPlayback, quietUI, grip, leftGripQuiet, chartContinues, ar,
      kitUnchanged: kit.matrixWorld.equals(kitMatrix), removedModesStayRemoved: !get('vr-stick-mode-window') && !get('vr-drum-position-settings') };
  });
  for (const [key, value] of Object.entries(checks)) assert(value, key);
  const vrOnly = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  vrOnly.on('pageerror', error => errors.push(error.message));
  await vrOnly.addInitScript(installMockWebXR, { mode: 'immersive-vr' });
  await vrOnly.goto(`${vite.resolvedUrls.local[0]}#/vr`);
  await vrOnly.getByRole('status').filter({ hasText: 'Click to play' }).waitFor();
  await vrOnly.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url); window.T = T;
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('vr-unified-panel')) window.scene = this;
      return update.apply(this, args);
    };
  });
  await vrOnly.waitForFunction(() => window.scene);
  await vrOnly.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await vrOnly.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const opaqueVR = await vrOnly.evaluate(async () => {
    const T = window.T, scene = window.scene, session = window.testXR;
    const input = session.connect('right'); session.step(3);
    const panel = scene.getObjectByName('vr-unified-panel'), rig = scene.getObjectByName('player-rig');
    const { unifiedPanelPoint } = await import('/src/components/vrUnifiedPanel.ts');
    const target = panel.localToWorld(unifiedPanelPoint(432, 106, new T.Vector3()));
    const origin = new T.Vector3(.24, 1.15, .86);
    input.targetRaySpace.position = rig.worldToLocal(origin.clone()).toArray();
    input.targetRaySpace.quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), target.sub(origin).normalize()).toArray();
    session.step(2); input.gamepad.buttons[0].pressed = true; session.step();
    input.gamepad.buttons[0].pressed = false; session.step(3);
    return session.mode === 'immersive-vr' && panel.visible && panel.userData.panelState.tab === 'PRACTICE';
  });
  assert(opaqueVR, 'Raw Trigger selection also works in immersive-vr without AR support');
  assert.deepEqual(errors, []);
  console.log('PASS: curved world-fixed stereo UI, no lane overlap, 4 tabs, genres/song selection, thumbstick/Trigger scrolling, background/audio bindings, Grip/haptics and no song playback. Physical Quest 3 NOT tested.');
} finally { await browser?.close(); await vite.close(); }
