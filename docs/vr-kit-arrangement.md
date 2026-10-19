# Seated acoustic kit arrangement

The VR layout uses the existing seat at X=0, Z=1 and the headset's physical
floor-relative eye height. No camera, seating or head-tracking transforms were
changed. Positive X is the drummer's right; negative Z is forward. Coordinates
and diameters below are metres. Drum coordinates are their top pivot, cymbal
coordinates are their mounting pivot, and kick coordinates are its shell centre.

| Instrument | Diameter (unchanged) | Position X, Y, Z | Tilt X / Z, degrees |
| --- | --- | --- | --- |
| Snare | 0.3556 (14 in) | -0.05, 0.67, 0.56 | 3.4 / -1.1 |
| Kick | 0.5588 (22 in) | 0.18, 0.30, -0.12 | 90 / 0 (existing orientation) |
| Small rack tom | 0.2540 (10 in) | -0.20, 0.91, 0.12 | 16.0 / 2.3 |
| Middle rack tom | 0.3048 (12 in) | 0.15, 0.93, 0.10 | 16.0 / -2.3 |
| Floor tom | 0.4064 (16 in) | 0.43, 0.66, 0.58 | 2.3 / -2.3 (existing tilt) |
| Hi-hat | 0.3556 (14 in) | -0.44, 0.83, 0.54 | 3.4 / -1.1 |
| Crash | 0.4572 (18 in) | -0.62, 1.04, 0.14 | 8.6 / -6.9 |
| Ride | 0.5080 (20 in) | 0.64, 0.94, 0.24 | 6.9 / 8.0 |

All shell depths are unchanged: snare 0.1397 m, kick 0.4064 m, small tom
0.2032 m, middle tom 0.2286 m and floor tom 0.3556 m. No instrument is scaled.
The same meshes, materials, colours, heads, hoops, cymbal profiles and hardware
are retained. Existing procedural stands and mounts follow their instruments.
The shared non-VR layout retains its original defaults.

The snare moves slightly left and toward the seat. The kick shifts right and
slightly forward. Rack toms move toward the seat, with a gentler inward tilt.
The floor tom moves back beside the snare. The hi-hat moves slightly left and
back. Crash and ride move outward from the toms, with the crash also brought
toward the seat. Heights stay unchanged. The existing single crash is retained;
no second cymbal or other component is added.

Placement references were inspected before editing:

- [Yamaha: Steve Francis, overhead photograph of an acoustic kit](https://au.yamaha.com/en/artists/s/steve-francis.html).
  The relative arrangement of snare between the knees, rack toms ahead, floor
  tom beside the snare, and outer cymbals informed this layout. Coordinates are
  an adaptation for the project's existing instrument sizes, not measurements
  extracted from the photograph.
- [Zildjian Drum Set Method, lesson 11, printed page 29](https://ae.zildjian.com/wp-content/uploads/Zildjian_Drum_Method_Lesson_11.pdf).
  The cymbal setup guidance informed reachable crash placement and a gentle
  tilt toward the player.

## Assisted strikes

Hit zones are derived from each instrument's resting mesh world matrix, so
position and angle changes apply to both controller hands without independent
hardcoded collider coordinates. Existing audio samples, visual effects and
controller haptics are preserved. Falling notes remain disabled.

Existing sensitivity and reach limits are retained: 0.07 m/s minimum speed,
0.035 m/s approach speed, 4 mm accumulated strike travel, 65 degree cone half
angle, 32 cm above / 8 cm below surface, 12 cm radial assistance, 40 cm tip
reach, 85 cm grip reach and 1.25 m head-to-target reach (1.5 m for kick).
Rearming requires an 8 mm recovery lift and a 40 ms cooldown per hand.

Target selection gives the playable disc and its 2 cm rim allowance priority
over another instrument's broad padding. Between padded regions it prefers the
nearest lateral edge, then surface distance and swing alignment. A hand can
produce only one instrument hit per stroke. Dropped frames and temporary
tracking/viewer-pose loss discard pending travel while preserving a fired
stroke's latch; they cannot rearm a stroke without a measured recovery lift.

## Validation

`scripts/check-vr-layout.mjs` tests the actual rendered kit and a separate
fixture built with all eight production instruments and hit zones:

- Original versus current instrument vertex/index buffers, materials and local
  mesh transforms match within floating-point tolerance (1e-7). All diameters,
  depths and unit scales match the original kit.
- Conservative oriented envelopes around shells, heads, rims and cymbal discs
  have no pairwise intersections. Intentional support hardware is excluded
  from this body-clearance test.
- All 33 sampled points across the central 70% radius of each playable drumhead
  and cymbal are unobstructed from the fixed reference seat at (0, 1.22, 1).
- 320 centre-strike cases cover both hands, 60/72/90/120 Hz inputs and five
  non-contact heights. A further 768 cases cover near edges, outer assistance
  and reversed zone ordering. No incorrect instrument or multiple-hit result
  occurs. Far outer points may remain silent under the intentional reach cap.
- Notes and note guides are absent. Separate diagnostic seated/overhead cameras
  render screenshots without modifying the application's camera or scene.

Other passing checks: `check-vr-assisted-strikes.mjs`, `check-vr-free-play.mjs`,
`check-vr-hits.mjs`, `check-xr-drumsticks.mjs`, `check-first-person-camera.mjs`,
`check-vr-physical-strikes.mjs`, production build, and lint on changed files.
The repository-wide lint command is blocked by the pre-existing syntax error
in `scripts/finish-brand-theme.mjs:12`. The existing bundle-size warning remains.

Real headset testing is still required for seated arm comfort across different
body sizes, actual controller orientation/calibration and reach, headset field
of view, physical haptic feel, perceived audio latency and sustained headset FPS.
Synthetic frame-rate inputs and desktop screenshots do not establish hardware
performance or comfort.
