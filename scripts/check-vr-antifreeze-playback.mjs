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
    const { ANTIFREEZE_SONG, createVRMusicAudio, loadVRMusicChart } = await import('/src/components/vrMusicSong.ts');
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
  assert.equal(playback.notes, 100);
  assert(playback.fullSources, 'Full playback never schedules a fixed clip length');
  for (const { seconds, resumedAt, playing, frozen } of playback.checkpoints) {
    assert(playing && frozen, `Pause and resume at ${seconds}s`);
    assert(Math.abs(resumedAt - seconds) < .05, `Resume at the saved ${seconds}s position`);
  }
  console.log('PASS: Antifreeze uses the full MP3, pauses and resumes at 15s, 30s and 60s, and ends once at the recording boundary.');
} finally {
  await browser?.close();
  await server.close();
}
