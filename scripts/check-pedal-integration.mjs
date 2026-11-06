import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createRelay } from '../server/relay.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

// Self-contained loopback test: two independent browser contexts, real relay,
// actual VR scene + existing Web Audio buffers. No headset/hardware claims.
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const relay = createRelay({ origins: [origin] });
await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
const endpoint = `ws://127.0.0.1:${relay.server.address().port}/pedal`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const vrContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const laptopContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const vr = await vrContext.newPage(), laptop = await laptopContext.newPage();
  for (const page of [vr, laptop]) page.setDefaultTimeout(20_000);
  for (const page of [vr, laptop]) page.on('pageerror', error => errors.push(error.message));
  await vr.goto(`${origin}/#/vr`); await vr.locator('canvas').waitFor();
  await vr.getByRole('status').filter({ hasText: 'Click to play' }).waitFor({ timeout: 30_000 });
  await vr.getByRole('button', { name: 'VR pedals', exact: true }).click();
  await vr.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await vr.getByRole('button', { name: '새 연결 코드' }).click();
  await vr.getByTestId('pairing-code').waitFor();
  const code = await vr.getByTestId('pairing-code').textContent();
  await laptop.goto(`${origin}/#/pedal`);
  await laptop.getByLabel('릴레이 서버 주소', { exact: true }).fill(endpoint);
  await laptop.getByLabel('VR 연결 코드').fill(code);
  await laptop.getByRole('button', { name: 'VR에 연결', exact: true }).click();
  await laptop.getByTestId('pedal-connection').filter({ hasText: '연결됨' }).waitFor();
  await vr.getByRole('button', { name: '소리 활성화', exact: true }).click();
  await vr.getByText('소리 준비 완료', { exact: true }).waitFor();
  console.log('Paired independent browser contexts; audio unlocked');
  await vr.evaluate(async () => {
    const { drumSynth } = await import('/src/utils/synth.ts'); window.synth = drumSynth;
    window.kickCalls = []; window.kickAudio = []; window.mechanismMoved = false;
    const trigger = drumSynth.trigger.bind(drumSynth);
    drumSynth.trigger = (id, velocity) => { window.kickCalls.push({ id, velocity, time: performance.now() }); return trigger(id, velocity); };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args), start = source.start.bind(source);
      source.start = (...params) => {
        window.kickAudio.push({ correct: source.buffer === drumSynth.kitBuffers.get(drumSynth.getCurrentKitId()).get(36),
          delay: performance.now() - window.kickCalls.at(-1).time }); return start(...params);
      }; return source;
    };
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const THREE = await import(url), update = THREE.Scene.prototype.updateMatrixWorld;
    THREE.Scene.prototype.updateMatrixWorld = function (...args) {
      window.scene = this;
      const beater = this.getObjectByName('kick-beater');
      if (beater && Math.abs(beater.rotation.x) > .001) window.mechanismMoved = true;
      return update.apply(this, args);
    };
    window.snapshot = () => {
      const values = [];
      const record = object => values.push([object.id, ...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]);
      window.scene.getObjectByName('kick-pedal').parent.traverse(record);
      record(window.scene.getObjectByName('player-rig')); record(window.scene.getObjectByName('player-camera'));
      return values;
    };
  });
  await vr.waitForFunction(() => window.scene);
  const original = await vr.evaluate(() => window.snapshot());
  await laptop.getByRole('button', { name: 'TEST KICK', exact: true }).click();
  await vr.waitForFunction(() => window.kickCalls.length === 1);
  await laptop.getByTestId('played-count').filter({ hasText: /^1$/ }).waitFor();
  console.log('First remote kick played through existing audio');
  // Space while TEST has focus must not synthesize both key input and click.
  await laptop.keyboard.down('Space'); await laptop.keyboard.down('Space');
  await laptop.waitForTimeout(150); await laptop.keyboard.up('Space');
  await vr.waitForFunction(() => window.kickCalls.length === 2);
  await laptop.waitForTimeout(100); assert.equal(await vr.evaluate(() => window.kickCalls.length), 2);
  // Typing a space into a settings input must never play.
  await laptop.getByLabel('VR 연결 코드').focus(); await laptop.keyboard.press('Space');
  await laptop.waitForTimeout(70); assert.equal(await vr.evaluate(() => window.kickCalls.length), 2);
  await laptop.getByRole('button', { name: 'TEST KICK', exact: true }).focus();
  for (let i = 0; i < 10; i++) { await laptop.keyboard.press('Space'); await laptop.waitForTimeout(35); }
  await vr.waitForFunction(() => window.kickCalls.length === 12);
  await laptop.getByTestId('played-count').filter({ hasText: /^12$/ }).waitFor();
  await vr.waitForTimeout(350);
  assert.deepEqual(await vr.evaluate(() => window.snapshot()), original, 'All resting transforms unchanged after remote kicks');
  const sound = await vr.evaluate(() => ({ hits: window.kickCalls, audio: window.kickAudio, motion: window.mechanismMoved }));
  assert(sound.hits.every(hit => hit.id === 'kick')); assert.equal(sound.audio.length, 12);
  assert(sound.audio.every(voice => voice.correct && voice.delay < 30)); assert(sound.motion);
  console.log('Space repeat/focus/roll and mechanism-rest checks passed');

  // Audio suspended: no delayed/buffered kick is allowed to emerge after resume.
  await vr.evaluate(() => window.synth.ctx.suspend());
  await laptop.keyboard.press('Space'); await laptop.waitForTimeout(120);
  assert.equal(await vr.evaluate(() => window.kickCalls.length), 12);
  await vr.getByRole('button', { name: '소리 활성화', exact: true }).click();
  await vr.waitForTimeout(100); assert.equal(await vr.evaluate(() => window.kickCalls.length), 12);

  // Force transport loss on both ends; queued keys during interruption are lost.
  for (const ws of relay.wss.clients) ws.terminate();
  await laptop.getByTestId('pedal-connection').filter({ hasText: '재연결 중' }).waitFor();
  await laptop.keyboard.press('Space');
  await laptop.getByTestId('pedal-connection').filter({ hasText: '연결됨' }).waitFor({ timeout: 15_000 });
  await laptop.waitForTimeout(100); assert.equal(await vr.evaluate(() => window.kickCalls.length), 12);
  await laptop.keyboard.press('Space'); await vr.waitForFunction(() => window.kickCalls.length === 13);
  console.log('Audio lock and transport recovery checks passed');

  // Input adapters and controller button routing without pretending hardware exists.
  const adapters = await laptop.evaluate(async () => {
    const { midiKick, createHIDEdge } = await import('/src/pedal/inputs.ts');
    const { validateRelayURL } = await import('/src/pedal/PedalConnection.ts');
    const { attachXRKickInput } = await import('/src/pedal/xrKickInput.ts');
    const { createKickTrigger } = await import('/src/pedal/kickTrigger.ts');
    const hits = []; let ready = false;
    const trigger = createKickTrigger(() => ready, (id, velocity) => { hits.push([id, velocity]); return true; });
    const blocked = trigger(1); ready = true; trigger(.5); const invalid = trigger(NaN);
    const midi = [midiKick([0x99, 36, 64], [35, 36], 9), midiKick([0x89, 36, 64], [36], null),
      midiKick([0x99, 36, 0], [36], null), midiKick([0x98, 36, 64], [36], 9), midiKick([0x99, 38, 64], [36], null)];
    let hidCount = 0, hidTime = 0;
    const edge = createHIDEdge({ reportId: 1, byte: 0, mask: 1, pressed: 1 }, () => hidCount++, () => hidTime);
    for (const value of [1, 1, 0, 1, 1, 1, 0, 1]) { hidTime += 30; edge(1, new DataView(Uint8Array.of(value).buffer)); }
    hidTime += 2; edge(1, new DataView(Uint8Array.of(0).buffer)); edge(1, new DataView(Uint8Array.of(1).buffer));
    edge(2, new DataView(Uint8Array.of(0).buffer)); edge(1, new DataView(new ArrayBuffer(0)));
    const session = new EventTarget(); session.visibilityState = 'visible'; let enabled = false; const hands = [];
    const cleanup = attachXRKickInput(session, () => enabled, trigger, hand => hands.push(hand));
    const press = handedness => { const e = new Event('squeezestart'); e.inputSource = { handedness, gripSpace: {}, targetRayMode: 'tracked-pointer' }; session.dispatchEvent(e); };
    press('left'); enabled = true; press('left'); press('right'); press('none');
    session.visibilityState = 'hidden'; press('left'); session.visibilityState = 'visible'; cleanup(); press('left');
    const rejected = [];
    for (const url of ['ws://relay.example.com/pedal', 'ws://localhost:8787/pedal', 'wss://u:p@example.com/pedal', 'wss://example.com/pedal?secret=x']) {
      try { validateRelayURL(url, 'https:'); rejected.push(false); } catch { rejected.push(true); }
    }
    return { blocked, invalid, midi, hidCount, hands, hits, rejected };
  });
  assert.equal(adapters.blocked, false); assert.equal(adapters.invalid, false);
  assert.deepEqual(adapters.midi, [64 / 127, null, null, null, null]); assert.equal(adapters.hidCount, 2);
  assert.deepEqual(adapters.hands, ['left', 'right']); assert.equal(adapters.hits.length, 3); assert(adapters.rejected.every(Boolean));

  // Real React MIDI selection/listeners with a mock browser permission/device API.
  await laptop.evaluate(() => {
    const input = new EventTarget(); Object.assign(input, { id: 'test-midi', name: 'Mock MIDI pedal', state: 'connected',
      open: async () => input, close: async () => input });
    const access = new EventTarget(); access.inputs = new Map([[input.id, input]]);
    navigator.requestMIDIAccess = async () => access;
    window.emitMidi = data => { const event = new Event('midimessage'); event.data = Uint8Array.from(data); input.dispatchEvent(event); };
    window.mockMidi = { input, access };
  });
  await laptop.getByLabel('물리 페달 입력').selectOption('midi');
  await laptop.getByRole('button', { name: 'MIDI 장치 연결' }).click();
  await laptop.waitForFunction(() => document.querySelector('[aria-label="MIDI 입력"]').value === 'test-midi');
  await laptop.evaluate(() => { window.emitMidi([0x99, 36, 64]); window.emitMidi([0x89, 36, 0]); window.emitMidi([0x99, 38, 100]); });
  await vr.waitForFunction(() => window.kickCalls.length === 14);
  assert.equal(await vr.evaluate(() => window.kickCalls.at(-1).velocity), 64 / 127);
  await laptop.getByRole('button', { name: '킥 노트 학습' }).click();
  await laptop.evaluate(() => window.emitMidi([0x92, 40, 80]));
  await laptop.getByLabel('킥 노트', { exact: true }).waitFor();
  await laptop.waitForFunction(() => document.querySelector('[aria-label="킥 노트"]').value === '40');
  assert.equal(await vr.evaluate(() => window.kickCalls.length), 14);
  await laptop.evaluate(() => window.emitMidi([0x92, 40, 80]));
  await vr.waitForFunction(() => window.kickCalls.length === 15);
  await laptop.evaluate(() => { window.mockMidi.input.state = 'disconnected'; window.mockMidi.access.dispatchEvent(new Event('statechange')); });
  await laptop.getByRole('alert').filter({ hasText: '분리' }).waitFor();
  await laptop.evaluate(() => window.emitMidi([0x92, 40, 80])); await laptop.waitForTimeout(100);
  assert.equal(await vr.evaluate(() => window.kickCalls.length), 15);

  // Exercise the actual HID UI, user permission and cleanup with a mock device.
  await laptop.evaluate(() => {
    const device = new EventTarget(); Object.assign(device, { productName: 'Mock USB HID pedal', opened: false,
      open: async () => { device.opened = true; }, close: async () => { device.opened = false; } });
    const hid = new EventTarget(); hid.requestDevice = async () => [device];
    Object.defineProperty(navigator, 'hid', { configurable: true, value: hid });
    window.mockHid = device;
    window.emitHid = value => { const event = new Event('inputreport'); Object.assign(event, { device, reportId: 0, data: new DataView(Uint8Array.of(value).buffer) }); device.dispatchEvent(event); };
  });
  await laptop.getByLabel('물리 페달 입력').selectOption('hid');
  await laptop.getByLabel('Vendor ID', { exact: true }).fill('0x1234');
  await laptop.getByLabel('Product ID', { exact: true }).fill('0x0001');
  await laptop.getByRole('button', { name: 'HID 장치 연결' }).click();
  await laptop.getByRole('button', { name: 'HID 해제' }).waitFor();
  await laptop.evaluate(() => { window.emitHid(1); window.emitHid(1); window.emitHid(0); window.emitHid(1); window.emitHid(1); });
  await vr.waitForFunction(() => window.kickCalls.length === 16);
  await laptop.getByRole('button', { name: 'HID 해제' }).click();
  await laptop.evaluate(() => { window.emitHid(0); window.emitHid(1); }); await laptop.waitForTimeout(80);
  assert.equal(await vr.evaluate(() => window.kickCalls.length), 16);
  assert.equal(await laptop.evaluate(() => window.mockHid.opened), false);
  await laptop.getByLabel('물리 페달 입력').selectOption('keyboard');

  // Receiver itself rejects duplicate/stale packets even if an intermediary
  // accidentally sends them again. These are test injections, not auto-play.
  const receiver = [...relay.wss.clients].find(ws => ws.role === 'vr');
  const lastSequence = receiver.room.seq;
  receiver.send(JSON.stringify({ type: 'kick', seq: lastSequence, velocity: 1, sentAt: Date.now() }));
  receiver.send(JSON.stringify({ type: 'kick', seq: lastSequence + 1, velocity: 1, sentAt: Date.now() - 1000 }));
  receiver.send(JSON.stringify({ type: 'kick', seq: lastSequence + 2, velocity: 1, sentAt: Date.now() + 2000 }));
  await vr.waitForTimeout(300);
  assert.equal(await vr.evaluate(() => window.kickCalls.length), 16);
  assert.deepEqual(await vr.evaluate(() => window.snapshot()), original);
  assert.equal(await vr.getByRole('button', { name: 'Pause demo', exact: true }).count(), 0);
  const hiHatGap = () => vr.evaluate(() => {
    const kit = window.scene.children.find(child => child.children.some(part => part.userData.drumType === 'hihat'));
    const hiHat = kit.children.find(child => child.userData.drumType === 'hihat');
    return hiHat.children.find(child => child.isMesh && child.geometry.type === 'LatheGeometry' && child.rotation.x > 3).position.y;
  });
  const openGap = await hiHatGap();
  await laptop.getByRole('button', { name: '왼쪽 밟기 · 닫힘' }).click();
  await vr.waitForFunction(() => {
    const kit = window.scene.children.find(child => child.children.some(part => part.userData.drumType === 'hihat'));
    const hiHat = kit.children.find(child => child.userData.drumType === 'hihat');
    return hiHat.children.some(child => child.isMesh && child.geometry.type === 'LatheGeometry'
      && child.rotation.x > 3 && child.position.y > -0.04);
  });
  assert.equal(await laptop.getByTestId('hihat-state').textContent(), '닫힘');
  await laptop.getByRole('button', { name: '왼쪽 떼기 · 열림' }).click();
  await vr.waitForFunction(expected => {
    const kit = window.scene.children.find(child => child.children.some(part => part.userData.drumType === 'hihat'));
    const hiHat = kit.children.find(child => child.userData.drumType === 'hihat');
    const lower = hiHat.children.find(child => child.isMesh && child.geometry.type === 'LatheGeometry' && child.rotation.x > 3);
    return Math.abs(lower.position.y - expected) < 1e-6;
  }, openGap);
  assert.equal(await laptop.getByTestId('hihat-state').textContent(), '열림');
  await laptop.keyboard.down('z');
  await laptop.getByTestId('hihat-state').filter({ hasText: '닫힘' }).waitFor();
  await laptop.keyboard.up('z');
  await laptop.getByTestId('hihat-state').filter({ hasText: '열림' }).waitFor();
  const adaptersHiHat = await laptop.evaluate(async () => {
    const { midiHiHat, createHIDState } = await import('/src/pedal/inputs.ts');
    const changes = [], read = createHIDState({ reportId: 0, byte: 0, mask: 2, pressed: 2 }, value => changes.push(value));
    for (const value of [0, 2, 2, 0]) read(0, new DataView(Uint8Array.of(value).buffer));
    return { midiClosed: midiHiHat([0xb0, 4, 0], 4, 64, true, null),
      midiOpen: midiHiHat([0xb0, 4, 127], 4, 64, true, null),
      hidChanges: changes };
  });
  assert.deepEqual(adaptersHiHat, { midiClosed: true, midiOpen: false, hidChanges: [false, true, false] });
  console.log('Left pedal press/release reached the VR hi-hat model through the real relay');
  const directory = process.env.VR_ARTIFACT_DIR;
  if (directory) {
    await fs.mkdir(directory, { recursive: true });
    await laptop.screenshot({ path: path.join(directory, 'pedal-controller.png'), fullPage: true });
    await vr.screenshot({ path: path.join(directory, 'vr-pedal-pairing.png') });
    await laptop.setViewportSize({ width: 390, height: 844 });
    assert(await laptop.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await laptop.screenshot({ path: path.join(directory, 'pedal-controller-mobile.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pairedContexts: 2, actualKickVoices: 16, correctExistingSample: true,
    repeatedSpaceSuppressed: true, reconnectNoReplay: true, lockedAudioDropped: true,
    restingTransformsUnchanged: true, simulatedMIDI: true, simulatedHID: true, simulatedXRHands: adapters.hands,
    headsetTested: false, physicalPedalTested: false, errors }, null, 2));
} finally { await browser?.close(); await relay.close(); await vite.close(); }
