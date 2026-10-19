import * as THREE from 'three';
import type { StickHand } from './virtualDrumsticks';

export interface DrumHitSurface {
  id: string;
  mesh: THREE.Mesh;
  radius: number;
  cymbal: boolean;
  height: number;
}
export interface TipSample {
  valid: boolean;
  previous: THREE.Vector3;
  current: THREE.Vector3;
}

// Metres / seconds. A new stroke needs actual clearance, not just a timer.
export const STRIKE_LIMITS = {
  tipRadius: 0.0055, release: 0.012, minSpeed: 0.25,
  maxSpeed: 15, maxFrame: 0.05, maxTravel: 0.65, cooldown: 0.025,
} as const;

export function createVRStickCollision(surfaces: DrumHitSurface[],
  onHit: (id: string, hand: StickHand, velocity: number) => void) {
  const zones = surfaces.map(surface => {
    surface.mesh.updateWorldMatrix(true, false);
    // Freeze collision geometry at rest: visual wobble must not cause a hit.
    const world = surface.mesh.matrixWorld.clone();
    const inverse = world.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const normalScale = 1 / new THREE.Vector3(0, 1, 0).applyMatrix3(normalMatrix).length();
    return { ...surface, inverse, normalMatrix, normalScale,
      hands: { left: { armed: false, lastHit: -Infinity }, right: { armed: false, lastHit: -Infinity } } };
  });
  const previous = new THREE.Vector3(), current = new THREE.Vector3();
  const point = new THREE.Vector3(), motion = new THREE.Vector3(), normal = new THREE.Vector3();

  function height(zone: typeof zones[number], x: number, z: number) {
    if (!zone.cymbal) return zone.height;
    // Same radial profile as createVirtualDrumSet's lathed cymbal surface.
    const t = Math.min(1, Math.hypot(x, z) / zone.radius);
    return 0.049 * Math.exp(-Math.pow(t / 0.2, 3)) + 0.019 * Math.pow(1 - t, 2);
  }
  function distance(zone: typeof zones[number], p: THREE.Vector3) {
    return (p.y - height(zone, p.x, p.z)) * zone.normalScale - STRIKE_LIMITS.tipRadius;
  }
  function reset(hand?: StickHand) {
    for (const zone of zones) for (const name of hand ? [hand] : ['left', 'right'] as const) {
      zone.hands[name].armed = false;
      zone.hands[name].lastHit = -Infinity;
    }
  }

  return {
    reset,
    refreshSurfaces() {
      // Called after a whole-kit translation, with hit animations at rest.
      for (const zone of zones) {
        zone.mesh.updateWorldMatrix(true, false);
        zone.inverse.copy(zone.mesh.matrixWorld).invert();
        zone.normalMatrix.getNormalMatrix(zone.mesh.matrixWorld);
        zone.normalScale = 1 / normal.set(0, 1, 0).applyMatrix3(zone.normalMatrix).length();
      }
      reset();
    },
    update(hand: StickHand, sample: TipSample, delta: number, time: number) {
      const travel = sample.previous.distanceTo(sample.current);
      if (!sample.valid || !Number.isFinite(travel) || !Number.isFinite(delta)
        || delta <= 0 || delta > STRIKE_LIMITS.maxFrame || travel > STRIKE_LIMITS.maxTravel
        || travel / delta > STRIKE_LIMITS.maxSpeed) { reset(hand); return; }
      motion.subVectors(sample.current, sample.previous).divideScalar(delta);
      let nearest: { id: string; velocity: number; t: number } | null = null;
      for (const zone of zones) {
        const state = zone.hands[hand];
        previous.copy(sample.previous).applyMatrix4(zone.inverse);
        current.copy(sample.current).applyMatrix4(zone.inverse);
        // Use the beginning as well as the end of the sweep: fast rolls can lift
        // clear in one frame and cross the surface again in the next.
        if (distance(zone, previous) > STRIKE_LIMITS.release) state.armed = true;
        if (state.armed && time - state.lastHit >= STRIKE_LIMITS.cooldown) {
          let start = 0, d0 = distance(zone, previous);
          // Substeps also catch a sweep across the cymbal bell with endpoints
          // above its bow. Bisection finds the actual first surface contact.
          for (let step = 1; step <= 8; step++) {
            const end = step / 8;
            point.lerpVectors(previous, current, end);
            const d1 = distance(zone, point);
            if (d0 > 0 && d1 <= 0) {
              let low = start, high = end;
              for (let i = 0; i < 10; i++) {
                const mid = (low + high) / 2;
                point.lerpVectors(previous, current, mid);
                if (distance(zone, point) > 0) low = mid;
                else high = mid;
              }
              point.lerpVectors(previous, current, high);
              const radial = Math.hypot(point.x, point.z);
              if (radial <= zone.radius + STRIKE_LIMITS.tipRadius / zone.normalScale
                && (!zone.cymbal || radial >= zone.radius * 0.022)) {
                const e = 0.0001;
                normal.set(
                  -(height(zone, point.x + e, point.z) - height(zone, point.x - e, point.z)) / (2 * e),
                  1,
                  -(height(zone, point.x, point.z + e) - height(zone, point.x, point.z - e)) / (2 * e),
                ).applyMatrix3(zone.normalMatrix).normalize();
                const speed = -motion.dot(normal);
                // Consume contact even if too slow: sinking into a head cannot
                // become a delayed hit by accelerating while already inside it.
                state.armed = false;
                if (speed >= STRIKE_LIMITS.minSpeed && (!nearest || high < nearest.t)) {
                  nearest = { id: zone.id, t: high,
                    velocity: THREE.MathUtils.clamp(0.18 + (speed - STRIKE_LIMITS.minSpeed) / 4, 0.18, 1) };
                }
                break;
              }
            }
            start = end;
            d0 = d1;
          }
        }
        if (distance(zone, current) > STRIKE_LIMITS.release) state.armed = true;
      }
      if (nearest) {
        // A single tip sweep hits the nearest playing surface, independently of
        // the other hand. No global debounce blocks simultaneous strikes.
        zones.find(zone => zone.id === nearest.id)!.hands[hand].lastHit = time;
        onHit(nearest.id, hand, nearest.velocity);
      }
    },
  };
}
