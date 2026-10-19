import * as THREE from 'three';
import type { DrumHitSurface, TipSample } from './vrStickCollision';
import type { StickHand } from './virtualDrumsticks';

export const ASSISTED_STRIKE = {
  minSpeed: 0.07, minApproachSpeed: 0.035, strokeDistance: 0.004,
  coneDegrees: 65, above: 0.32, below: 0.08, radialPadding: 0.12, edgeGrace: 0.02,
  maxTipDistance: 0.40, maxGripDistance: 0.85, maxHeadDistance: 1.25,
  releaseDistance: 0.008, cooldown: 0.04,
  maxFrame: 0.05, maxSpeed: 25, maxTravel: 0.65,
} as const;

export function createVRAssistedStrikes(surfaces: DrumHitSurface[],
  onHit: (id: string, hand: StickHand, velocity: number) => void) {
  const zones = surfaces.map(surface => ({ ...surface, world: new THREE.Matrix4(), inverse: new THREE.Matrix4(),
    normal: new THREE.Vector3(), centre: new THREE.Vector3(), normalScale: 1, radialScale: 1 }));
  const makeHand = () => ({ ready: true, lastHit: -Infinity, travel: 0, recovery: 0,
    target: '', peakApproach: 0, direction: new THREE.Vector3() });
  const hands = { left: makeHand(), right: makeHand() };
  const from = new THREE.Vector3(), to = new THREE.Vector3(), local = new THREE.Vector3();
  const tip = new THREE.Vector3(), target = new THREE.Vector3(), toward = new THREE.Vector3();
  const motion = new THREE.Vector3(), direction = new THREE.Vector3(), scratch = new THREE.Vector3();
  const coneCos = Math.cos(THREE.MathUtils.degToRad(ASSISTED_STRIKE.coneDegrees));
  function height(zone: typeof zones[number], x: number, z: number) {
    if (!zone.cymbal) return zone.height;
    const t = Math.min(1, Math.hypot(x, z) / zone.radius);
    return 0.049 * Math.exp(-Math.pow(t / 0.2, 3)) + 0.019 * (1 - t) ** 2;
  }
  function reset(hand?: StickHand) {
    for (const key of hand ? [hand] : ['left', 'right'] as const) {
      const state = hands[key];
      state.ready = true; state.lastHit = -Infinity; state.travel = state.recovery = 0;
      state.peakApproach = 0;
      state.target = ''; state.direction.set(0, 0, 0);
    }
  }
  function suspend(hand?: StickHand) {
    for (const key of hand ? [hand] : ['left', 'right'] as const) {
      const state = hands[key];
      state.travel = state.recovery = 0; state.target = '';
      state.peakApproach = 0;
    }
  }
  function refreshSurfaces() {
    for (const zone of zones) {
      zone.mesh.updateWorldMatrix(true, false);
      zone.world.copy(zone.mesh.matrixWorld);
      zone.inverse.copy(zone.world).invert();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(zone.world);
      zone.normal.set(0, 1, 0).applyMatrix3(normalMatrix);
      zone.normalScale = 1 / zone.normal.length();
      zone.normal.normalize();
      zone.radialScale = Math.min(scratch.setFromMatrixColumn(zone.world, 0).length(),
        local.setFromMatrixColumn(zone.world, 2).length());
      zone.centre.set(0, height(zone, 0, 0), 0).applyMatrix4(zone.world);
    }
    reset();
  }
  refreshSurfaces();
  return {
    reset, suspend, refreshSurfaces,
    update(hand: StickHand, sample: TipSample & { grip?: THREE.Vector3 }, delta: number, time: number,
      head: THREE.Vector3) {
      const state = hands[hand];
      const travel = sample.previous.distanceTo(sample.current);
      if (!sample.valid || !Number.isFinite(travel) || !Number.isFinite(delta) || delta <= 0
        || delta > ASSISTED_STRIKE.maxFrame || travel > ASSISTED_STRIKE.maxTravel
        || travel / delta > ASSISTED_STRIKE.maxSpeed) {
        // Discard discontinuous motion without forgetting a fired stroke.
        // A frame stall/tracking gap cannot substitute for the recovery lift.
        suspend(hand);
        return;
      }
      motion.subVectors(sample.current, sample.previous).divideScalar(delta);
      const speed = motion.length();
      // A single hand-level latch spans ALL instruments. Holding position,
      // continuing a stroke or pointing cannot emit a second hit on a neighbour.
      if (!state.ready) {
        const awaySpeed = -motion.dot(state.direction);
        if (awaySpeed >= ASSISTED_STRIKE.minApproachSpeed) state.recovery += awaySpeed * delta;
        else if (awaySpeed < -ASSISTED_STRIKE.minApproachSpeed) state.recovery = 0;
        if (state.recovery >= ASSISTED_STRIKE.releaseDistance && time - state.lastHit >= ASSISTED_STRIKE.cooldown) {
          state.ready = true; state.travel = 0; state.target = '';
          state.peakApproach = 0;
        }
        return;
      }
      if (speed < ASSISTED_STRIKE.minSpeed) { state.travel = state.peakApproach = 0; state.target = ''; return; }
      direction.copy(motion).divideScalar(speed);
      let selected: typeof zones[number] | null = null;
      let bestScore = Infinity;
      let selectedCore = false;
      let bestEdgeDistance = Infinity;
      let firstCrossing = Infinity;
      let selectedApproach = 0;
      for (const zone of zones) {
        const approach = -motion.dot(zone.normal);
        if (approach < ASSISTED_STRIKE.minApproachSpeed) continue;
        from.copy(sample.previous).applyMatrix4(zone.inverse);
        to.copy(sample.current).applyMatrix4(zone.inverse);
        // Closest approach to the playing plane along this frame's swept tip.
        // Fast strokes can pass entirely through without needing an endpoint in
        // the zone. A small flick ABOVE the surface is equally eligible.
        const planeHeight = height(zone, to.x, to.z);
        const dy = from.y - to.y;
        let t = dy > 1e-8 ? THREE.MathUtils.clamp((from.y - planeHeight) / dy, 0, 1) : 1;
        local.lerpVectors(from, to, t);
        if (zone.cymbal && dy > 1e-8) {
          // Refine the crossing against the existing curved cymbal profile.
          for (let i = 0; i < 2; i++) {
            t = THREE.MathUtils.clamp((from.y - height(zone, local.x, local.z)) / dy, 0, 1);
            local.lerpVectors(from, to, t);
          }
        }
        let radial = Math.hypot(local.x, local.z);
        if (radial > zone.radius + ASSISTED_STRIKE.radialPadding / zone.radialScale) {
          // A diagonal wrist arc can enter and leave the assistance cylinder
          // between frames without crossing the drum plane. Test its closest
          // lateral approach as well, instead of considering only an endpoint.
          const dx = to.x - from.x, dz = to.z - from.z;
          const lateral = dx * dx + dz * dz;
          if (lateral < 1e-12) continue;
          t = THREE.MathUtils.clamp(-(from.x * dx + from.z * dz) / lateral, 0, 1);
          local.lerpVectors(from, to, t);
          radial = Math.hypot(local.x, local.z);
        }
        if (radial > zone.radius + ASSISTED_STRIKE.radialPadding / zone.radialScale) continue;
        const signedHeight = (local.y - height(zone, local.x, local.z)) * zone.normalScale;
        if (signedHeight > ASSISTED_STRIKE.above || signedHeight < -ASSISTED_STRIKE.below) continue;
        const ratio = radial > zone.radius ? zone.radius / radial : 1;
        target.set(local.x * ratio, 0, local.z * ratio);
        target.y = height(zone, target.x, target.z);
        target.applyMatrix4(zone.world);
        tip.copy(local).applyMatrix4(zone.world);
        toward.subVectors(target, sample.previous);
        const distance = tip.distanceTo(target);
        if (distance > ASSISTED_STRIKE.maxTipDistance
          || (sample.grip && sample.grip.distanceTo(target) > ASSISTED_STRIKE.maxGripDistance)
          || head.distanceTo(target) > (zone.id === 'kick' ? 1.5 : ASSISTED_STRIKE.maxHeadDistance)) continue;
        const aimDistance = toward.length();
        const alignment = aimDistance > 1e-8 ? toward.dot(direction) / aimDistance : 1;
        if (alignment < coneCos) continue;
        // A playing surface (including a 2 cm rim allowance) outranks a
        // neighbour's peripheral assistance.
        // Within that class, prefer the nearest surface in the swing cone.
        // This keeps a high cymbal's padded zone from stealing a tom strike.
        const core = radial <= zone.radius + ASSISTED_STRIKE.edgeGrace / zone.radialScale;
        const crossing = core && Math.abs(signedHeight) < 0.006 && from.y >= height(zone, from.x, from.z)
          && to.y <= height(zone, to.x, to.z) ? t : Infinity;
        const edgeDistance = Math.max(0, radial - zone.radius) * zone.radialScale;
        const score = distance + (1 - alignment) * 0.08;
        // Outside both discs, prefer the nearest lateral edge in the swing
        // direction before comparing depth. A raised neighbouring cymbal must
        // not win merely because its padding is closer along the stroke.
        const closerEdge = !core && !selectedCore && edgeDistance < bestEdgeDistance - 1e-6;
        const sameFootprint = core === selectedCore && (core || Math.abs(edgeDistance - bestEdgeDistance) <= 1e-6);
        const firstContact = crossing < firstCrossing - 1e-6;
        const sameContact = crossing === firstCrossing || Math.abs(crossing - firstCrossing) <= 1e-6;
        if (!selected || firstContact || (sameContact && ((core && !selectedCore) || closerEdge || (sameFootprint &&
          (score < bestScore - 1e-8 || (Math.abs(score - bestScore) < 1e-8 && zone.id < selected.id)))))) {
          selected = zone; bestScore = score; selectedCore = core; bestEdgeDistance = edgeDistance;
          firstCrossing = crossing; selectedApproach = approach;
        }
      }
      if (!selected) { state.travel = state.peakApproach = 0; state.target = ''; return; }
      if (state.target !== selected.id) { state.target = selected.id; state.travel = state.peakApproach = 0; }
      state.travel += travel;
      state.peakApproach = Math.max(state.peakApproach, selectedApproach);
      if (state.travel < ASSISTED_STRIKE.strokeDistance || time - state.lastHit < ASSISTED_STRIKE.cooldown) return;
      state.ready = false; state.lastHit = time; state.recovery = 0; state.travel = 0;
      state.direction.copy(direction);
      // Normal approach speed controls dynamics; a fast sideways brush must
      // not sound like a full-force hit. Preserve quiet, audible wrist taps.
      onHit(selected.id, hand, 0.12 + 0.88 * (1 - Math.exp(-state.peakApproach / 1.4)));
    },
  };
}
