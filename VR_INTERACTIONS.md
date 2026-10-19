# Physical VR strikes

Both sticks inherit real WebXR controller grip position and orientation. Their
existing 31 cm tips are sampled after Three.js updates the XR poses. Only a
visible, position-tracked controller in an immersive session can strike.
Pointing, trigger buttons, desktop preview poses and the visual note demo do not
generate VR hits. Trigger/squeeze gestures can unlock browser audio only.

Playing zones come from existing head/cymbal meshes, including their current
world placement, tilt and scale. Shells and stands have no playing zones. The
kick's forward-facing head is playable by striking toward it; foot pedal
hardware is not integrated. Cymbal collision follows the radial bell/bow
profile. Collision surfaces remain at rest so visual feedback cannot cause hits.

`vrStickCollision.ts` sweeps each tip between valid frames. Contact requires at
least 0.25 m/s toward the surface and a new crossing from its playing side.
A 5.5 mm tip radius, 12 mm release clearance and 25 ms per-hand/per-instrument
cooldown suppress resting contact while permitting rolls and simultaneous hands.
Long frame gaps, pose jumps, tracking loss, calibration changes and reference
space resets discard strike history. Thresholds live in STRIKE_LIMITS.

Existing samples preload before strikes are accepted. AudioContext resume is
requested in the Enter VR gesture, with select/squeeze fallback. Each strike
starts its own Web Audio voice. Heads vibrate by a few millimetres; cymbal discs
and rims wobble and briefly emit a silver highlight. Shells, stands, rig, camera,
backgrounds and UI layout retain their existing transforms. Haptics use an 18 ms
pulse on the striking hand, with dual-rumble fallback; failures are ignored.

## Verification

- `node scripts/check-vr-physical-strikes.mjs`: strike direction/velocity, rolls,
  controller poses, tracking recovery, haptic fallbacks and feedback restoration.
- `node scripts/check-vr-hits.mjs`: all eight mouse instruments, loaded samples,
  overlapping voices, feedback restoration, empty-space and Shift-drag silence.
- `node scripts/check-xr-drumsticks.mjs`: desktop setup UI and mocked XR lifecycle.
- Browser scripts use VR_TEST_URL, defaulting to http://127.0.0.1:5175/.

Automated trajectories and mocked XR sources are test fixtures, never production
autoplay or proof of hardware performance. On a real headset, verify:

1. Enter VR from HTTPS and check both sticks' grip alignment.
2. Strike every head/cymbal with each hand, including the forward-facing kick head.
3. Hover, point, hold tips inside heads and move upward: these should stay silent.
4. Try soft/hard strokes, fast rolls, bell contacts and simultaneous hands.
5. Check sample onset and per-hand haptics at the headset's actual refresh rate.
6. Lose/recover tracking, recenter, re-enter VR and reconnect a controller. No
   phantom strike should occur; a new physical stroke should work.

Headset reach, controller alignment, measured audio latency, haptic strength and
collision thresholds still require hardware validation.

## Seated placement

VR entry translates the complete kit 35 cm toward the player and changes the
player's initial depth from 1.60 m to 1.25 m (70 cm closer overall). All individual
component transforms, model sizes, materials and background placement stay fixed.
The first valid headset pose anchors the player horizontally behind the kit;
subsequent head movement remains free. Physical floor-relative eye height is
preserved with only an 8 cm lift. No pitch or yaw is imposed during VR gameplay.
Hit zones refresh after whole-kit movement. Exiting VR restores the prior desktop
kit/rig placement and collisions; repeated sessions do not accumulate offsets.
