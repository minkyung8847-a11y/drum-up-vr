import * as THREE from 'three';

// A head-locked button remains visible when the browser hides page DOM in immersive VR.
export function createVRARModeWindow(camera: THREE.Camera, xr: THREE.WebXRManager, rig: THREE.Group,
  onSelectMode: (mode: 'vr' | 'ar') => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let target: 'vr' | 'ar' = 'ar';
  let hovered = false;
  let pointerActive = false;
  let aWasPressed = false;
  const draw = () => {
    context.fillStyle = '#111820';
    context.fillRect(0, 0, 512, 256);
    context.strokeStyle = '#64717f';
    context.lineWidth = 4;
    context.strokeRect(3, 3, 506, 250);
    context.fillStyle = '#b8c1ca';
    context.font = '600 30px Arial';
    context.fillText('DRUM UP  /  VIEW MODE', 28, 58);
    context.fillStyle = hovered ? '#ffad75' : '#ff6d2d';
    context.fillRect(24, 93, 464, 129);
    context.fillStyle = '#151515';
    context.font = 'bold 52px Arial';
    context.fillText(`${target.toUpperCase()}  →`, 53, 165);
    context.font = '24px Arial';
    context.fillText(target === 'ar' ? 'REAL BACKGROUND' : 'VIRTUAL STAGE', 250, 164);
    context.fillStyle = '#d9e1e9';
    context.font = '20px Arial';
    context.fillText('A: HAND CURSOR     TRIGGER: SELECT', 25, 247);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.275),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false }));
  panel.name = 'ar-mode-window';
  panel.position.set(0.38, 0.25, -1.0);
  panel.renderOrder = 1000;
  panel.visible = false;
  camera.add(panel);

  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  const sources = [0, 1, 2, 3].map(index => xr.getController(index));
  const bindings = new Map<XRInputSource, THREE.Group>();
  const connectedHandlers = sources.map(source => (event: { data: XRInputSource }) => {
    bindings.set(event.data, source);
  });
  const disconnectedHandlers = sources.map(() => (event: { data: XRInputSource }) => {
    bindings.delete(event.data);
  });
  const handCanvas = document.createElement('canvas');
  handCanvas.width = handCanvas.height = 96;
  const hand = handCanvas.getContext('2d')!;
  hand.lineJoin = 'round';
  hand.lineCap = 'round';
  hand.fillStyle = '#ffffff';
  hand.strokeStyle = '#18222d';
  hand.lineWidth = 7;
  hand.beginPath();
  hand.moveTo(34, 82); hand.lineTo(25, 59); hand.lineTo(18, 47);
  hand.quadraticCurveTo(16, 39, 24, 37);
  hand.quadraticCurveTo(30, 36, 35, 43);
  hand.lineTo(35, 17); hand.quadraticCurveTo(35, 8, 43, 8);
  hand.quadraticCurveTo(51, 8, 51, 17);
  hand.lineTo(51, 48); hand.quadraticCurveTo(58, 42, 65, 47);
  hand.quadraticCurveTo(71, 43, 77, 50);
  hand.quadraticCurveTo(83, 48, 86, 55);
  hand.lineTo(77, 82); hand.closePath();
  hand.fill(); hand.stroke();
  const handTexture = new THREE.CanvasTexture(handCanvas);
  const handCursor = new THREE.Sprite(new THREE.SpriteMaterial({ map: handTexture, transparent: true, depthTest: false }));
  handCursor.name = 'ar-hand-cursor';
  handCursor.scale.set(0.075, 0.075, 1);
  handCursor.renderOrder = 1002;
  handCursor.visible = false;
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffaa72, transparent: true, opacity: 0.9, depthTest: false }),
  );
  ray.name = 'ar-hand-ray';
  ray.renderOrder = 1001;
  ray.visible = false;
  const pointAtPanel = (source: THREE.Group) => {
    rig.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, true);
    source.updateWorldMatrix(true, false);
    rotation.identity().extractRotation(source.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return raycaster.intersectObject(panel, false)[0];
  };
  const selectHandlers = sources.map(source => () => {
    if (!panel.visible) return;
    if (pointAtPanel(source)) onSelectMode(target);
  });
  sources.forEach((source, index) => {
    rig.add(source);
    source.addEventListener('connected', connectedHandlers[index]);
    source.addEventListener('disconnected', disconnectedHandlers[index]);
    source.addEventListener('select', selectHandlers[index]);
  });

  const resetPointer = () => {
    pointerActive = false;
    aWasPressed = false;
    handCursor.visible = ray.visible = false;
    if (hovered) { hovered = false; draw(); texture.needsUpdate = true; }
  };

  return {
    setTarget(mode: 'vr' | 'ar') { target = mode; draw(); texture.needsUpdate = true; },
    show() { panel.visible = true; resetPointer(); },
    hide() { panel.visible = false; resetPointer(); },
    update(session: XRSession | null) {
      const input = [...(session?.inputSources ?? [])].find(source => source.handedness === 'right' && source.gamepad);
      const source = input && bindings.get(input);
      if (!panel.visible || !input || !source) { resetPointer(); return false; }
      const aPressed = input.gamepad?.buttons[4]?.pressed === true;
      if (aPressed && !aWasPressed) pointerActive = !pointerActive;
      aWasPressed = aPressed;
      if (!pointerActive) {
        handCursor.visible = ray.visible = false;
        if (hovered) { hovered = false; draw(); texture.needsUpdate = true; }
        return false;
      }
      if (ray.parent !== source) { source.add(ray); source.add(handCursor); }
      const hit = pointAtPanel(source);
      const distance = hit?.distance ?? 1.2;
      ray.scale.z = distance;
      handCursor.position.set(0, 0, -distance);
      ray.visible = handCursor.visible = true;
      handCursor.material.color.set(hit ? 0xff8f4d : 0xffffff);
      if (hovered !== !!hit) { hovered = !!hit; draw(); texture.needsUpdate = true; }
      return true;
    },
    dispose() {
      sources.forEach((source, index) => {
        source.removeEventListener('connected', connectedHandlers[index]);
        source.removeEventListener('disconnected', disconnectedHandlers[index]);
        source.removeEventListener('select', selectHandlers[index]);
        source.removeFromParent();
      });
      handCursor.removeFromParent();
      ray.removeFromParent();
      handCursor.material.dispose();
      handTexture.dispose();
      ray.geometry.dispose();
      (ray.material as THREE.Material).dispose();
      panel.removeFromParent();
      panel.geometry.dispose();
      (panel.material as THREE.Material).dispose();
      texture.dispose();
    },
  };
}
