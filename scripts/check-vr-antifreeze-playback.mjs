import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);

  const playback = await page.evaluate(async () => {
    const { ANTIFREEZE_SONG, createVRMusicAudio, loadVRMusicChart, songChartOffset } = await import('/src/components/vrMusicSong.ts');
    const starts = [];
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      starts.push(args);
      return originalStart.apply(this, args);
    };

    const audio = createVRMusicAudio();
    await audio.unlock();
    const transport = await audio.transport(ANTIFREEZE_SONG);
    const notes = await loadVRMusicChart(ANTIFREEZE_SONG);
    const opening = await (await fetch('/songs/antifreeze/Antifreeze_opening_8_bars.json')).json();
    const score = await (await fetch(ANTIFREEZE_SONG.chart)).json();
    const chartOffset = songChartOffset(ANTIFREEZE_SONG);
    const { Scene, Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const { createRestoredVRDrumSet } = await import('/src/components/restoredVRDrumSet.ts');
    const { captureRhythmSurfaces, createVRNoteLanes, createVRNoteHighway } = await import('/src/components/vrNoteHighway.ts');
    const scene = new Scene();
    const kit = createRestoredVRDrumSet(scene);
    scene.updateMatrixWorld(true);
    const surfaces = captureRhythmSurfaces(kit.hitSurfaces);
    const eye = new Vector3(0, 1.35, 1);
    const lanes = createVRNoteLanes(surfaces, eye);
    const clock = Object.assign(new EventTarget(), {
      currentTime: 0, paused: true, seeking: false,
      async play() { this.paused = false; },
      pause() { this.paused = true; },
    });
    const chartNotes = notes.map(note => ({ ...note, time: note.time + chartOffset }));
    let totals;
    const highway = createVRNoteHighway(scene, surfaces, lanes.paths, () => {}, {
      notes: chartNotes, audio: clock, offset: transport.preroll, windows: { perfect: 50, great: 120 },
      onResults: (perfect, great, miss) => { totals = perfect + great + miss; },
    });
    highway.restart(0);
    const lateJudgments = [9, 41, 70, 100, 125].map(measure => {
      const note = chartNotes.find(note => note.measure === measure);
      clock.currentTime = note.time + transport.preroll;
      highway.update(0, eye);
      return highway.strike(note.instrument, 0);
    });
    clock.dispatchEvent(new Event('ended'));
    const endTotal = totals;
    highway.restart(0);
    const seekTarget = chartNotes.find(note => note.measure === 100);
    const targetTime = seekTarget.time + transport.preroll;
    const noteName = `note-${seekTarget.instrument}-${seekTarget.time * 1000}`;
    highway.pause(0);
    highway.seekTo(targetTime - 1, 0);
    highway.update(0, eye);
    const mesh = scene.getObjectByName(noteName);
    const beforePause = mesh?.position.clone();
    highway.update(60_000, eye);
    const pausedNoteFrozen = !!beforePause && mesh.position.equals(beforePause) && clock.paused;
    highway.toggle(60_000);
    clock.currentTime = targetTime;
    highway.update(60_001, eye);
    const target = lanes.paths.get(seekTarget.instrument)(0, new Vector3());
    const reachedLine = mesh?.visible && mesh.position.distanceTo(target) < 1e-6;
    const seekJudgment = highway.strike(seekTarget.instrument, 60_001);
    highway.seekTo(transport.preroll + 2, 60_002);
    highway.update(60_002, eye);
    const rewindClearsLateNote = !scene.getObjectByName(noteName)?.visible;
    highway.dispose();
    lanes.dispose();
    const checkpoints = [];
    let endCount = 0;
    transport.addEventListener('ended', () => endCount++);
    try {
      await transport.play();
      for (const seconds of [15, 30, 60]) {
        transport.pause();
        transport.currentTime = transport.preroll + seconds;
        await transport.play();
        transport.pause();
        const pausedAt = transport.currentTime;
        await new Promise(resolve => setTimeout(resolve, 50));
        const frozen = transport.currentTime === pausedAt;
        await transport.play();
        checkpoints.push({
          seconds,
          resumedAt: starts.at(-1)[1],
          playing: !transport.paused,
          frozen,
        });
      }
      transport.pause();
      transport.currentTime = transport.preroll + transport.duration - .25;
      const ended = new Promise(resolve => transport.addEventListener('ended', resolve, { once: true }));
      await transport.play();
      await ended;
      return {
        duration: transport.duration,
        stoppedAt: transport.currentTime - transport.preroll,
        endCount,
        checkpoints,
        notes: notes.length,
        lastArrival: notes.at(-1).time + chartOffset,
        openingPreserved: JSON.stringify(score.notes.slice(0, opening.notes.length)) === JSON.stringify(opening.notes),
        sourceMeasures: score.sourceMeasures,
        activeAt: [30, 60, 120, 180, 233].map(seconds => notes.some(note => Math.abs(note.time + chartOffset - seconds) < 1)),
        uniquePlayableNotes: new Set(notes.map(note => `${note.instrument}:${note.time}`)).size,
        lateJudgments,
        totals: endTotal,
        pausedNoteFrozen,
        reachedLine,
        seekJudgment,
        rewindClearsLateNote,
        fullSources: starts.every(args => args.length === 2),
      };
    } finally {
      transport.dispose();
      audio.dispose();
      AudioBufferSourceNode.prototype.start = originalStart;
    }
  });

  assert(playback.duration > 244 && playback.duration < 245);
  assert(Math.abs(playback.stoppedAt - playback.duration) < .001);
  assert.equal(playback.endCount, 1);
  assert.equal(playback.notes, 1691);
  assert.equal(playback.uniquePlayableNotes, playback.notes);
  assert.deepEqual(playback.lateJudgments, Array(5).fill('Perfect'));
  assert.equal(playback.totals, playback.notes);
  assert(playback.pausedNoteFrozen && playback.reachedLine && playback.rewindClearsLateNote);
  assert.equal(playback.seekJudgment, 'Perfect');
  assert(playback.openingPreserved);
  assert.equal(playback.sourceMeasures.length, 126);
  assert.deepEqual(playback.sourceMeasures.slice(-9), [80, 73, 74, 75, 76, 77, 78, 79, 81]);
  assert(playback.activeAt.every(Boolean));
  assert(playback.lastArrival > 234 && playback.lastArrival < playback.duration);
  assert(playback.fullSources, 'Full playback never schedules a fixed clip length');
  for (const { seconds, resumedAt, playing, frozen } of playback.checkpoints) {
    assert(playing && frozen, `Pause and resume at ${seconds}s`);
    assert(Math.abs(resumedAt - seconds) < .05, `Resume at the saved ${seconds}s position`);
  }
  console.log('PASS: Antifreeze 126-bar full chart, original opening, late notes, full MP3, pause/resume and natural end.');
} finally {
  await browser?.close();
  await server.close();
}
