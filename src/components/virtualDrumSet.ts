// @ts-nocheck
import * as THREE from 'three';

export const drumPositions = {
  crash: [-0.88, 1.32, 0.02],
  hihat: [-0.82, 0.94, 0.28],
  kick: [0.0, 0.36, 0.06],
  openHihat: [-0.82, 0.94, 0.28],
  ride: [0.86, 1.18, 0.1],
  snare: [-0.50, 0.72, 0.36],
  smallTom: [-0.26, 0.98, 0.02],
  middleTom: [0.26, 0.98, 0.02],
  floorTom: [0.60, 0.7, 0.32],
};

const drumColors = {
  blackShell: 0x222426,
  blackShellDark: 0x0e1011,
  chrome: 0xffffff,
  chromeDark: 0x8a8f94,
  cymbal: 0xdedfe1,
  cymbalDark: 0x93979b,
  drumHead: 0xfaf8f2,
  rubber: 0x161616,
  highlight: 0xffe6a3,
};

const PART_FLASH_COLORS = {
  crash: 0xf3cd82,
  ride: 0xf3cd82,
  hihat: 0xf4a7b9,
  openHihat: 0xf4a7b9,
  snare: 0x95c2de,
  kick: 0x98d9c2,
  smallTom: 0xaf78db,
  middleTom: 0x708ee6,
  floorTom: 0xe98862,
};

