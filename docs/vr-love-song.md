# VR MUSIC — 사랑으로 (love.)

This integration belongs to the immersive MUSIC panel. Web SONG PRACTICE is unchanged.

- Assets: `public/songs/love/{love.mp3,cover.jpg,love_first_4_bars.json}` (user supplied).
- Select the first MUSIC row; the separate right panel supports close, 20-second preview/pause and START.
- START stops preview, loads/decodes the actual MP3, minimizes the panels, then schedules four beats (3 / 2 / 1 / GO) at 62 BPM. Audio starts after `4 * 60 / 62 = 3.870967742` seconds, with a 35ms scheduling lead.
- Both MP3 scheduling and the existing note engine read `VRMusicTransport`'s AudioContext clock. A frame drop changes the sampled position, not the timeline. XR visibility/session suspension pauses the transport through the existing highway pause path.
- Arrival = JSON `time` + `chartOffsetSeconds` relative to MP3 start. Spawn = arrival − the existing 3-second travel time. The first zero-offset notes spawn 0.870967742s after the count-in begins and arrive when GO ends.
- Only the supplied 52 events are used: ride 32, kick 12, snare 8. They cover four bars (15.483870968 seconds). Audio continues after the chart; no extra notes are synthesized.

## Alignment limit and calibration

The JSON explicitly says times are relative to the first full bar, and `audioStartOffsetSeconds` is `null`. Therefore zero is an **uncalibrated initial value**, not a verified correspondence to the recording. The detail panel displays `SYNC UNCALIBRATED` until adjusted. Use the minus/plus sides of CHART OFFSET (50ms steps, 0–120s) to specify the MP3 time of the first full bar, then START again. The value is stored independently under `drumup.vr.love.chart-offset.v1`. A positive value delays chart arrivals relative to the recording. Fixed BPM alone does not establish recording alignment or compensate for performance tempo drift.

## Checks

Run `npm run build`, `node scripts/check-vr-love-song.mjs`, `node scripts/check-vr-unified-panel.mjs`, `node scripts/check-vr-panel-upgrade.mjs`, `node scripts/check-vr-highway.mjs`, and `node scripts/check-vr-ar-switch.mjs`.

The love test decodes the actual MP3 and exercises curved-world-space Trigger raycasts, preview isolation, detail/parent movement, scheduled playback and the existing note engine. Its deterministic clock check verifies preroll, simultaneous arrivals/judgments, pause/resume, frame-time independence and no invented notes.

On Quest 3: refresh outside XR, enter VR, select 사랑으로, check the right panel and cover, preview/pause, move the shared handle, START, confirm 3/2/1/GO and first arrivals, adjust the recording offset, then test ride/snare/controller-Grip kick, grading, effects and haptics. Also check VR/AR session continuity, decoded-audio memory/performance and output latency. Physical headset behavior and recording alignment have not been verified by the automated tests.
