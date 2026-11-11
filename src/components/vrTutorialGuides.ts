import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
import type { StickHand } from './virtualDrumsticks';

// The local models and profile are the meta-quest-touch-plus assets from @webxr-input-profiles/assets 1.0.20.
const ASSETS = `${import.meta.env.BASE_URL}vr/tutorial/touch-plus/`;
const HANDS = ['left', 'right'] as const;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
type GripNodes = { button: THREE.Mesh; value: THREE.Object3D; min: THREE.Object3D; max: THREE.Object3D };
type Profile = {
  layouts: Record<StickHand, { assetPath: string; components: Record<'xr-standard-squeeze', {
    visualResponses: Record<'xr_standard_squeeze_pressed', { valueNodeName: string; minNodeName: string; maxNodeName: string }>;
  }> }>;
};

function guideLine(name: string) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xd6dde8, transparent: true, depthWrite: false }));
  line.name = name;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function setLine(line: ReturnType<typeof guideLine>, from: THREE.Vector3, to: THREE.Vector3, opacity: number) {
  const positions = line.geometry.getAttribute('position');
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, to.x, to.y, to.z);
  positions.needsUpdate = true;
  line.material.opacity = opacity;
  line.visible = opacity > .01;
}

function disposeModel(model: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  materials.forEach(material => {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
}

export function createVRTutorialGuides(scene: THREE.Scene) {
  const makeGuide = (hand: StickHand) => {
    const root = new THREE.Group();
    root.name = `vr-tutorial-controller-${hand}`;
    root.visible = false;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.007, .004, .30, 12),
      new THREE.MeshBasicMaterial({ color: 0xd9dce2, transparent: true, depthWrite: false, toneMapped: false }));
    stick.name = hand === 'right' ? 'vr-tutorial-demo-stick' : 'vr-tutorial-demo-stick-left';
    stick.visible = false;
    const line = guideLine(`vr-tutorial-guide-line-${hand}`);
    scene.add(root, stick, line);
    return { root, stick, line, nodes: null as GripNodes | null, originalButton: null as THREE.Material | THREE.Material[] | null,
      materials: new Map<THREE.Material, number>(), buttonCenter: new THREE.Vector3(),
      accent: new THREE.MeshBasicMaterial({ color: 0xe4e9f2, transparent: true, depthWrite: false, toneMapped: false }) };
  };
  const guides = { left: makeGuide('left'), right: makeGuide('right') };
  const ring = new THREE.Mesh(new THREE.RingGeometry(.015, .018, 36),
    new THREE.MeshBasicMaterial({ color: 0xf3f6ff, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide }));
  ring.name = 'vr-tutorial-grip';
  ring.renderOrder = 1004;
  ring.visible = false;
  scene.add(ring);
  const head = new THREE.Vector3(), tip = new THREE.Vector3(), direction = new THREE.Vector3(), from = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  let loading = false, disposed = false;

  function load() {
    if (loading || disposed) return;
    loading = true;
    void Promise.all([import('three/addons/loaders/GLTFLoader.js'),
      fetch(`${ASSETS}profile.json`).then(async response => {
        if (!response.ok) throw new Error(`Touch Plus profile HTTP ${response.status}`);
        return await response.json() as Profile;
      })]).then(async ([{ GLTFLoader }, profile]) => {
      const loader = new GLTFLoader();
      await Promise.all(HANDS.map(async hand => {
        const layout = profile.layouts[hand];
        const response = layout.components['xr-standard-squeeze'].visualResponses.xr_standard_squeeze_pressed;
        const { scene: model } = await loader.loadAsync(`${ASSETS}${layout.assetPath}`);
        if (disposed) { disposeModel(model); return; }
        const value = model.getObjectByName(response.valueNodeName);
        const min = model.getObjectByName(response.minNodeName);
        const max = model.getObjectByName(response.maxNodeName);
        const button = value?.getObjectByName('squeeze');
        if (!(button instanceof THREE.Mesh) || !value || !min || !max) {
          disposeModel(model);
          throw new Error(`Touch Plus ${hand} Grip response nodes missing`);
        }
        const guide = guides[hand];
        guide.root.add(model);
        guide.nodes = { button, value, min, max };
        guide.originalButton = button.material;
        button.geometry.computeBoundingBox();
        button.geometry.boundingBox?.getCenter(guide.buttonCenter);
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material])
            guide.materials.set(material, material.opacity);
        });
      }));
    }).catch(error => {
      console.warn('[DRUM UP TUTORIAL] Touch Plus guide unavailable', error);
    });
  }

  function show(hand: StickHand, opacity: number, grip: boolean, press = 0) {
    const guide = guides[hand];
    guide.root.visible = opacity > .01;
    for (const [material, original] of guide.materials) {
      material.transparent = true;
      material.depthWrite = opacity >= .99;
      material.opacity = original * opacity;
    }
    if (guide.nodes && guide.originalButton) {
      const { button, value, min, max } = guide.nodes;
      button.material = grip ? guide.accent : guide.originalButton;
      guide.accent.opacity = opacity;
      value.position.lerpVectors(min.position, max.position, press);
      value.quaternion.slerpQuaternions(min.quaternion, max.quaternion, press);
    }
    return guide;
  }

  return {
    load,
    hide() {
      for (const { root, stick, line } of Object.values(guides)) root.visible = stick.visible = line.visible = false;
      ring.visible = false;
    },
    stroke(hand: StickHand, surface: DrumHitSurface, lift: number, opacity: number, idle = false) {
      const guide = show(hand, opacity, false);
      head.set(0, surface.height + .014, 0);
      surface.mesh.localToWorld(head);
      tip.copy(head);
      tip.y += .22 * lift + (idle ? .12 : 0);
      tip.z += .035 * lift;
      if (idle) {
        tip.x = head.x * .48 + (hand === 'left' ? -.20 : .20);
        tip.z -= .15;
      }
      const inward = tip.x < -.18 ? -.72 : tip.x > .18 ? .72 : hand === 'right' ? -.34 : .34;
      direction.set(inward, -.20 - .38 * lift, -.60).normalize();
      guide.root.scale.setScalar(1);
      guide.root.position.copy(tip).addScaledVector(direction, -.31);
      guide.root.quaternion.setFromUnitVectors(FORWARD, direction);
      guide.stick.position.copy(tip).addScaledVector(direction, -.15);
      guide.stick.quaternion.setFromUnitVectors(UP, from.copy(direction).negate());
      guide.stick.visible = opacity > .01;
      guide.stick.material.opacity = opacity * .76;
      if (!idle) setLine(guide.line, guide.root.position, head, opacity * .45);
    },
    grip(hand: StickHand, eye: THREE.Vector3, rotation: THREE.Quaternion, press: number, opacity: number) {
      const guide = show(hand, opacity, true, press);
      const side = hand === 'left' ? -1 : 1;
      forward.copy(FORWARD).applyQuaternion(rotation);
      forward.y = 0;
      if (forward.lengthSq() < .01) forward.copy(FORWARD);
      forward.normalize();
      right.crossVectors(forward, UP);
      guide.root.position.copy(eye).addScaledVector(forward, 1.12).addScaledVector(right, side * .34);
      guide.root.position.y -= .21;
      guide.root.scale.setScalar(1.7);
      direction.subVectors(eye, guide.root.position);
      const yaw = Math.atan2(direction.x, direction.z) - Math.atan2(-side, .35);
      guide.root.rotation.set(.13, yaw, side * .18, 'YXZ');
      if (!guide.nodes || opacity <= .01) return;
      tip.copy(guide.buttonCenter);
      guide.nodes.button.localToWorld(tip);
      direction.subVectors(eye, tip).normalize();
      ring.position.copy(tip).addScaledVector(direction, .027);
      ring.lookAt(eye);
      ring.scale.setScalar(1 + .16 * press);
      ring.material.opacity = opacity * (.72 + .25 * press);
      ring.visible = true;
      from.copy(ring.position).addScaledVector(right, -side * .11);
      from.y += .07;
      setLine(guide.line, from, ring.position, opacity * .72);
    },
    dispose() {
      disposed = true;
      for (const guide of Object.values(guides)) {
        if (guide.nodes && guide.originalButton) guide.nodes.button.material = guide.originalButton;
        disposeModel(guide.root);
        guide.accent.dispose();
        for (const mesh of [guide.root, guide.stick, guide.line]) mesh.removeFromParent();
        guide.stick.geometry.dispose(); guide.stick.material.dispose();
        guide.line.geometry.dispose(); guide.line.material.dispose();
      }
      ring.removeFromParent();
      ring.geometry.dispose();
      ring.material.dispose();
    },
  };
}
