# VR MUSIC — 사랑으로 (love.)

This integration belongs to the immersive MUSIC panel. Web SONG PRACTICE is unchanged.

- Assets: `public/songs/love/{love.mp3,cover.jpg,love_first_4_bars.json}` (user supplied).
- Select the first MUSIC row; the separate right panel supports close, 20-second preview/pause and START.
- START stops preview, loads/decodes the actual MP3, minimizes the panels, then schedules four beats (3 / 2 / 1 / GO) at 62 BPM. Audio starts after `4 * 60 / 62 = 3.870967742` seconds, with a 35ms scheduling lead.
- MP3 scheduling uses AudioContext rendering time; notes, judgments and the countdown use the same context's **output** time (`getOutputTimestamp()` mapped to now, falling back to reported `outputLatency`). This prevents buffered audio from making notes arrive ahead of what is output. No guessed device delay is applied. See the [Web Audio output timestamp specification](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp).
- Arrival = MP3 start + JSON `time` + `chartOffsetSeconds` + `noteSyncMs / 1000`. Spawn = arrival − the existing 3-second travel time. Count-in occurs once, before MP3 start. The first notes now spawn about 3.770967742s after count-in begins and arrive about 6.770967742s after it begins (2.90s into the MP3), before any device-output latency.
- Only the supplied 52 events are used: ride 32, kick 12, snare 8. They cover four bars (15.483870968 seconds). Audio continues after the chart; no extra notes are synthesized.

## Alignment limit and calibration

The original bug treated JSON time zero (first complete bar) as MP3 time zero, despite the JSON's original null start offset. An offline analysis of the supplied MP3 now sets `audioStartOffsetSeconds` and the initial chart offset to **approximately 2.90s**. This is a measured recording anchor, not a generic delay to conceal clock bugs.

Reproduce with `node scripts/analyze-love-audio.mjs`. It decodes the real MP3 (307.776s), computes 10ms energy/positive-change envelopes for 35–180Hz and 1400–8000Hz, and compares kick/snare pattern attacks. The file contains very quiet lead-in, a low-frequency pickup around 1.9s, then a strong full-band onset around 2.90s. Subsequent attacks around 3.89, 4.85, 5.32 and 5.81s match the first bar's expected 3.867742, 4.835484, 5.319355 and 5.803226s. Repeating bars produce correlation peaks every ~3.87s; the earliest matching complete pattern, not the globally loudest later bar, is used. Mixed-recording signal analysis is approximate, not a claim of isolated-drum sample accuracy.

MP3 SHA256: `99B1DFC460E72EB928A0833C61A3C1F3CF9F493EE849C0653DA3DCFD5C74D845`.

CHART OFFSET on the existing detail panel still controls the recording-specific first bar (50ms steps). It is saved under `drumup.vr.love.chart-offset.v2`; positive explicit legacy calibration is preserved while the former uncalibrated legacy zero uses the new measured default.

For device/output fine calibration use **SETTINGS → NOTE → NOTE SYNC OFFSET (ms)**: −10 / +10, signed value, RESET to 0, persisted under `drumup.vr.note-sync-ms.v1`. Positive means later arrivals, negative earlier. Changes also shift unresolved notes in the active love performance without restarting audio, resetting scores, changing travel speed or reviving resolved notes. This calibration is separate from the 2.90s recording anchor; BASIC DRUM BEAT is unaffected.

Console diagnostics report the MP3 scheduled start/countdown end, the first output observation, each note's target/spawn time, scheduled context time, first observed crossing frame and `arrivalErrorMs`. The error is frame observation lateness on the audio-output timeline; it is not a headset display or acoustic measurement. Successful early hits remain resolved, and restart clears crossing reports exactly once per run.

## Checks

Run `npm run build`, `node scripts/check-vr-love-sync.mjs`, `node scripts/check-vr-love-song.mjs`, `node scripts/check-vr-unified-panel.mjs`, `node scripts/check-vr-panel-upgrade.mjs`, `node scripts/check-vr-highway.mjs`, and `node scripts/check-vr-ar-switch.mjs`.

The love test decodes the actual MP3 and exercises curved-world-space Trigger raycasts, preview isolation, detail/parent movement, scheduled playback and the existing note engine. Its deterministic clock check verifies preroll, simultaneous arrivals/judgments, pause/resume, frame-time independence and no invented notes.

On Quest 3: refresh outside XR, enter VR, select 사랑으로, check the right panel and cover, preview/pause, move the shared handle, START, confirm 3/2/1/GO and first arrivals, adjust the recording offset, then test ride/snare/controller-Grip kick, grading, effects and haptics. Also check VR/AR session continuity, decoded-audio memory/performance and output latency. Physical headset behavior and recording alignment have not been verified by the automated tests.
