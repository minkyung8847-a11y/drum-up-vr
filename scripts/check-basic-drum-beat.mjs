import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(vite.resolvedUrls.local[0]);
  const checks = await page.evaluate(async () => {
    const { BASIC_DRUM_BEAT: song } = await import('/src/components/basicDrumBeat.ts');
    const { createSongMedia, createSongScorer } = await import('/src/components/songPlayback.ts');
    const { createSongArrivalDebug } = await import('/src/components/songArrivalDebug.ts');
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const { createVRNoteHighway, createVRNoteLanes, captureRhythmSurfaces } = await import('/src/components/vrNoteHighway.ts');
    const url = performance.getEntriesByType('resource').find(entry => /\/three\.js\?/.test(entry.name)).name;
    const T = await import(url);
    const counts = {};
    for (const note of song.notes) counts[note.instrument] = (counts[note.instrument] ?? 0) + 1;
    const bars = [0, 2, 4, 6].map(start => song.notes.filter(note => note.time >= start && note.time < start + 2)
      .map(note => [note.instrument, note.time - start]));
    const windows = { perfect: 50, great: 120 };
    const judge = createSongScorer(song.notes, windows);
    const wrong = judge.hit('crash', 0);
    let successful;
    for (const note of song.notes) successful = judge.hit(note.padId, note.time)?.score;
    const duplicate = judge.hit('kick', 0);
    const missed = createSongScorer(song.notes, windows).advance(8);
    const great = createSongScorer(song.notes, windows).hit('kick', .08)?.result;
    const wideWindows = createSongScorer(song.notes, { perfect: 50, great: 500 });
    wideWindows.advance(8);
    const finalized = wideWindows.finish();
    const media = createSongMedia({ chart: song, offset: 0 });
    const audio = new Audio(media.url);
    await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
    const duration = audio.duration;
    audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(media.url);

    const scene = new T.Scene();
    const kit = createRestoredVRDrumSet(scene);
    scene.updateMatrixWorld(true);
    const surfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const eye = new T.Vector3(0, 1.35, 1);
    const guide = createVRNoteLanes(surfaces, eye);
    class Clock extends EventTarget {
      currentTime = 0; paused = true; seeking = false;
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    const clock = new Clock();
    let result;
    const road = createVRNoteHighway(scene, surfaces, guide.paths, () => {}, {
      notes: song.notes, audio: clock, offset: 2, windows,
      onResults: (perfect, great, miss, time) => { result = { perfect, great, miss, time }; },
    });
    road.restart(0);
    road.update(50, eye);
    const spawn = scene.getObjectByName('note-kick-0').position.distanceTo(guide.paths.get('kick')(1, new T.Vector3())) < 1e-9;
    let targets = 0;
    for (const time of [...new Set(song.notes.map(note => note.time))]) {
      clock.currentTime = 2 + time;
      road.update(9876 + time * 13, eye); // Rendering clock deliberately does not track the media clock.
      for (const note of song.notes.filter(note => note.time === time)) {
        const mesh = scene.getObjectByName(`note-${note.instrument}-${time * 1000}`);
        if (mesh?.position.distanceTo(guide.paths.get(note.instrument)(0, new T.Vector3())) < 1e-9) targets++;
      }
    }
    clock.currentTime = 10;
    clock.dispatchEvent(new Event('ended'));
    const debug = createSongArrivalDebug(song.notes, 2);
    debug.reset(0);
    const frameError = debug.sample(2.017, true);
    debug.reset(1);
    const debugResets = debug.sample(1.5, true) === '';
    road.dispose(); guide.dispose();
    return { counts, bars, total: song.notes.length, wrong, duplicate, successful, missed, great, finalized,
      duration, offset: media.offset, spawn, targets, result, frameError, debugResets };
  });
  assert.deepEqual(checks.counts, { hihat: 32, kick: 8, snare: 8 });
  assert.equal(checks.total, 48);
  for (const bar of checks.bars) assert.deepEqual(bar, checks.bars[0]);
  assert.deepEqual(checks.bars[0].filter(([id]) => id === 'hihat').map(([, time]) => time), [0, .25, .5, .75, 1, 1.25, 1.5, 1.75]);
  assert.deepEqual(checks.bars[0].filter(([id]) => id === 'kick').map(([, time]) => time), [0, 1]);
  assert.deepEqual(checks.bars[0].filter(([id]) => id === 'snare').map(([, time]) => time), [.5, 1.5]);
  assert.equal(checks.wrong, undefined);
  assert.equal(checks.duplicate, undefined);
  assert.equal(checks.successful.perfect, 48);
  assert.equal(checks.great, 'great');
  assert.equal(checks.missed.miss, 48);
  assert.equal(checks.finalized.miss, 48);
  assert.equal(checks.duration, 10);
  assert.equal(checks.offset, 2);
  assert.equal(checks.spawn, true);
  assert.equal(checks.targets, 48);
  assert.deepEqual(checks.result, { perfect: 0, great: 0, miss: 48, time: 8 });
  assert.match(checks.frameError, /hihat \+ kick.*scheduled 2\.000s.*frame 2\.017s.*17\.0ms/);
  assert(checks.debugResets);

  await page.getByRole('button', { name: 'SONG PRACTICE', exact: true }).first().click();
  await page.getByText('BASIC DRUM BEAT', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  const audio = page.locator('audio[data-song-practice-audio]');
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.currentTime > .1);
  assert.match(await page.getByLabel('프리롤').textContent(), /COUNT IN [1-4]/);
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click();
  const frozen = await audio.evaluate(element => element.currentTime);
  await page.waitForTimeout(160);
  assert.equal(await audio.evaluate(element => element.currentTime), frozen);
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await page.waitForFunction(time => document.querySelector('audio[data-song-practice-audio]').currentTime > time + .1, frozen);
  await page.getByRole('button', { name: 'RESTART', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]').currentTime < .25);
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.currentTime > 2.05);
  assert.equal(await page.getByLabel('프리롤').textContent(), 'PLAYING');
  assert.match(await page.getByLabel('Audio synchronization debug').textContent(), /scheduled 2\./);
  await page.getByText('연주 완료!', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByLabel('PERFECT 횟수').textContent(), '0');
  assert.equal(await page.getByLabel('GREAT 횟수').textContent(), '0');
  assert.equal(await page.getByLabel('MISS 횟수').textContent(), '48');
  await page.getByRole('button', { name: '다시 연주하기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio[data-song-practice-audio]')?.currentTime > .1);
  assert.match(await page.getByLabel('프리롤').textContent(), /COUNT IN [1-4]/);
  assert.deepEqual(errors, []);
  console.log('PASS: 48 notes, exact four bars, 2s preroll + 8s audio, 48 actual 3D targets, chord timing, clock independence, judgment counts, arrival debug, PLAY/PAUSE/RESTART and real browser completion. Quest hardware NOT tested.');
} finally {
  await browser?.close();
  await vite.close();
}
