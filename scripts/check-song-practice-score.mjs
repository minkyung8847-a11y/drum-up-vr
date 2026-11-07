import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installMockWebXR } from './helpers/mock-webxr.mjs';

const chunks = [];
const variable = n => n < 128 ? [n] : [0x80 | (n >> 7), n & 127];
const write = (delta, ...bytes) => chunks.push(...variable(delta), ...bytes);
write(0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20); // 120 BPM
write(0, 0xff, 0x58, 4, 4, 2, 24, 8);
for (let eighth = 0; eighth < 8; eighth++) {
  write(eighth ? 240 : 0, 0x99, 42, 85);
  if (eighth % 2 === 0) write(0, eighth % 4 === 0 ? 36 : 38, 110); // Running status.
}
write(0, 0x90, 38, 127); // Melodic channel must not create a drum note.
write(240, 0xff, 0x51, 3, 0x0f, 0x42, 0x40); // 60 BPM at beat 4.
write(480, 0x99, 38, 100);
write(480, 0xff, 0x2f, 0);
const size = Buffer.alloc(4);
size.writeUInt32BE(chunks.length);
const midi = Buffer.concat([Buffer.from('MThd'),
  Buffer.from('000000060000000101e0', 'hex'), Buffer.from('MTrk'), size, Buffer.from(chunks)]);

