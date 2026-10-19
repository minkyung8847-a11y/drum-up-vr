// WebXR / Three.js world units are metres. Nominal shell/cymbal diameters,
// not bounding boxes including rims, legs and stands.
const inch = 0.0254;
export const VR_FREE_DRUMMING = { fallingNotes: false };
// Construction baseline frozen at 6d78dff so existing vertex buffers/materials
// remain unchanged. These placements are NOT the active VR arrangement:
// createRestoredVRDrumSet restores initial-Git transforms and applies the small
// current-layout offsets before hit zones, feedback and instances are created.
export const VR_DRUM_LAYOUT: Record<string, {
  diameter: number; depth?: number; position: [number, number, number];
  tilt?: [number, number]; // X / Z: adjust the existing stand/mount angle only
  beaterScale?: number; // Kick mechanism only; never scales the bass shell/pedal
}> = {
  snare: { diameter: 13 * inch, depth: 5.5 * inch, position: [-0.05, 0.64, 0.56], tilt: [0.06, -0.02] },
  kick: { diameter: 22 * inch, depth: 16 * inch, position: [0.18, 0.30, -0.12], beaterScale: 0.8 },
  smallTom: { diameter: 10 * inch, depth: 8 * inch, position: [-0.175, 0.91, 0.12], tilt: [0.38, 0.04] },
  middleTom: { diameter: 12 * inch, depth: 9 * inch, position: [0.175, 0.93, 0.10], tilt: [0.38, -0.04] },
  floorTom: { diameter: 16 * inch, depth: 14 * inch, position: [0.43, 0.63, 0.58], tilt: [0.04, -0.04] },
  hihat: { diameter: 14 * inch, position: [-0.44, 0.83, 0.54], tilt: [0.06, -0.02] },
  crash: { diameter: 18 * inch, position: [-0.62, 1.04, 0.14], tilt: [0.15, -0.12] },
  ride: { diameter: 20 * inch, position: [0.64, 0.94, 0.24], tilt: [0.12, 0.14] },
};
