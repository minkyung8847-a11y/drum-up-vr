import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
import type { createVRDrumLayout } from './vrDrumLayout';

export function createVRDrumPositionEditor(scene: THREE.Scene, xr: THREE.WebXRManager, rig: THREE.Group,
  layout: ReturnType<typeof createVRDrumLayout>, surfaces: DrumHitSurface[], targets: THREE.Object3D[],
  callbacks: { onEditing: (active: boolean) => void; onMenu: (open: boolean) => void }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 480;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  panel.name = 'vr-drum-position-settings'; panel.renderOrder = 1005; panel.visible = false;
  scene.add(panel);
  let open = false, editing = false, rotate = false, placed = false, status = '';
  const panelTop = new THREE.Vector3(), panelUp = new THREE.Vector3(0, 1, 0);
  const placePanel = () => panel.position.copy(panelTop).addScaledVector(panelUp, -panel.scale.y / 2);
  function draw() {
    canvas.height = open ? 480 : 80;
    panel.scale.set(.58, .58 * canvas.height / 512, 1);
    if (placed) placePanel();
    context.fillStyle = '#101114'; context.fillRect(0, 0, 512, canvas.height);
    context.strokeStyle = '#87909b'; context.lineWidth = 3;
    context.strokeRect(2, 2, 508, canvas.height - 4);
    context.fillStyle = '#eef1f5'; context.textAlign = 'center'; context.font = '600 30px Arial';
    context.fillText(open && editing ? 'DRUM POSITION EDIT' : 'SETTINGS', 256, 49);
    if (open) {
      const labels = [editing ? `MODE: ${rotate ? 'ROTATE' : 'MOVE'}` : 'DRUM POSITION EDIT',
        'SAVE POSITION', 'RESET POSITION', 'DONE'];
      labels.forEach((label, index) => {
        context.strokeStyle = '#64717f'; context.strokeRect(20, 80 + index * 80, 472, 65);
        context.font = '600 28px Arial'; context.fillStyle = '#eef1f5';
        context.fillText(label, 256, 123 + index * 80);
      });
      context.font = '20px Arial'; context.fillStyle = '#b6c1cc';
      context.fillText(status || (editing ? 'Point · hold Trigger · move · release' : 'Individual drum and stand placement'), 256, 443, 480);
      context.fillText('GRIP assignments are unchanged', 256, 470);
    }
    texture.needsUpdate = true;
  }
  draw();
  const raycaster = new THREE.Raycaster();
  const world = new THREE.Matrix4(), rotation = new THREE.Matrix4();
  const point = new THREE.Vector3(), controllerPosition = new THREE.Vector3();
  const controllerRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  const deltaRotation = new THREE.Quaternion();
  const bindings = new Map<XRInputSource, ReturnType<typeof xr.getController>>();
  const controllers = [0, 1, 2, 3].map(index => xr.getController(index));
  const held = new Set<XRInputSource>();
  const grabs = new Map<XRInputSource, { root: THREE.Object3D; offset: THREE.Vector3;
    controller: THREE.Quaternion; rotation: THREE.Quaternion; rotate: boolean }>();
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xdce7f0, transparent: true, opacity: .65, depthTest: false });
  const rays = controllers.map((source, index) => {
    const ray = new THREE.Line(lineGeometry, lineMaterial);
    ray.name = `drum-position-ray-${index}`; ray.visible = false; ray.renderOrder = 1006; source.add(ray); return ray;
  });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthTest: false });
  const outlines = new Map(surfaces.map(surface => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const line = new THREE.LineLoop(geometry, outlineMaterial);
    line.name = `drum-position-outline-${surface.id}`; line.visible = false; line.renderOrder = 10;
    scene.add(line); return [surface.id, { line, surface }] as const;
  }));
  function releaseAll() { grabs.clear(); held.clear(); }
  function setOpen(value: boolean) { open = value; callbacks.onMenu(open); draw(); }
  function setEditing(value: boolean) {
    if (editing === value) return;
    releaseAll(); editing = value; status = '';
    callbacks.onEditing(value); draw();
  }
  function cast(source: THREE.Group) {
    source.updateWorldMatrix(true, false);
    rotation.extractRotation(source.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
  }
  function moveGrab(grab: NonNullable<ReturnType<typeof grabs.get>>, source: THREE.Group) {
    if (grab.rotate) {
      source.getWorldQuaternion(controllerRotation);
      deltaRotation.copy(controllerRotation).multiply(grab.controller).multiply(grab.rotation);
      grab.root.parent!.getWorldQuaternion(parentRotation).invert();
      grab.root.quaternion.copy(parentRotation.multiply(deltaRotation));
    } else {
      source.getWorldPosition(controllerPosition).add(grab.offset);
      grab.root.position.copy(grab.root.parent!.worldToLocal(controllerPosition));
    }
    grab.root.updateWorldMatrix(true, true);
  }
  const menuHit = () => panel.visible ? raycaster.intersectObject(panel, false)[0] : undefined;
  const rootAtRay = () => {
    const hit = raycaster.intersectObjects(targets, false)[0];
    let root: THREE.Object3D | null = hit?.object ?? null;
    while (root && !root.userData.positionEditRoot) root = root.parent;
    return { hit, root };
  };
  function menuAction(uv: THREE.Vector2) {
    const y = (1 - uv.y) * canvas.height;
    if (!open) { setOpen(true); return; }
    if (uv.x < 20 / 512 || uv.x > 492 / 512) return;
    const row = Math.floor((y - 80) / 80);
    if (row < 0 || row > 3 || (y - 80) % 80 > 65) return;
    if (row === 0) {
      if (!editing) setEditing(true);
      else { grabs.clear(); rotate = !rotate; draw(); }
    } else if (row === 1) {
      grabs.clear(); status = layout.save() ? 'POSITION SAVED' : 'SAVE UNAVAILABLE · browser storage'; draw();
    } else if (row === 2) {
      grabs.clear(); layout.reset(); status = 'DEFAULT POSITION RESTORED';
      // Outside edit mode, use the same pause/retarget/resume transaction.
      if (!editing) { callbacks.onEditing(true); callbacks.onEditing(false); }
      draw();
    } else { setEditing(false); setOpen(false); }
  }
  const listeners = controllers.map(source => {
    const connected = (event: { data: XRInputSource }) => { bindings.set(event.data, source); };
    const disconnected = (event: { data: XRInputSource }) => { grabs.delete(event.data); held.delete(event.data); bindings.delete(event.data); };
    const start = (event: { data: XRInputSource }) => {
      const input = event.data;
      if (!panel.visible || xr.getSession()?.visibilityState !== 'visible' || input.hand || !input.gripSpace
        || input.targetRayMode !== 'tracked-pointer' || !source.visible || held.has(input)) return;
      held.add(input); cast(source);
      const menu = menuHit();
      if (menu?.uv) { menuAction(menu.uv); return; }
      if (!editing) return;
      const { root } = rootAtRay();
      if (!root || [...grabs.values()].some(grab => grab.root === root)) return;
      grabs.set(input, { root, offset: root.getWorldPosition(new THREE.Vector3()).sub(raycaster.ray.origin),
        controller: source.getWorldQuaternion(new THREE.Quaternion()).invert(),
        rotation: root.getWorldQuaternion(new THREE.Quaternion()), rotate });
    };
    const end = (event: { data: XRInputSource }) => {
      const grab = grabs.get(event.data);
      if (editing && grab && source.visible) moveGrab(grab, source);
      grabs.delete(event.data); held.delete(event.data);
    };
    source.addEventListener('connected', connected); source.addEventListener('disconnected', disconnected);
    source.addEventListener('selectstart', start); source.addEventListener('selectend', end);
    return { connected, disconnected, start, end };
  });
  function updateOutline(id: string) {
    const outline = outlines.get(id); if (!outline) return;
    const { line, surface } = outline;
    surface.mesh.updateWorldMatrix(true, false);
    const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < 64; index++) {
      const angle = index / 64 * Math.PI * 2;
      point.set(Math.cos(angle) * surface.radius, surface.height + .012, Math.sin(angle) * surface.radius)
        .applyMatrix4(surface.mesh.matrixWorld);
      attribute.setXYZ(index, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true; line.geometry.computeBoundingSphere(); line.visible = true;
  }
  return {
    panel,
    isEditing: () => editing,
    isOpen: () => open,
    show() { panel.visible = true; placed = false; },
    hide(retain = false) {
      releaseAll(); panel.visible = false; rays.forEach(ray => { ray.visible = false; });
      for (const { line } of outlines.values()) line.visible = false;
      if (!retain) { setEditing(false); setOpen(false); }
    },
    update(session: XRSession | null, viewer: XRViewerPose | null, frame?: XRFrame) {
      rays.forEach(ray => { ray.visible = false; });
      for (const { line } of outlines.values()) line.visible = false;
      if (!panel.visible || session?.visibilityState !== 'visible' || !viewer) { releaseAll(); return; }
      if (!placed) {
        rig.updateWorldMatrix(true, false);
        world.fromArray(viewer.transform.matrix).premultiply(rig.matrixWorld);
        // Expand downward beside the existing mode UI, above the drum heads.
        panelTop.set(1.08, .42, -1.5).applyMatrix4(world);
        panel.quaternion.setFromRotationMatrix(world);
        panelUp.set(0, 1, 0).applyQuaternion(panel.quaternion);
        placed = true; placePanel();
      }
      const reference = xr.getReferenceSpace();
      for (const [input, source] of bindings) {
        if (input.hand || !input.gripSpace || !source.visible) { grabs.delete(input); held.delete(input); continue; }
        const pose = frame && reference ? frame.getPose(input.gripSpace, reference) : null;
        if (!pose || pose.emulatedPosition) {
          grabs.delete(input); held.delete(input); continue;
        }
        const grab = grabs.get(input);
        if (editing && grab) {
          moveGrab(grab, source);
          updateOutline(grab.root.userData.positionEditRoot);
        }
        cast(source);
        const menu = menuHit();
        const hit = editing && !menu ? rootAtRay() : undefined;
        if (hit?.root) updateOutline(hit.root.userData.positionEditRoot);
        if (editing || menu) {
          const ray = rays[controllers.indexOf(source)];
          ray.visible = true; ray.scale.z = menu?.distance ?? hit?.hit?.distance ?? 2;
        }
      }
    },
    dispose() {
      controllers.forEach((source, index) => {
        const listener = listeners[index];
        source.removeEventListener('connected', listener.connected); source.removeEventListener('disconnected', listener.disconnected);
        source.removeEventListener('selectstart', listener.start); source.removeEventListener('selectend', listener.end);
        rays[index].removeFromParent();
      });
      for (const { line } of outlines.values()) { line.removeFromParent(); line.geometry.dispose(); }
      outlineMaterial.dispose(); lineMaterial.dispose(); lineGeometry.dispose();
      panel.removeFromParent(); panel.geometry.dispose(); panel.material.dispose(); texture.dispose();
      releaseAll();
    },
  };
}
