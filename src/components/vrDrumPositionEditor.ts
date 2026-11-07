import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
import type { createVRDrumLayout } from './vrDrumLayout';

export function createVRDrumPositionEditor(scene: THREE.Scene, xr: THREE.WebXRManager, rig: THREE.Group,
  layout: ReturnType<typeof createVRDrumLayout>, surfaces: DrumHitSurface[], targets: THREE.Object3D[],
  callbacks: { onMenu: (open: boolean) => void }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 480;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  panel.name = 'vr-drum-position-settings'; panel.renderOrder = 1005; panel.visible = false;
  panel.userData.editing = false;
  scene.add(panel);
  let open = false, editing = false, rotate = false, placed = false, status = '';
  let hoveredRow = -2, pressedRow = -2, pressedUntil = 0;
  const panelTop = new THREE.Vector3(), panelUp = new THREE.Vector3(0, 1, 0);
  const placePanel = () => panel.position.copy(panelTop).addScaledVector(panelUp, -panel.scale.y / 2);
  function draw() {
    canvas.height = open ? 560 : 80;
    panel.scale.set(.58, .58 * canvas.height / 512, 1);
    if (placed) placePanel();
    context.fillStyle = '#101114'; context.fillRect(0, 0, 512, canvas.height);
    if (hoveredRow === -1 || pressedRow === -1) {
      context.fillStyle = pressedRow === -1 ? '#465362' : '#26313d';
      context.fillRect(4, 4, 504, 72);
    }
    context.strokeStyle = hoveredRow !== -2 ? '#eef1f5' : '#87909b'; context.lineWidth = 3;
    context.strokeRect(2, 2, 508, canvas.height - 4);
    context.fillStyle = '#eef1f5'; context.textAlign = 'center'; context.font = '600 30px Arial';
    context.fillText(open && editing ? 'DRUM POSITION EDIT' : 'SETTINGS', 256, 49);
    if (open) {
      const labels = [editing ? `MODE: ${rotate ? 'ROTATE' : 'MOVE'}` : 'DRUM POSITION EDIT',
        'SAVE POSITION', 'RESET POSITION', 'DONE', 'CLOSE'];
      labels.forEach((label, index) => {
        if (hoveredRow === index || pressedRow === index) {
          context.fillStyle = pressedRow === index ? '#465362' : '#26313d';
          context.fillRect(20, 80 + index * 80, 472, 65);
        }
        context.strokeStyle = '#64717f'; context.strokeRect(20, 80 + index * 80, 472, 65);
        context.font = '600 28px Arial'; context.fillStyle = '#eef1f5';
        context.fillText(label, 256, 123 + index * 80);
      });
      context.font = '20px Arial'; context.fillStyle = '#b6c1cc';
      context.fillText(status || (editing ? 'Point · hold Trigger · move · release' : 'Individual drum and stand placement'), 256, 523, 480);
      context.fillText('DRUM INPUT PAUSED · DONE TO PLAY', 256, 550);
    }
    texture.needsUpdate = true;
  }
  draw();
  const raycaster = new THREE.Raycaster();
  const world = new THREE.Matrix4(), rotation = new THREE.Matrix4();
  const point = new THREE.Vector3(), controllerPosition = new THREE.Vector3();
  const controllerRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  const deltaRotation = new THREE.Quaternion();
  const rayForward = new THREE.Vector3(0, 0, -1);
  const held = new Set<XRInputSource>();
  const triggerDown = new Map<XRInputSource, boolean>();
  const handledSelect = new Set<XRInputSource>();
  let inputSession: XRSession | null = null;
  const grabs = new Map<XRInputSource, { root: THREE.Object3D; offset: THREE.Vector3;
    controller: THREE.Quaternion; rotation: THREE.Quaternion; rotate: boolean }>();
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xdce7f0, transparent: true, opacity: .65, depthTest: false });
  const dotGeometry = new THREE.SphereGeometry(.007, 8, 6);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, toneMapped: false });
  const dots: THREE.Mesh[] = [];
  const rays = Array.from({ length: 4 }, (_, index) => {
    const ray = new THREE.Line(lineGeometry, lineMaterial);
    ray.name = `drum-position-ray-${index}`; ray.visible = false; ray.renderOrder = 1006;
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.name = `drum-position-pointer-${index}`; dot.visible = false; dot.renderOrder = 1007;
    dots.push(dot); scene.add(ray, dot); return ray;
  });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthTest: false });
  const outlines = new Map(surfaces.map(surface => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const line = new THREE.LineLoop(geometry, outlineMaterial);
    line.name = `drum-position-outline-${surface.id}`; line.visible = false; line.renderOrder = 10;
    scene.add(line); return [surface.id, { line, surface }] as const;
  }));
  function releaseAll() { grabs.clear(); held.clear(); handledSelect.clear(); triggerDown.clear(); }
  function setOpen(value: boolean) { open = value; callbacks.onMenu(open); draw(); }
  function setEditing(value: boolean) {
    if (editing === value) return;
    grabs.clear(); editing = value; panel.userData.editing = value; status = '';
    draw();
  }
  function castInput(input: XRInputSource, frame: XRFrame) {
    const reference = xr.getReferenceSpace();
    if (!panel.visible || inputSession?.visibilityState !== 'visible' || input.hand || !input.gripSpace
      || input.targetRayMode !== 'tracked-pointer' || !reference) return false;
    const pose = frame.getPose(input.targetRaySpace, reference);
    if (!pose || pose.emulatedPosition) return false;
    rig.updateWorldMatrix(true, false);
    world.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld);
    rotation.extractRotation(world);
    raycaster.ray.origin.setFromMatrixPosition(world);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return true;
  }
  function moveGrab(grab: NonNullable<ReturnType<typeof grabs.get>>, matrix: THREE.Matrix4) {
    if (grab.rotate) {
      controllerRotation.setFromRotationMatrix(rotation.extractRotation(matrix));
      deltaRotation.copy(controllerRotation).multiply(grab.controller).multiply(grab.rotation);
      grab.root.parent!.getWorldQuaternion(parentRotation).invert();
      grab.root.quaternion.copy(parentRotation.multiply(deltaRotation));
    } else {
      controllerPosition.setFromMatrixPosition(matrix).add(grab.offset);
      grab.root.position.copy(grab.root.parent!.worldToLocal(controllerPosition));
    }
    grab.root.updateWorldMatrix(true, true);
  }
  const menuHit = () => {
    if (!panel.visible) return;
    // UI can resize/reposition between XR frames. Raycast its current matrix.
    panel.updateWorldMatrix(true, false);
    return raycaster.intersectObject(panel, false)[0];
  };
  const rootAtRay = () => {
    const hit = raycaster.intersectObjects(targets, false)[0];
    let root: THREE.Object3D | null = hit?.object ?? null;
    while (root && !root.userData.positionEditRoot) root = root.parent;
    return { hit, root };
  };
  function rowAt(uv: THREE.Vector2) {
    if (!open) return -1;
    const y = (1 - uv.y) * canvas.height;
    if (uv.x < 20 / 512 || uv.x > 492 / 512) return -2;
    const row = Math.floor((y - 80) / 80);
    return row >= 0 && row <= 4 && (y - 80) % 80 <= 65 ? row : -2;
  }
  function menuAction(uv: THREE.Vector2) {
    const row = rowAt(uv);
    if (row === -2) return;
    pressedRow = row; pressedUntil = performance.now() + 140;
    if (!open) { setOpen(true); return; }
    if (row === 0) {
      if (!editing) setEditing(true);
      else { grabs.clear(); rotate = !rotate; draw(); }
    } else if (row === 1) {
      grabs.clear(); status = layout.save() ? 'POSITION SAVED' : 'SAVE UNAVAILABLE · browser storage'; draw();
    } else if (row === 2) {
      grabs.clear(); layout.reset(); status = 'DEFAULT POSITION RESTORED';
      // The whole SETTINGS session is paused; commit targets on DONE.
      draw();
    } else { setEditing(false); setOpen(false); }
  }
  function begin(input: XRInputSource, frame: XRFrame) {
    if (held.has(input) || !castInput(input, frame)) return;
    held.add(input); handledSelect.add(input);
    const menu = menuHit();
    if (menu?.uv) { menuAction(menu.uv); return; }
    if (!editing) return;
    const { root } = rootAtRay();
    if (!root || [...grabs.values()].some(grab => grab.root === root)) return;
    grabs.set(input, { root, offset: root.getWorldPosition(new THREE.Vector3()).sub(raycaster.ray.origin),
      controller: new THREE.Quaternion().setFromRotationMatrix(rotation.extractRotation(world)).invert(),
      rotation: root.getWorldQuaternion(new THREE.Quaternion()), rotate });
  }
  function finish(input: XRInputSource, frame: XRFrame) {
    const grab = grabs.get(input);
    if (editing && grab && castInput(input, frame)) moveGrab(grab, world);
    grabs.delete(input); held.delete(input);
  }
  const start = (event: XRInputSourceEvent) => begin(event.inputSource, event.frame);
  const end = (event: XRInputSourceEvent) => finish(event.inputSource, event.frame);
  const select = (event: XRInputSourceEvent) => {
    // Accept the same completed Trigger action as the other XR menus. A
    // selectstart + select sequence must still activate only one button.
    if (handledSelect.delete(event.inputSource) || !castInput(event.inputSource, event.frame)) return;
    const menu = menuHit();
    if (menu?.uv) menuAction(menu.uv);
  };
  const sourcesChanged = (event: XRInputSourcesChangeEvent) => {
    for (const input of event.removed) {
      grabs.delete(input); held.delete(input); handledSelect.delete(input); triggerDown.delete(input);
    }
  };
  function setSession(session: XRSession | null) {
    if (session === inputSession) return;
    inputSession?.removeEventListener('selectstart', start);
    inputSession?.removeEventListener('selectend', end);
    inputSession?.removeEventListener('select', select);
    inputSession?.removeEventListener('inputsourceschange', sourcesChanged);
    releaseAll(); inputSession = session;
    session?.addEventListener('selectstart', start);
    session?.addEventListener('selectend', end);
    session?.addEventListener('select', select);
    session?.addEventListener('inputsourceschange', sourcesChanged);
  }
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
      releaseAll(); panel.visible = false; rays.forEach(ray => { ray.visible = false; }); dots.forEach(dot => { dot.visible = false; });
      for (const { line } of outlines.values()) line.visible = false;
      if (!retain) { setEditing(false); setOpen(false); }
    },
    update(session: XRSession | null, viewer: XRViewerPose | null, frame?: XRFrame) {
      setSession(session);
      rays.forEach(ray => { ray.visible = false; });
      dots.forEach(dot => { dot.visible = false; });
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
      let nextHover = -2, cursor = 0;
      for (const input of session.inputSources) {
        if (!frame || !castInput(input, frame)) {
          grabs.delete(input); held.delete(input); triggerDown.delete(input); continue;
        }
        // Read Quest's live XR gamepad, not navigator.getGamepads(). Native
        // events and this edge detector share begin/finish and the held guard.
        const knownMapping = (input.gamepad?.mapping as string | undefined) === 'xr-standard'
          || input.profiles.some(profile => /^(meta-quest-touch|oculus-touch|generic-trigger)/.test(profile));
        const button = knownMapping ? input.gamepad?.buttons[0] : undefined;
        if (button) {
          const wasDown = triggerDown.get(input) ?? false;
          const down = button.pressed || button.value >= (wasDown ? .4 : .75);
          if (down && !wasDown) begin(input, frame);
          else if (!down && wasDown) finish(input, frame);
          triggerDown.set(input, down);
          // A menu activation can resize its panel; restore this input's ray.
          castInput(input, frame);
        }
        const grab = grabs.get(input);
        if (editing && grab) {
          moveGrab(grab, world);
          updateOutline(grab.root.userData.positionEditRoot);
        }
        const menu = menuHit();
        if (menu?.uv && rowAt(menu.uv) !== -2) nextHover = rowAt(menu.uv);
        const hit = editing && !menu ? rootAtRay() : undefined;
        if (hit?.root) updateOutline(hit.root.userData.positionEditRoot);
        if (editing || menu) {
          const ray = rays[cursor], dot = dots[cursor];
          if (ray) {
            ray.position.copy(raycaster.ray.origin);
            ray.quaternion.setFromUnitVectors(rayForward, raycaster.ray.direction);
            ray.visible = true; ray.scale.z = menu?.distance ?? hit?.hit?.distance ?? 2;
            if (menu) { dot.position.copy(menu.point); dot.visible = true; }
            cursor++;
          }
        }
      }
      const expired = pressedRow !== -2 && performance.now() >= pressedUntil;
      if (expired) pressedRow = -2;
      if (nextHover !== hoveredRow || expired) { hoveredRow = nextHover; draw(); }
      panel.userData.hoveredRow = hoveredRow;
      panel.userData.pressedRow = pressedRow;
    },
    dispose() {
      setSession(null);
      rays.forEach(ray => ray.removeFromParent());
      for (const { line } of outlines.values()) { line.removeFromParent(); line.geometry.dispose(); }
      outlineMaterial.dispose(); lineMaterial.dispose(); lineGeometry.dispose();
      dots.forEach(dot => dot.removeFromParent()); dotGeometry.dispose(); dotMaterial.dispose();
      panel.removeFromParent(); panel.geometry.dispose(); panel.material.dispose(); texture.dispose();
      releaseAll();
    },
  };
}
