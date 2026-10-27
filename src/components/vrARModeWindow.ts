import * as THREE from 'three';

// A head-locked button remains visible when the browser hides page DOM in immersive VR.
export function createVRARModeWindow(camera: THREE.Camera, xr: THREE.WebXRManager, rig: THREE.Group,
  onSelectMode: (mode: 'vr' | 'ar') => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let target: 'vr' | 'ar' = 'ar';
  const draw = () => {
    context.fillStyle = '#111820';
    context.fillRect(0, 0, 512, 256);
    context.strokeStyle = '#64717f';
    context.lineWidth = 4;
    context.strokeRect(3, 3, 506, 250);
    context.fillStyle = '#b8c1ca';
    context.font = '600 30px Arial';
    context.fillText('DRUM UP  /  VIEW MODE', 28, 58);
    context.fillStyle = '#ff6d2d';
    context.fillRect(24, 93, 464, 129);
    context.fillStyle = '#151515';
    context.font = 'bold 52px Arial';
    context.fillText(`${target.toUpperCase()}  →`, 53, 165);
    context.font = '24px Arial';
    context.fillText(target === 'ar' ? 'REAL BACKGROUND' : 'VIRTUAL STAGE', 250, 164);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.235),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false }));
  panel.name = 'ar-mode-window';
  panel.position.set(0.42, 0.26, -1.1);
  panel.renderOrder = 1000;
  panel.visible = false;
  camera.add(panel);

  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  const sources = [0, 1, 2, 3].map(index => xr.getController(index));
  const selectHandlers = sources.map(source => () => {
    if (!panel.visible) return;
    rig.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, true);
    source.updateWorldMatrix(true, false);
    rotation.identity().extractRotation(source.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    if (raycaster.intersectObject(panel, false).length) onSelectMode(target);
  });
  sources.forEach((source, index) => {
    rig.add(source);
    source.addEventListener('select', selectHandlers[index]);
  });

  return {
    setTarget(mode: 'vr' | 'ar') { target = mode; draw(); texture.needsUpdate = true; },
    show() { panel.visible = true; },
    hide() { panel.visible = false; },
    dispose() {
      sources.forEach((source, index) => {
        source.removeEventListener('select', selectHandlers[index]);
        source.removeFromParent();
      });
      panel.removeFromParent();
      panel.geometry.dispose();
      (panel.material as THREE.Material).dispose();
      texture.dispose();
    },
  };
}
