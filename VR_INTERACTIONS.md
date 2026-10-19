# Seated VR free drumming

All scene units are metres. The VR view passes VR_DRUM_LAYOUT from
src/components/vrDrumConfig.ts to the existing model builder. The main site's
unconfigured kit retains its prior dimensions. There is no global kit scale and
no accumulated floor-tom scaling or cymbal repositioning patch.

## Measured dimensions and layout

Nominal shell/cymbal diameters exclude rims, stands and hardware. Positions are
instrument group centres (X right, Y above floor, Z toward the drummer).
The snare/tom Y coordinate is the top of the shell; cymbal bells rise above their
mounting position. Bass Y is its horizontal cylinder centre.

| Instrument | Previous nominal diameter | New diameter | Shell depth | Position X, Y, Z (m) |
| --- | --- | --- | --- | --- |
| Snare | 46 cm | 14 in / 35.56 cm | 5.5 in / 13.97 cm | 0, 0.67, 0.53 |
| Bass | 88 cm | 22 in / 55.88 cm | 16 in / 40.64 cm | 0.12, 0.30, -0.10 |
| Rack tom 1 | 48 cm | 10 in / 25.40 cm | 8 in / 20.32 cm | -0.18, 0.91, 0.02 |
| Rack tom 2 | 48 cm | 12 in / 30.48 cm | 9 in / 22.86 cm | 0.16, 0.93, 0 |
| Floor tom | 76 cm before old 0.8 scale | 16 in / 40.64 cm | 14 in / 35.56 cm | 0.43, 0.66, 0.48 |
| Hi-hat | 50 cm | 14 in / 35.56 cm | - | -0.40, 0.83, 0.51 |
| Crash | 78 cm | 18 in / 45.72 cm | - | -0.43, 1.04, 0.09 |
| Ride | 86 cm | 20 in / 50.80 cm | - | 0.49, 0.94, 0.23 |

Existing shells, head profiles, lugs, hoops, materials and cymbal designs use the
configured construction dimensions. Mounts, stands, floor legs and pedals follow
the new positions. Backgrounds, lighting, controller geometry and UI styling are
preserved. The seat starts at X=0, Z=1.0. Initial headset X/Z is anchored once;
physical floor-relative eye height is preserved without synthetic elevation or
head rotation. Subsequent head movement is fully tracked. VR exit restores the
desktop rig. No camera correction is applied continuously during play.

## Assisted wrist strikes

The VR scene uses vrAssistedStrikes.ts. The prior exact-contact implementation
vrStickCollision.ts remains available and tested, but is not the default VR path.

- Each controller's tracked tip and grip are sampled after Three.js XR updates.
- A deliberate 4 mm strike is required, at >=0.07 m/s tip speed and >=0.035 m/s
  toward the instrument's playing normal. No trigger button or pointing hit.
- A 65 degree half-angle cone selects nearby instruments in the swing direction.
- Invisible assistance extends 32 cm above / 8 cm below each playing surface and
  12 cm beyond its radius. Exact tip contact is unnecessary.
- The target must be within 40 cm of the swept tip, 85 cm of its controller grip,
  and 1.25 m of the head (1.5 m for the low, forward bass head).
- Nearest valid surface wins, with a small directional penalty for overlapping
  zones. A hand-level latch permits only one instrument per swing.
- A sustained 8 mm return movement and 40 ms cooldown re-arm that hand. Holding
  still, continuing a stroke and small alternating jitter cannot re-arm it.
- Left and right hands are independent, including simultaneous snare hits.
- Swept plane approach handles fast strikes. Tracking loss, pose jumps and frame
  gaps over 50 ms discard strike history. The update uses cached transforms and
  reused vectors, without per-frame mesh raycasts or new collider geometry.

Samples preload; each accepted hit creates an overlapping Web Audio voice.
Enter VR resumes audio, with controller select/squeeze as a resume-only fallback.
Head vibration, silver cymbal feedback and per-hand 18 ms haptics are preserved.
Unsupported/rejected pulse or dual-rumble calls safely do nothing.

## Falling notes

VR_FREE_DRUMMING.fallingNotes is false by default. The highway factory is not
called: no note meshes, lanes, guides, textures or note effects are constructed,
updated or rendered. The demo UI is hidden. Set this flag to true to restore the
existing system; its source and assets remain intact.

## Verification and hardware limits

- node scripts/check-vr-assisted-strikes.mjs: all eight instruments and both hands
  at 60/72/90/120 Hz; non-contact light flicks, recovery, overlap, reach limits,
  stationary/continued-swing rejection, fast sweeps and tracking loss.
- node scripts/check-vr-free-play.mjs: actual browser geometry dimensions/depths,
  seated positions, unchanged default builder, absent note objects and demo UI.
- node scripts/check-vr-hits.mjs: eight mouse instruments, correct loaded samples,
  overlapping audio, head/cymbal feedback restoration and silent misses.
- node scripts/check-xr-drumsticks.mjs: setup UI and mocked controller lifecycle.
- node scripts/check-vr-physical-strikes.mjs: retained contact/haptic regressions.
- Browser scripts accept VR_TEST_URL for the local Vite server.

Synthetic trajectories are test fixtures, never production autoplay. Actual VR
hardware must still validate perceived scale, seated reach, controller alignment,
aim ambiguity, fast rolls, recenter/reconnect behavior, audio onset, haptic feel,
and sustained headset FPS. No physical headset measurements are claimed.
