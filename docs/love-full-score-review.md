# 사랑으로 — full score extension

## Protected synchronization

The existing MP3, `VRMusicTransport` / `createVRMusicAudio`, output-clock implementation, `vrNoteSync.ts`, first-four-bar JSON, note travel duration, grade windows, controller input and haptics are unchanged. The runtime reads the existing `chartOffsetSeconds` and stored NOTE SYNC OFFSET exactly as before. The DRAFT's null `audioStartOffsetSeconds` does not overwrite them. No bar transition restarts a clock or audio source.

`public/songs/love/love_full_75_bars_DRAFT.json` is the reviewed derivative of the supplied file. The runtime checks its first 52 events against the original four-bar chart before starting the existing transport. Main JSON `time` values in bars 1–75 have not been shifted or regenerated. Removed cymbal hits and changed instrument assignments are listed in the JSON's `sheetReview.corrections`.

## Score review and limits

Source image: `사랑으로 악보.png`, found in the user's `Desktop/DS 노래 곡` directory. The two-page raster was inspected at enlarged staff level. This is a **partially reviewed DRAFT**, not a claim of exact complete transcription or isolated-drum/audio alignment.

- Original draft: 75 measures, 975 notes. Bars 1–4 have exactly the same note values and ordering as the synchronized opening and remain unchanged.
- The source score's last line starts at 73 and contains four played measures (73–76), followed by a whole-measure rest (77). The derivative therefore has `bars: 77`, 76 played measures, 985 notes and no notes in measure 77. The original filename is retained for provenance; it no longer states the corrected measure count accurately.
- Kick/snare main groove and eight-note cymbal rhythm were visually compared across the remaining systems. The `Closed H.H.` instruction at 9 and `Ride` instructions at 25/39 match the broad draft sections.
- Higher accented x-heads at 5, 9, 15, 19, 25, 35, 39, 43, 51, 57, 59, 67, 69 and 73 are assigned to the existing crash. This follows a conventional notation interpretation; a supplied percussion legend would be needed to certify the timbre.
- Measure 18 beat 4 has an open-circle quarter-note: assigned `hihat-open`; remove the extra draft eighth at 4.5. Measure 24 beat 4 is also a quarter-note: remove its extra cymbal eighth at 4.5.
- Measure 58 has a fill at beat 4 / 4.5. Remove the simultaneous draft ride at 4 and assign the final lower solid head provisionally to `floorTom` at 4.5. A small grace snare before beat 4 is visible but has no exact timing in this raster: it is explicitly **not generated at a guessed time**. Its exact timing and the tom identity remain unresolved.
- Measure 76 is transcribed from the visible ending, with the last open-circle cymbal provisionally mapped to `hihat-open`. That timbre remains unresolved because the earlier section is marked Ride.
- Mixed-recording stroke-by-stroke matching and any live-performance tempo drift after the confirmed opening have not been validated. The user's working synchronization is preserved rather than retimed.

The JSON retains source-file SHA256, the correction list and unresolved items. The detail panel states `FULL SCORE · PARTIAL SHEET REVIEW`. No new instrument models or generated runtime patterns are added.

## End and results

The existing audio `ended` event finishes the existing note engine, accounts for unresolved notes as MISS and clears pooled notes/zones. The love callback hides lanes and opens a result view in the existing movable panel: PERFECT / GREAT / MISS / ACCURACY, plus BACK TO MUSIC. Accuracy follows the existing 100/70 weighting: `(Perfect + 0.7 * Great) / total * 100`. No notes or audio are restarted by returning to MUSIC.

## Verification

- `npm run build`
- `node scripts/check-vr-love-full-song.mjs`: actual 985-note derivative, exact opening comparison, rejects changed opening, unchanged source epoch and +230ms test calibration, instrument targets at bars 1/5/9/18/25/58/76, final rest, ended-event cleanup, result totals/accuracy and return hit region.
- `node scripts/check-vr-love-song.mjs`: actual MP3 decoding and full-chart loading, existing preview/count-in, moved detail raycasts, signed calibration controls, real source `ended` event (stopped early for the test) and controller Trigger return to MUSIC. This is not a five-minute acoustic/headset playthrough.
- `node scripts/check-vr-love-sync.mjs`: original first-four-bar clock, one count-in and output-latency/calibration regression.

Physical Quest 3 full-song playthrough and the unresolved notation details still require checking. To reproduce the derivative without editing the original supplied file: `node scripts/prepare-love-full-chart.mjs <path-to-original-DRAFT.json>`.
