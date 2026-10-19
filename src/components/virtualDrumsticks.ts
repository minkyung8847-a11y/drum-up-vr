import * as THREE from 'three';

export type StickHand = 'left' | 'right';

// Grip transforms are separate from the local strike animation. A tracked
// controller can later own either grip without changing the stick or the kit.
export function createVirtualDrumsticks(parent: THREE.Object3D, desktopPose = true) {
  const profile: [number, number][] = [
    [0, -0.10], [0.005, -0.099], [0.007, -0.095],
    [0.007, 0.17], [0.006, 0.22], [0.004, 0.275],
    [0.003, 0.283], [0.005, 0.287], [0.0055, 0.296],
    [0.004, 0.305], [0, 0.31],
  ];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xd9b681, roughness: 0.57, metalness: 0 });
  const restAngle = desktopPose ? 0.23 : 0;
  const states = (['left', 'right'] as const).map(hand => {
    const grip = new THREE.Group();
    grip.name = `${hand}-stick-grip`;
    if (desktopPose) grip.position.set(hand === 'left' ? -0.23 : 0.23, -0.38, -0.62);
    // Slight inward aim, with the tips ahead of the implied grip points.
    if (desktopPose) grip.rotation.y = hand === 'left' ? -0.16 : 0.16;
    const swing = new THREE.Group();
    swing.name = `${hand}-stick-swing`;
    swing.rotation.x = restAngle;
    const stick = new THREE.Mesh(geometry, material);
    stick.name = `${hand}-drumstick`;
    const tip = new THREE.Object3D();
    tip.name = `${hand}-stick-tip`;
    tip.position.z = -0.31;
    swing.add(stick, tip);
    const offset = new THREE.Group();
    offset.name = `${hand}-stick-calibration`;
    offset.add(swing);
    grip.add(offset);
    parent.add(grip);
    return { hand, grip, offset, swing, tip, age: Infinity,
      startQuaternion: swing.quaternion.clone(), targetQuaternion: swing.quaternion.clone(),
      windupQuaternion: swing.quaternion.clone(),
      restQuaternion: swing.quaternion.clone() };
  });

  const smooth = (t: number) => t * t * (3 - 2 * t);
  const forward = new THREE.Vector3(0, 0, -1);
  const localTarget = new THREE.Vector3();
  const lift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16);
  let nextDesktopHand: StickHand = 'left';
  function reset(state: typeof states[number]) {
    state.age = Infinity;
    state.swing.rotation.set(restAngle, 0, 0);
  }
  function strike(hand: StickHand, targetWorld?: THREE.Vector3) {
    const state = states[hand === 'left' ? 0 : 1];
    state.startQuaternion.copy(state.swing.quaternion);
    state.targetQuaternion.setFromEuler(new THREE.Euler(restAngle - 0.34, 0, 0));
    if (targetWorld) {
      // Aim in the calibration parent's coordinates, leaving the grip and its
      // preview/controller transforms intact. Only the selected wrist swings.
      state.offset.updateWorldMatrix(true, false);
      localTarget.copy(targetWorld);
      state.offset.worldToLocal(localTarget);
      if (localTarget.lengthSq() > 1e-8) {
        state.targetQuaternion.setFromUnitVectors(forward, localTarget.normalize());
        const angle = state.restQuaternion.angleTo(state.targetQuaternion);
        if (angle > 1.05) state.targetQuaternion.slerp(state.restQuaternion, 1 - 1.05 / angle);
      }
    }
    // A tiny preparation above the impact pose makes even raised cymbal hits
    // finish with a downward wrist stroke, before returning to the resting pose.
    state.windupQuaternion.copy(state.targetQuaternion).multiply(lift);
    state.age = 0;
  }
  return {
    grips: { left: states[0].grip, right: states[1].grip },
    tips: { left: states[0].tip, right: states[1].tip },
    offsets: { left: states[0].offset, right: states[1].offset },
    dispose() {
      for (const state of states) state.grip.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
    strike,
    strikeAlternating(targetWorld?: THREE.Vector3) {
      // Desktop callers invoke this once per registered hit. Tracked sticks never
      // use alternating animation, and the frame update never changes this state.
      if (!desktopPose) return null;
      const hand = nextDesktopHand;
      nextDesktopHand = hand === 'left' ? 'right' : 'left';
      reset(states[hand === 'left' ? 1 : 0]);
      strike(hand, targetWorld);
      return hand;
    },
    update(delta: number) {
      for (const state of states) {
        if (state.age === Infinity) continue;
        state.age += Math.max(0, delta);
        if (state.age >= 0.2) { reset(state); continue; }
        if (state.age < 0.018) state.swing.quaternion.slerpQuaternions(
          state.startQuaternion, state.windupQuaternion, smooth(state.age / 0.018));
        else if (state.age < 0.055) state.swing.quaternion.slerpQuaternions(
          state.windupQuaternion, state.targetQuaternion, smooth((state.age - 0.018) / 0.037));
        else state.swing.quaternion.slerpQuaternions(
          state.targetQuaternion, state.restQuaternion, smooth((state.age - 0.055) / 0.145));
      }
    },
  };
}
