import * as THREE from 'three';

export const DEMO_DURATION = 20;
export const NOTE_TRAVEL_SECONDS = 3;
export const HIGHWAY_LANES = [
  { id: 'crash', label: 'CRASH', color: 0xead49a },
  { id: 'hihat', label: 'HI-HAT', color: 0xdcd6a6 },
  { id: 'snare', label: 'SNARE', color: 0xe9a5c8 },
  { id: 'kick', label: 'KICK', color: 0xeda782 },
  { id: 'tom1', label: 'TOM 1', color: 0x95d8e5 },
  { id: 'tom2', label: 'TOM 2', color: 0xa1dfc6 },
  { id: 'floor', label: 'FLOOR', color: 0xc2ace6 },
  { id: 'ride', label: 'RIDE', color: 0xe5b882 },
] as const;
type LaneId = typeof HIGHWAY_LANES[number]['id'];

// Authored 120 BPM fixture. Times are seconds at the hit line, including chords.
export const HIGHWAY_PATTERN: readonly { time: number; lane: LaneId }[] = [
  { time: 3, lane: 'kick' }, { time: 3, lane: 'crash' },
  { time: 3.5, lane: 'hihat' }, { time: 4, lane: 'snare' },
  { time: 4, lane: 'hihat' }, { time: 4.5, lane: 'hihat' },
  { time: 5, lane: 'kick' }, { time: 5, lane: 'hihat' },
  { time: 5.5, lane: 'hihat' }, { time: 6, lane: 'snare' },
  { time: 6, lane: 'hihat' }, { time: 6.5, lane: 'hihat' },
  { time: 7, lane: 'tom1' }, { time: 7.5, lane: 'tom2' },
  { time: 8, lane: 'floor' }, { time: 8.5, lane: 'ride' },
  { time: 9, lane: 'kick' }, { time: 9, lane: 'crash' },
  { time: 9.5, lane: 'ride' }, { time: 10, lane: 'snare' },
  { time: 10, lane: 'ride' }, { time: 10.5, lane: 'ride' },
  { time: 11, lane: 'kick' }, { time: 11.5, lane: 'ride' },
  { time: 12, lane: 'snare' }, { time: 12.5, lane: 'hihat' },
  { time: 13, lane: 'kick' }, { time: 13, lane: 'hihat' },
  { time: 13.5, lane: 'hihat' }, { time: 14, lane: 'snare' },
  { time: 14.5, lane: 'tom1' }, { time: 15, lane: 'tom2' },
  { time: 15.5, lane: 'floor' }, { time: 16, lane: 'kick' },
  { time: 16, lane: 'crash' }, { time: 17, lane: 'ride' },
];

export function createVRNoteHighway(scene: THREE.Scene) {
  const anchor = new THREE.Group();
  anchor.name = 'note-highway-anchor';
  const road = new THREE.Group();
  road.name = 'note-highway';
  anchor.add(road);
  scene.add(anchor);
  const width = 3.2;
  const laneWidth = width / HIGHWAY_LANES.length;
  let length = 1;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, 1),
    new THREE.MeshBasicMaterial({ color: 0x151a24, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  surface.name = 'highway-surface';
  road.add(surface);
  const strips: THREE.Mesh[] = [];
  for (let i = 0; i <= HIGHWAY_LANES.length; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 1),
      new THREE.MeshBasicMaterial({ color: 0xe4e8ef, transparent: true, opacity: i === 0 || i === 8 ? 0.28 : 0.18, depthWrite: false, side: THREE.DoubleSide }));
    line.position.set(i * laneWidth - width / 2, 0.5, 0.005);
    road.add(line);
    strips.push(line);
  }
  const hitLine = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.03, 0.012),
    new THREE.MeshBasicMaterial({ color: 0xf1e7da, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
  hitLine.name = 'highway-hit-line';
  hitLine.position.z = 0.03;
  road.add(hitLine);
  // One shared, hollow ring texture includes its soft halo: one quad per note,
  // no bloom pass, particles, lights, or additional glow geometry.
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = ringCanvas.height = 128;
  const ringContext = ringCanvas.getContext('2d')!;
  const halo = ringContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, alpha] of [[0, 0], [0.48, 0], [0.55, 0.06], [0.61, 0.25],
    [0.64, 1], [0.71, 1], [0.76, 0.30], [0.86, 0.05], [1, 0]]) {
    halo.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ringContext.fillStyle = halo;
  ringContext.fillRect(0, 0, 128, 128);
  const ringTexture = new THREE.CanvasTexture(ringCanvas);
  ringTexture.colorSpace = THREE.SRGBColorSpace;
  const noteGeometry = new THREE.PlaneGeometry(laneWidth * 0.86, laneWidth * 0.86);
  const notes = HIGHWAY_PATTERN.map(note => {
    const lane = HIGHWAY_LANES.findIndex(item => item.id === note.lane);
    const mesh = new THREE.Mesh(noteGeometry, new THREE.MeshBasicMaterial({
      color: new THREE.Color(HIGHWAY_LANES[lane].color).multiplyScalar(1.5), map: ringTexture, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    mesh.name = `note-${note.lane}-${note.time}`;
    mesh.position.set((lane + 0.5) * laneWidth - width / 2, 0, 0.035);
    mesh.userData.hitTime = note.time;
    road.add(mesh);
    return { ...note, mesh };
  });

  return {
    anchor, notes, hitLine,
    // Anchor in world space using the original seated pose; never move the camera.
    layout(camera: THREE.PerspectiveCamera, position: THREE.Vector3, orientation: THREE.Quaternion) {
      anchor.position.copy(position);
      anchor.quaternion.copy(orientation);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      // Extend down toward the playing area, behind the kit. Depth testing lets
      // the original drum surfaces occlude the highway naturally.
      const near = new THREE.Vector3(0, 0.22 * tangent * 2, -2);
      const far = new THREE.Vector3(0, 0.95 * tangent * 7, -7);
      const direction = far.clone().sub(near);
      length = direction.length();
      road.position.copy(near);
      road.rotation.x = Math.atan2(direction.z, direction.y);
      // Fit the highway horizontally on narrow screens without altering the kit.
      road.scale.x = Math.min(1, 4 * tangent * camera.aspect * 0.82 / width);
      surface.scale.y = length;
      surface.position.y = length / 2;
      for (const strip of strips) { strip.scale.y = length; strip.position.y = length / 2; }
    },
    update(elapsedSeconds: number) {
      const time = ((elapsedSeconds % DEMO_DURATION) + DEMO_DURATION) % DEMO_DURATION;
      for (const note of notes) {
        // Absolute chart time determines position: constant world speed, no drift.
        const untilHit = note.time - time;
        note.mesh.position.y = untilHit * length / NOTE_TRAVEL_SECONDS;
        note.mesh.visible = untilHit <= NOTE_TRAVEL_SECONDS && untilHit >= -0.12;
        note.mesh.material.opacity = THREE.MathUtils.lerp(0.95, 0.5,
          THREE.MathUtils.clamp(untilHit / NOTE_TRAVEL_SECONDS, 0, 1));
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      anchor.traverse(object => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      ringTexture.dispose();
      anchor.removeFromParent();
    },
  };
}
