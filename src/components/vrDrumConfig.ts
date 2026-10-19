// WebXR / Three.js world units are metres. Nominal shell/cymbal diameters,
// not bounding boxes including rims, legs and stands.
const inch = 0.0254;
export const VR_FREE_DRUMMING = { fallingNotes: false };
export const VR_DRUM_LAYOUT: Record<string, {
  diameter: number; depth?: number; position: [number, number, number];
}> = {
  snare: { diameter: 14 * inch, depth: 5.5 * inch, position: [0, 0.67, 0.53] },
  kick: { diameter: 22 * inch, depth: 16 * inch, position: [0.12, 0.30, -0.10] },
  smallTom: { diameter: 10 * inch, depth: 8 * inch, position: [-0.18, 0.91, 0.02] },
  middleTom: { diameter: 12 * inch, depth: 9 * inch, position: [0.16, 0.93, 0] },
  floorTom: { diameter: 16 * inch, depth: 14 * inch, position: [0.43, 0.66, 0.48] },
  hihat: { diameter: 14 * inch, position: [-0.40, 0.83, 0.51] },
  crash: { diameter: 18 * inch, position: [-0.43, 1.04, 0.09] },
  ride: { diameter: 20 * inch, position: [0.49, 0.94, 0.23] },
};