export function createVirtualDrumSet(scene) {
  const group = new THREE.Group();
  const parts = new Map();
  const effects = [];
  const raycastTargets = [];
  
  let kickPedalBoard = null;
  let kickBeaterGroup = null;
  let kickPedalTimer = 0;
  let kickPedalPower = 0;

  const shellTexture = createBrushedTexture('#17191b', '#5f6261', 512, 256, 'vertical');
  const cymbalTexture = createCymbalTexture();

  const shellMat = new THREE.MeshStandardMaterial({
    color: drumColors.blackShell,
    map: shellTexture,
    metalness: 0.62,
    roughness: 0.28,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: drumColors.drumHead,
    roughness: 0.72,
    metalness: 0.02,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: drumColors.chrome,
    metalness: 0.95,
    roughness: 0.13,
    side: THREE.DoubleSide, // Support inside-out view for open cylinders
  });
  const darkChromeMat = new THREE.MeshStandardMaterial({
    color: drumColors.chromeDark,
    metalness: 0.9,
    roughness: 0.18,
    side: THREE.DoubleSide,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: drumColors.rubber,
    roughness: 0.78,
  });
  const cymbalMat = new THREE.MeshStandardMaterial({
    color: drumColors.cymbal,
    map: cymbalTexture,
    metalness: 0.72,
    roughness: 0.34,
  });

  createBassDrum('kick', [0, 0.39, 0.08]);
  createTom('snare', drumPositions.snare, 0.24, 0.16, { tiltX: 0.08, tiltZ: -0.06, legStyle: 'stand' });
  createTom('smallTom', drumPositions.smallTom, 0.2, 0.24, { tiltX: 0.16, tiltZ: 0.12, mountToBass: true });
  createTom('middleTom', drumPositions.middleTom, 0.22, 0.26, { tiltX: 0.14, tiltZ: -0.1, mountToBass: true });
  createTom('floorTom', drumPositions.floorTom, 0.24, 0.36, { tiltX: 0.04, tiltZ: -0.04, legStyle: 'floor' });
  createCymbal('hihat', drumPositions.hihat, 0.21, { stacked: true, standHeight: 0.95 });
  createCymbal('crash', drumPositions.crash, 0.29, { standHeight: 1.33, tiltX: 0.18, tiltZ: -0.1 });
  createCymbal('ride', drumPositions.ride, 0.3, { standHeight: 1.18, tiltX: 0.16, tiltZ: 0.1 });
  createKickPedal();
  createHihatPedal();

  scene.add(group);

  function createTom(name, position, radius, depth, options = {}) {
    const drum = new THREE.Group();
    drum.position.set(...position);
    drum.rotation.set(options.tiltX ?? 0, 0, options.tiltZ ?? 0);

    const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 72, 1, true), shellMat);
    shell.position.y = -depth / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.userData.drumType = name;
    drum.add(shell);

    const topHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, 0.014, 72),
      headMat.clone(),
    );
    topHead.position.y = 0.006;
    topHead.castShadow = true;
    topHead.receiveShadow = true;
    topHead.userData.drumType = name;
    drum.add(topHead);

    const bottomHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.01, 72),
      new THREE.MeshStandardMaterial({ color: 0xd9d6c8, roughness: 0.78 }),
    );
    bottomHead.position.y = -depth - 0.004;
    bottomHead.userData.drumType = name;
    drum.add(bottomHead);

    addHoop(drum, radius, 0.018, 0.018, 0.014);
    addHoop(drum, radius, -depth - 0.006, 0.016, 0.012);
    addLugs(drum, name, radius, depth, options.legStyle === 'floor' ? 8 : 6);

    if (options.mountToBass) {
      addTomMount(position, radius);
    }
    if (options.legStyle === 'floor') {
      addFloorTomLegs(drum, radius, depth);
    }
    if (options.legStyle === 'stand') {
      addSnareStand(position, radius);
    }

    group.add(drum);
    drum.userData.drumType = name;
    parts.set(name, {
      group: drum,
      headMesh: topHead,
      flashMesh: topHead,
      baseGroupY: drum.position.y,
      baseHeadY: topHead.position.y,
      baseHeadScale: topHead.scale.clone(),
      depression: 0,
      depressVelocity: 0,
      bodyPunch: 0,
      bodyPunchVelocity: 0,
      scaleY: 1,
      scaleYVelocity: 0,
      flash: 0,
      isCymbal: false,
      isKick: false,
      isTom: name === 'smallTom' || name === 'middleTom' || name === 'floorTom',
    });
    raycastTargets.push(shell, topHead, bottomHead);
  }

  function createBassDrum(name, position) {
    const drum = new THREE.Group();
    drum.position.set(...position);
    drum.rotation.x = Math.PI / 2;

    const radius = 0.38;
    const depth = 0.38;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 96, 1, true), shellMat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.userData.drumType = name;
    drum.add(shell);

    const frontHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, 0.018, 96),
      new THREE.MeshStandardMaterial({ color: 0xe2dfd1, roughness: 0.82 }),
    );
    frontHead.position.y = depth / 2 + 0.012;
    frontHead.userData.drumType = name;
    drum.add(frontHead);

    const rearHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, 0.016, 96),
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.65 }),
    );
    rearHead.position.y = -depth / 2 - 0.012;
    rearHead.userData.drumType = name;
    drum.add(rearHead);

    addHoop(drum, radius, depth / 2 + 0.028, 0.024, 0.018);
    addHoop(drum, radius, -depth / 2 - 0.028, 0.024, 0.018);
    addBassLugs(drum, radius, depth);
    addBassSpurs(position, radius);

    group.add(drum);
    drum.userData.drumType = name;
    parts.set(name, {
      group: drum,
      headMesh: frontHead,
      flashMesh: frontHead,
      baseGroupY: drum.position.y,
      baseHeadY: frontHead.position.y,
      baseHeadScale: frontHead.scale.clone(),
      depression: 0,
      depressVelocity: 0,
      bodyPunch: 0,
      bodyPunchVelocity: 0,
      scaleY: 1,
      scaleYVelocity: 0,
      flash: 0,
      isCymbal: false,
      isKick: true,
      isTom: false,
    });
    raycastTargets.push(shell, frontHead, rearHead);
  }

  function createCymbal(name, position, radius, options = {}) {
    const standHeight = options.standHeight ?? position[1];
    const standX = position[0];
    const standZ = position[2];
    addCymbalStand(standX, standZ, standHeight, radius);

    const cymbal = new THREE.Group();
    cymbal.position.set(...position);
    cymbal.rotation.set(options.tiltX ?? 0.08, 0, options.tiltZ ?? 0);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.96, 0.012, 96), cymbalMat.clone());
    body.scale.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.drumType = name;
    cymbal.add(body);

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.22, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      cymbalMat.clone(),
    );
    bell.scale.y = 0.38;
    bell.position.y = 0.012;
    bell.userData.drumType = name;
    cymbal.add(bell);

    const felt = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.018, 24), rubberMat);
    felt.position.y = 0.025;
    cymbal.add(felt);

    const wingNut = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.016), chromeMat);
    wingNut.position.y = 0.043;
    cymbal.add(wingNut);

    if (options.stacked) {
      const lower = body.clone();
      lower.position.y = -0.035;
      lower.rotation.x = Math.PI;
      lower.userData.drumType = name;
      cymbal.add(lower);
      raycastTargets.push(lower);
    }

    group.add(cymbal);
    cymbal.userData.drumType = name;
    parts.set(name, {
      group: cymbal,
      flashMesh: body,
      baseGroupY: cymbal.position.y,
      baseRotation: cymbal.rotation.clone(),
      swingAngleX: 0,
      swingAngleZ: 0,
      swingVelocityX: 0,
      swingVelocityZ: 0,
      bodyPunch: 0,
      bodyPunchVelocity: 0,
      scaleY: 1,
      scaleYVelocity: 0,
      wobbleTime: 0,
      flash: 0,
      isCymbal: true,
      isKick: false,
    });
    raycastTargets.push(body, bell);
  }

  function addHoop(parent, radius, y, tubeRadius, metalRadius) {
    // Sharp metal band hoop wrapping the drum cylinder
    const height = Math.abs(tubeRadius) * 2; // e.g. ~0.035
    const hoop = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.005, radius + 0.005, height, 72, 1, true),
      chromeMat
    );
    hoop.position.y = y;
    hoop.castShadow = true;
    parent.add(hoop);

    // Inner sharp metal shadow ring
    const innerShadow = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.002, radius + 0.002, height * 0.5, 72, 1, true),
      darkChromeMat
    );
    innerShadow.position.y = y - 0.002;
    parent.add(innerShadow);
  }

  function addLugs(parent, drumType, radius, depth, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * (radius + 0.014);
      const z = Math.sin(angle) * (radius + 0.014);

      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.024), chromeMat);
      lug.position.set(x, -depth * 0.45, z);
      lug.rotation.y = -angle;
      lug.castShadow = true;
      lug.userData.drumType = drumType;
      parent.add(lug);

      const rod = createPipeBetweenPoints(
        new THREE.Vector3(x, 0.01, z),
        new THREE.Vector3(x, -depth - 0.01, z),
        0.004,
        chromeMat,
      );
      rod.userData.drumType = drumType;
      parent.add(rod);
    }
  }

  function addBassLugs(parent, radius, depth) {
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const x = Math.cos(angle) * (radius + 0.016);
      const z = Math.sin(angle) * (radius + 0.016);

      [-depth / 2, depth / 2].forEach((y) => {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.032), chromeMat);
        claw.position.set(x, y, z);
        claw.rotation.y = -angle;
        claw.castShadow = true;
        claw.userData.drumType = 'kick';
        parent.add(claw);
      });

      const rod = createPipeBetweenPoints(
        new THREE.Vector3(x, -depth / 2 + 0.03, z),
        new THREE.Vector3(x, depth / 2 - 0.03, z),
        0.004,
        chromeMat,
      );
      rod.userData.drumType = 'kick';
      parent.add(rod);
    }
  }

  function addTomMount(position, radius) {
    const base = new THREE.Vector3(position[0] * 0.55, 0.78, -0.08);
    const target = new THREE.Vector3(position[0], position[1] - 0.16, position[2] - radius * 0.45);
    group.add(createPipeBetweenPoints(base, target, 0.015, chromeMat));
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), chromeMat);
    clamp.position.copy(target);
    clamp.castShadow = true;
    group.add(clamp);
  }

  function addSnareStand(position, radius) {
    const top = new THREE.Vector3(position[0], position[1] - 0.16, position[2]);
    const bottom = new THREE.Vector3(position[0], 0.08, position[2]);
    group.add(createPipeBetweenPoints(bottom, top, 0.014, chromeMat));
    addTripodFeet(new THREE.Vector3(position[0], 0.08, position[2]), 0.3);

    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.3;
      const end = new THREE.Vector3(
        position[0] + Math.cos(angle) * radius * 0.8,
        position[1] - 0.11,
        position[2] + Math.sin(angle) * radius * 0.8,
      );
      group.add(createPipeBetweenPoints(top, end, 0.006, chromeMat));
    }
  }

  function addFloorTomLegs(parent, radius, depth) {
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.2;
      const top = new THREE.Vector3(Math.cos(angle) * radius * 0.95, -depth * 0.35, Math.sin(angle) * radius * 0.95);
      const bottom = new THREE.Vector3(Math.cos(angle) * (radius + 0.1), -0.7, Math.sin(angle) * (radius + 0.1));
      parent.add(createPipeBetweenPoints(top, bottom, 0.007, chromeMat));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 8), rubberMat);
      foot.scale.set(1.25, 0.65, 1.25);
      foot.position.copy(bottom);
      parent.add(foot);
    }
  }

  function addBassSpurs(position, radius) {
    [
      [-1, -0.04],
      [1, -0.04],
    ].forEach(([side, zOffset]) => {
      const top = new THREE.Vector3(position[0] + side * radius * 0.78, 0.25, position[2] + zOffset);
      const bottom = new THREE.Vector3(position[0] + side * (radius + 0.2), 0.03, position[2] + 0.16);
      group.add(createPipeBetweenPoints(top, bottom, 0.009, chromeMat));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 8), rubberMat);
      foot.scale.set(1.45, 0.65, 1);
      foot.position.copy(bottom);
      group.add(foot);
    });
  }

  function addCymbalStand(x, z, height, radius) {
    const base = new THREE.Vector3(x, 0.05, z);
    const top = new THREE.Vector3(x, height - 0.04, z);
    group.add(createPipeBetweenPoints(base, top, 0.012, chromeMat));
    addTripodFeet(base, Math.max(0.28, radius * 1.2));

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.07, 24), chromeMat);
    sleeve.position.set(x, height * 0.55, z);
    group.add(sleeve);
  }

  function addTripodFeet(center, radius) {
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const end = new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        0.025,
        center.z + Math.sin(angle) * radius,
      );
      group.add(createPipeBetweenPoints(center, end, 0.007, chromeMat));

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.045), rubberMat);
      foot.position.copy(end);
      foot.rotation.y = -angle;
      foot.castShadow = true;
      group.add(foot);
    }
  }

  // Create kick pedal board and beater stem
  function createKickPedal() {
    const pedal = new THREE.Group();
    pedal.position.set(0, 0.04, 0.50);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.42), rubberMat);
    base.castShadow = true;
    pedal.add(base);

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.34), darkChromeMat);
    board.position.set(0, 0.03, 0.02);
    board.rotation.x = -0.18;
    pedal.add(board);
    kickPedalBoard = board;

    const beaterGroup = new THREE.Group();
    beaterGroup.position.set(0, 0.05, -0.14);

    const beaterStem = createPipeBetweenPoints(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.30, -0.06),
      0.006,
      chromeMat
    );
    beaterGroup.add(beaterStem);

    const beater = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe7e0cf, roughness: 0.5 })
    );
    beater.scale.set(1, 1.25, 0.75);
    beater.position.set(0, 0.31, -0.07);
    beaterGroup.add(beater);

    pedal.add(beaterGroup);
    kickBeaterGroup = beaterGroup;

    group.add(pedal);
  }

  function createHihatPedal() {
    const pedal = new THREE.Group();
    pedal.position.set(-0.82, 0.035, 0.52);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.34), rubberMat);
    base.castShadow = true;
    pedal.add(base);

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.28), darkChromeMat);
    board.position.set(0, 0.028, 0.02);
    board.rotation.x = -0.14;
    board.castShadow = true;
    pedal.add(board);

    group.add(pedal);
  }

  function createPipeBetweenPoints(p1, p2, radius, material) {
    const direction = new THREE.Vector3().subVectors(p2, p1);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, length / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(p1);
    mesh.lookAt(p2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function hit(drumType, velocity = 1, isLeft = true) {
    const part = parts.get(drumType === 'openHihat' ? 'hihat' : drumType);
    if (!part) return;

    part.flash = Math.max(part.flash, 0.16 + velocity * 0.14);

    if (part.isCymbal) {
      // Scale down swing/movement velocity by ~50%
      part.swingVelocityX = -(12.0 + velocity * 9.0);
      const isLeftSide = (drumType === 'crash' || drumType === 'hihat' || drumType === 'openHihat');
      part.swingVelocityZ = (isLeftSide ? 1.0 : -1.0) * (9.0 + velocity * 6.0);
      part.bodyPunchVelocity = 1.75 * velocity;
      part.scaleYVelocity = -3.25 * velocity;
    } else {
      // Scale down compression / squash velocity by ~50%
      part.depressVelocity = -(part.isTom ? 5.0 : 4.0) * velocity;
      part.bodyPunchVelocity = -(part.isTom ? 3.0 : 2.0) * velocity;
      part.scaleYVelocity = -6.0 * velocity;
      if (drumType === 'kick') {
        kickPedalTimer = 0.16;
        kickPedalPower = velocity;
      }
    }

    spawnHitEffect(part.group.position, velocity, part.isKick);
  }

  function update(delta) {
    const dt = Math.min(0.08, delta);

    if (kickPedalTimer > 0) {
      kickPedalTimer = Math.max(0, kickPedalTimer - dt);
      const amount = Math.sin(kickPedalTimer * 40) * 0.16;
      if (kickPedalBoard) {
        kickPedalBoard.rotation.x = -0.18 - Math.abs(amount) * (0.15 + kickPedalPower * 0.25);
      }
      if (kickBeaterGroup) {
        kickBeaterGroup.rotation.x = Math.abs(amount) * (0.4 + kickPedalPower * 0.4);
      }
    } else {
      if (kickPedalBoard) {
        kickPedalBoard.rotation.x = -0.18;
      }
      if (kickBeaterGroup) {
        kickBeaterGroup.rotation.x = 0;
      }
    }

    parts.forEach((part, partName) => {
      if (part.flash > 0) {
        part.flash = Math.max(0, part.flash - dt);
        if (part.flashMesh?.material) {
          const colorHex = PART_FLASH_COLORS[partName] || drumColors.highlight;
          part.flashMesh.material.emissive?.setHex(colorHex);
          part.flashMesh.material.emissiveIntensity = part.flash * 3.8;
        }
      } else if (part.flashMesh?.material) {
        part.flashMesh.material.emissive?.setHex(0x000000);
      }

      if (part.isCymbal) {
        // Lower tension and higher damping for slower, longer, more obvious swaying
        const tension = 32;
        const damping = 0.94;
        part.wobbleTime += dt;
        
        part.swingVelocityX += (0 - part.swingAngleX) * tension * dt;
        part.swingVelocityX *= Math.pow(damping, dt * 60);
        part.swingAngleX += part.swingVelocityX * dt;
        
        part.swingVelocityZ += (0 - part.swingAngleZ) * tension * dt;
        part.swingVelocityZ *= Math.pow(damping, dt * 60);
        part.swingAngleZ += part.swingVelocityZ * dt;

        part.bodyPunchVelocity += (0 - part.bodyPunch) * 22 * dt;
        part.bodyPunchVelocity *= Math.pow(0.85, dt * 60);
        part.bodyPunch += part.bodyPunchVelocity * dt;
        part.bodyPunch = Math.max(-0.045, Math.min(0.045, part.bodyPunch));
        
        part.group.rotation.x = part.baseRotation.x + part.swingAngleX;
        part.group.rotation.z = part.baseRotation.z + part.swingAngleZ;
        part.group.position.y = part.baseGroupY + part.bodyPunch;

        // Group scale animation for cymbals
        part.scaleYVelocity += (1 - part.group.scale.y) * 110 * dt;
        part.scaleYVelocity *= Math.pow(0.78, dt * 60);
        part.group.scale.y += part.scaleYVelocity * dt;
        part.group.scale.x = 1;
        part.group.scale.z = 1;
        return;
      }

      // Deeper, slower, more organic bouncing for drums
      const tension = part.isKick ? 45 : part.isTom ? 55 : 65;
      const damping = part.isKick ? 0.88 : part.isTom ? 0.84 : 0.86;
      part.depressVelocity += (0 - part.depression) * tension * dt;
      part.depressVelocity *= Math.pow(damping, dt * 60);
      part.depression += part.depressVelocity * dt;
      const maxDepression = part.isKick ? -0.045 : part.isTom ? -0.14 : -0.08;
      part.depression = Math.max(maxDepression, Math.min(0.0175, part.depression));

      part.bodyPunchVelocity += (0 - part.bodyPunch) * (part.isTom ? 20 : 15) * dt;
      part.bodyPunchVelocity *= Math.pow(part.isTom ? 0.84 : 0.86, dt * 60);
      part.bodyPunch += part.bodyPunchVelocity * dt;
      const maxBodyPunch = part.isTom ? -0.10 : -0.05;
      part.bodyPunch = Math.max(maxBodyPunch, Math.min(0.0125, part.bodyPunch));

      part.group.position.y = part.baseGroupY + part.bodyPunch;
      part.headMesh.position.y = part.baseHeadY + part.depression;

      // Group scale animation for drums
      part.scaleYVelocity += (1 - part.group.scale.y) * 160 * dt;
      part.scaleYVelocity *= Math.pow(0.72, dt * 60);
      part.group.scale.y += part.scaleYVelocity * dt;
      part.group.scale.x = 1;
      part.group.scale.z = 1;
      if (part.baseHeadScale) {
        const pressAmount = Math.max(0, -part.depression / Math.abs(maxDepression));
        const spread = part.isTom ? 0.175 : 0.075;
        const flatten = part.isTom ? 0.20 : 0.09;
        part.headMesh.scale.set(
          part.baseHeadScale.x * (1 + pressAmount * spread),
          part.baseHeadScale.y * (1 - pressAmount * flatten),
          part.baseHeadScale.z * (1 + pressAmount * spread),
        );
      }
    });

    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      effect.life -= dt;
      effect.mesh.scale.multiplyScalar(1 + dt * 4.8);
      effect.mesh.material.opacity = Math.max(0, effect.life / effect.maxLife);

      if (effect.life <= 0) {
        group.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        effects.splice(i, 1);
      }
    }
  }

  function spawnHitEffect(position, velocity, isKick = false) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.1, 32),
      new THREE.MeshBasicMaterial({
        color: drumColors.highlight,
        opacity: 0.75,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    mesh.position.copy(position);

    if (isKick) {
      mesh.position.z += 0.22;
      mesh.position.y += 0.03;
    } else {
      mesh.position.y += 0.035;
      mesh.rotation.x = -Math.PI / 2;
    }

    mesh.scale.setScalar(0.7 + velocity * 0.9);
    group.add(mesh);
    effects.push({ life: 0.22, maxLife: 0.22, mesh });
  }

  return {
    group,
    hit,
    update,
    raycastTargets,
  };
}

function createBrushedTexture(baseColor, streakColor, width, height, direction) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < (direction === 'vertical' ? width : height); i += 1) {
    const alpha = 0.05 + Math.random() * 0.18;
    ctx.strokeStyle = withAlpha(streakColor, alpha);
    ctx.beginPath();
    if (direction === 'vertical') {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + Math.random() * 2 - 1, height);
    } else {
      ctx.moveTo(0, i);
      ctx.lineTo(width, i + Math.random() * 2 - 1);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 1);
  return texture;
}

function createCymbalTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 12, center, center, center);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, '#d3d6da');
  gradient.addColorStop(1, '#93989c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let radius = 18; radius < center; radius += 5) {
    ctx.strokeStyle = radius % 10 === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(100,100,100,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function withAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
