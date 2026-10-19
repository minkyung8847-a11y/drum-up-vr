// WebXR / Three.js world units are metres. Nominal shell/cymbal diameters,
// not bounding boxes including rims, legs and stands.
const inch = 0.0254;
export const VR_FREE_DRUMMING = { fallingNotes: false };
// Right-handed acoustic layout, viewed from the existing seat at (0, *, 1).
// +X is the player's right; -Z is forward. Rotations are radians (XYZ).
// Placement references: Yamaha's overhead Steve Francis kit photograph and
// Zildjian Drum Set Method lesson 11 (reachable cymbals, gently tilted inward).
// Nominal diameters/depths below are intentionally unchanged.
export const VR_DRUM_LAYOUT: Record<string, {
  diameter: number; depth?: number; position: [number, number, number];
  tilt?: [number, number]; // X / Z: adjust the existing stand/mount angle only
}> = {
  snare: { diameter: 14 * inch, depth: 5.5 * inch, position: [-0.05, 0.67, 0.56], tilt: [0.06, -0.02] },
  kick: { diameter: 22 * inch, depth: 16 * inch, position: [0.18, 0.30, -0.12] },
  smallTom: { diameter: 10 * inch, depth: 8 * inch, position: [-0.20, 0.91, 0.12], tilt: [0.28, 0.04] },
  middleTom: { diameter: 12 * inch, depth: 9 * inch, position: [0.15, 0.93, 0.10], tilt: [0.28, -0.04] },
  floorTom: { diameter: 16 * inch, depth: 14 * inch, position: [0.43, 0.66, 0.58], tilt: [0.04, -0.04] },
  hihat: { diameter: 14 * inch, position: [-0.44, 0.83, 0.54], tilt: [0.06, -0.02] },
  crash: { diameter: 18 * inch, position: [-0.62, 1.04, 0.14], tilt: [0.15, -0.12] },
  ride: { diameter: 20 * inch, position: [0.64, 0.94, 0.24], tilt: [0.12, 0.14] },
};