const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.addInitScript(installMockWebXR, { mode: 'switchable' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const results = await page.evaluate(async bytes => {
    const { parseDrumMidi, parseDrumMusicXML } = await import('/src/components/songScoreParser.ts');
    const { PAD_TO_INSTRUMENT, parseDrumMapping } = await import('/src/components/songDrumMapping.ts');
    const { createSongScorer } = await import('/src/components/songPlayback.ts');
    const { getNoteProgress } = await import('/src/components/songPracticeTiming.ts');
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const { createVRNoteLanes, createVRNoteHighway, captureRhythmSurfaces } = await import('/src/components/vrNoteHighway.ts');
    const threeUrl = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(threeUrl);
    const midi = parseDrumMidi(new Uint8Array(bytes).buffer);
    const override = parseDrumMidi(new Uint8Array(bytes).buffer, parseDrumMapping('{"42":"ride"}'));
    const xml = parseDrumMusicXML(`
      <score-partwise><part-list><score-part id="P"><part-name>Kit</part-name>
        <midi-instrument id="H"><midi-unpitched>43</midi-unpitched></midi-instrument>
        <midi-instrument id="K"><midi-unpitched>37</midi-unpitched></midi-instrument>
        <midi-instrument id="S"><midi-unpitched>39</midi-unpitched></midi-instrument>
      </score-part></part-list><part id="P"><measure number="1">
        <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <direction><sound tempo="120"/></direction>
        <note dynamics="90"><unpitched/><instrument id="H"/><duration>1</duration></note>
        <note><chord/><unpitched/><instrument id="K"/><duration>1</duration></note>
        <forward><duration>1</duration></forward>
        <note><unpitched/><instrument id="S"/><duration>2</duration></note>
      </measure><measure number="2">
        <direction><sound tempo="60"/></direction><forward><duration>2</duration></forward>
        <note><unpitched/><instrument id="S"/><duration>2</duration></note>
        <note><unpitched/><instrument id="unknown"/><duration>2</duration></note>
      </measure></part></score-partwise>`, 100);
    const scene = new T.Scene();
    const kit = createRestoredVRDrumSet(scene);
    scene.updateMatrixWorld(true);
    const surfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const eye = new T.Vector3(0, 1.35, 1);
    const guide = createVRNoteLanes(surfaces, eye);
    const mappings = Object.values(PAD_TO_INSTRUMENT);
    const targets = surfaces.map(surface => {
      const world = guide.paths.get(surface.id)(0, new T.Vector3());
      const local = surface.mesh.worldToLocal(world.clone());
      return { id: surface.id, world: world.toArray().map(value => Number(value.toFixed(3))), valid: mappings.includes(surface.id)
        && Math.hypot(local.x, local.z) < surface.radius && Math.abs(local.y - (surface.cymbal ? .008 : surface.height)) < .03 };
    });
    class Media extends EventTarget {
      currentTime = 0;
      paused = true;
      seeking = false;
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    const audio = new Media();
    const highway = createVRNoteHighway(scene, surfaces, guide.paths, () => {}, {
      notes: midi.notes, audio, offset: 2, windows: { perfect: 30, great: 100 },
    });
    highway.restart(20);
    highway.update(8000, eye);
    const first = scene.getObjectByName('note-kick-0');
    const spawnsOnClock = first.position.distanceTo(guide.paths.get('kick')(1, new T.Vector3())) < 1e-9;
    audio.currentTime = 2;
    highway.update(16000, eye);
    const onTargets = ['kick', 'hihat'].every(id => scene.getObjectByName(`note-${id}-0`).position.distanceTo(guide.paths.get(id)(0, new T.Vector3())) < 1e-9);
    const chord = [highway.strike('snare', 16000), highway.strike('kick', 16000), highway.strike('hihat', 16000)];
    audio.currentTime = 2.2;
    highway.update(17000, eye);
    const next = scene.getObjectByName('note-hihat-250');
    const before = next.position.clone();
    highway.pause(17000);
    highway.update(22000, eye);
    const paused = audio.paused && before.equals(next.position);
    highway.toggle(22000);
    audio.currentTime = 2.25;
    highway.update(22010, eye);
    const resumed = !audio.paused && !before.equals(next.position);
    audio.currentTime = 5;
    audio.dispatchEvent(new Event('seeked'));
    highway.update(23000, eye);
    const seeked = scene.getObjectByName('note-snare-3000').position.distanceTo(guide.paths.get('snare')(0, new T.Vector3())) < 1e-9;
    highway.dispose();
    guide.dispose();
    const scorer = createSongScorer(midi.notes, { perfect: 30, great: 100 });
    const scoring = [scorer.hit('snare', 0), scorer.hit('kick', .030)?.result, scorer.hit('hihat', .08)?.result,
      scorer.hit('kick', .01), scorer.advance(.4)?.miss];
    return { midi: midi.notes, tempos: midi.tempoMap, meter: midi.meterMap, override: override.notes[0].instrument,
      xml: xml.notes, skipped: xml.skipped, targets, spawnsOnClock, onTargets, chord, paused, resumed, seeked, scoring,
      progress: [getNoteProgress(.5, -1.5), getNoteProgress(.5, .5)] };
  }, [...midi]);
  assert.deepEqual(results.midi.slice(0, 12).filter(note => note.instrument === 'hihat').map(note => note.hitTime), [0, .25, .5, .75, 1, 1.25, 1.5, 1.75]);
  assert.deepEqual(results.midi.filter(note => note.instrument === 'kick').map(note => note.hitTime), [0, 1]);
  assert.deepEqual(results.midi.filter(note => note.instrument === 'snare').map(note => note.hitTime), [.5, 1.5, 3]);
  assert.deepEqual(results.tempos, [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }]);
  assert.deepEqual(results.meter, [{ beat: 0, numerator: 4, denominator: 4 }]);
  assert.deepEqual(results.xml.map(note => [note.instrument, note.hitTime, note.measure, note.measureBeat]), [
    ['hihat', 0, 1, 1], ['kick', 0, 1, 1], ['snare', .5, 1, 2], ['snare', 3, 2, 2],
  ]);
  assert.equal(results.skipped, 1);
  assert.equal(results.override, 'ride');
  assert.equal(results.targets.length, 8);
  assert(results.targets.every(target => target.valid));
  assert.deepEqual(results.chord, ['Miss', 'Perfect', 'Perfect']);
  assert.deepEqual(results.scoring, [undefined, 'perfect', 'great', undefined, 1]);
  assert.deepEqual(results.progress, [0, 1]);
  for (const check of ['spawnsOnClock', 'onTargets', 'paused', 'resumed', 'seeked']) assert(results[check], check);
  console.log('PASS Steps 1–3: eight real kit targets, MIDI/MusicXML, tempo changes, chord alignment, and fixed note travel.', results.targets);

  await page.getByRole('button', { name: 'SONG PRACTICE', exact: true }).first().click();
  await page.getByRole('button', { name: 'ADD SONG' }).click();
  await page.locator('#file-input').setInputFiles({ name: '120BPM Kit.mid', mimeType: 'audio/midi', buffer: midi });
  await page.getByRole('button', { name: '악보 분석 & 변환 시작' }).click();
  await page.getByText('13 Notes', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'SAVE SONG & 저장' }).click();
  await page.getByText('120BPM Kit', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.currentTime > .1);
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.paused);
  const seek = page.getByRole('slider', { name: '재생 위치' });
  await seek.press('Home');
  await seek.press('PageUp');
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]').currentTime >= .5);
  const seekTime = await page.locator('audio[data-song-practice-audio]').evaluate(audio => audio.currentTime);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.waitForFunction(time => document.querySelector('audio[data-song-practice-audio]')?.currentTime > time + .1, seekTime);
  const recording = await page.evaluate(async () => {
    const { createTimingTrack } = await import('/src/components/songPracticeTiming.ts');
    return [...new Uint8Array(await createTimingTrack([], 5).arrayBuffer())];
  });
  await page.getByText('음원 연결 및 타격 설정', { exact: true }).click();
  await page.getByLabel('연결할 음원').setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: Buffer.from(recording) });
  await page.getByLabel('악보 시작 오프셋 (초)').fill('0.75');
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.duration === 5);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url);
    window.scoreThree = T;
    const update = T.Scene.prototype.updateMatrixWorld;
    T.Scene.prototype.updateMatrixWorld = function (...args) {
      if (this.getObjectByName('player-rig')) window.scoreScene = this;
      return update.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'VR / AR', exact: true }).click();
  await page.locator('.vr-practice-stage canvas').waitFor();
  await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
  await page.getByRole('button', { name: 'Exit VR', exact: true }).waitFor();
  const uploadedChartInXR = await page.evaluate(() => {
    const { testXR: session, scoreScene: scene, scoreThree: T } = window;
    const rig = scene.getObjectByName('player-rig');
    const panel = scene.getObjectByName('vr-rhythm-controls');
    const source = session.connect('right');
    session.step(2);
    source.targetRaySpace.position = rig.worldToLocal(panel.localToWorld(new T.Vector3(-.124, .005, .5))).toArray();
    source.targetRaySpace.quaternion = panel.quaternion.toArray();
    source.gamepad.buttons[4].pressed = true;
    session.step();
    session.emit('select', { inputSource: source, frame: session.frame() });
    session.step(3);
    return !!scene.getObjectByName('note-kick-0')?.visible && !!scene.getObjectByName('note-hihat-0')?.visible
      && !scene.getObjectByName('note-crash-3000');
  });
  assert(uploadedChartInXR, 'The selected score replaces the demo chart in immersive practice');
  assert.deepEqual(errors, []);
  console.log('PASS Steps 4–6: actual browser media pause/seek/resume, upload-to-VR flow, and configurable timing windows.');
} finally {
  await browser?.close();
  await server.close();
}
