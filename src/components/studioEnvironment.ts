import * as THREE from 'three';

// Reflection-only studio softboxes. These never enter the visible scene or hit targets.
export function createStudioEnvironment() {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x35383d);
  const softbox = (width: number, height: number, position: [number, number, number], power: number, color = 0xffffff) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width,height), new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide,
    }));
    panel.position.set(...position); panel.lookAt(0,0.7,0); studio.add(panel);
  };
  softbox(5.5, 2.8, [0,4,-3.5], 3.6, 0xfff3d8);
  softbox(1.2, 5, [-3.5,2,1.5], 2.2);
  softbox(1.0, 4, [3,2,0], 1.6, 0xe5edff);
  softbox(3, 1.1, [0,1.8,4], 1.4);
  return studio;
}
