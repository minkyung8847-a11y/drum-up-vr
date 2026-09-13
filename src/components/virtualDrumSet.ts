// @ts-nocheck
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
  blackShell: 0xffe0bc,
  blackShellDark: 0x0e1011,
  chrome: 0xeff3f6,
  chromeDark: 0x34383c,
  cymbal: 0xf0ce80,
  cymbalDark: 0x93979b,
  drumHead: 0xd8d5cc,
  rubber: 0x161616,
  highlight: 0xffe6a3,
};


export function createVirtualDrumSet(scene) {
  const group = new THREE.Group();
  const parts = new Map();
  let hoveredPart = null;
  const raycastTargets = [];
  
  let kickPedalBoard = null;
  let kickBeaterGroup = null;
  let kickPedalTimer = 0;
  let kickPedalPower = 0;

  const shellTexture = createWoodTexture();
  const cymbalSurface = createCymbalSurface();

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: drumColors.blackShell,
    map: shellTexture,
    metalness: 0.05,
    roughness: 0.29,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: drumColors.drumHead,
    roughness: 0.56,
    metalness: 0.04,
    map: createHeadTexture(),
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: drumColors.chrome,
    metalness: 0.95,
    roughness: 0.095,
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
  const cymbalMat = new THREE.MeshPhysicalMaterial({
    color: drumColors.cymbal,
    metalness: 1,
    roughness: 0.34,
    envMapIntensity: 1.05,
    map: cymbalSurface.color,
    normalMap: cymbalSurface.normal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    anisotropy: 0.28,
    anisotropyMap: cymbalSurface.direction,
    side: THREE.DoubleSide,
  });

  createBassDrum('kick', [0, 0.39, 0.08]);
  createTom('snare', drumPositions.snare, 0.29, 0.16, { tiltX: 0.08, tiltZ: -0.06, legStyle: 'stand' });
  createTom('smallTom', drumPositions.smallTom, 0.225, 0.26, { tiltX: 0.46, tiltZ: 0.12, mountToBass: true });
  createTom('middleTom', drumPositions.middleTom, 0.245, 0.28, { tiltX: 0.43, tiltZ: -0.1, mountToBass: true });
  createTom('floorTom', drumPositions.floorTom, 0.32, 0.38, { tiltX: 0.04, tiltZ: -0.04, legStyle: 'floor' });
  createCymbal('hihat', drumPositions.hihat, 0.25, { stacked: true, standHeight: 0.95 });
  createCymbal('crash', drumPositions.crash, 0.39, { standHeight: 1.33, tiltX: 0.18, tiltZ: -0.1 });
  createCymbal('ride', drumPositions.ride, 0.43, { standHeight: 1.18, tiltX: 0.16, tiltZ: 0.1 });
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

    // Solid, opaque coated drumhead for all drums (including toms) so that interior/mounting hardware is completely hidden
    const isTom = name !== 'snare';
    const headGeometry = new THREE.RingGeometry(0, radius * 0.968, 128, 24);
    headGeometry.rotateX(-Math.PI / 2);
    const drumHeadMat = headMat.clone();
    drumHeadMat.transparent = false;
    drumHeadMat.opacity = 1.0;
    drumHeadMat.depthWrite = true;
    drumHeadMat.roughness = 0.52;

    const topHead = new THREE.Mesh(headGeometry, drumHeadMat);
    if (isTom) topHead.userData.deformRadius = radius * 0.968;
    topHead.position.y = 0.006;
    topHead.castShadow = true;
    topHead.receiveShadow = true;
    topHead.userData.drumType = name;
    drum.add(topHead);

    const bottomHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.01, 72),
      new THREE.MeshStandardMaterial({ color: 0x43494e, roughness: 0.55 }),
    );
    bottomHead.position.y = -depth - 0.004;
    bottomHead.userData.drumType = name;
    drum.add(bottomHead);

    addHoop(drum, radius, 0.018, 0.018, 0.014);
    addHoop(drum, radius, -depth - 0.006, 0.016, 0.012);
    addLugs(drum, name, radius, depth, options.legStyle === 'floor' || name === 'snare' ? 10 : 8);

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
      new THREE.MeshStandardMaterial({ color: 0x999b97, roughness: 0.5, map: createHeadTexture() }),
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

    const profile = [];
    for (let i=0;i<=180;i++) {
      const t=0.022+(i/180)*0.978;
      const y=0.049*Math.exp(-Math.pow(t/0.2,3))+0.019*Math.pow(1-t,2);
      profile.push(new THREE.Vector2(radius*t,y));
    }
    const geometry = new THREE.LatheGeometry(profile,192);
    const pos = geometry.attributes.position, uv = geometry.attributes.uv;
    for(let i=0;i<pos.count;i++) uv.setXY(i,pos.getX(i)/(radius*2)+0.5,pos.getZ(i)/(radius*2)+0.5);
    const body = new THREE.Mesh(geometry,cymbalMat.clone());
    body.castShadow=true; body.receiveShadow=true;
    body.userData.drumType=name;
    cymbal.add(body);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(radius,0.0012,6,192),cymbalMat);
    edge.rotation.x=Math.PI/2;
    cymbal.add(edge);

    const felt = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.012, 32), rubberMat);
    felt.position.y = 0.072;
    cymbal.add(felt);

    const wingNut = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.012, 0.014, 3, 0.004), chromeMat);
    wingNut.position.y = 0.087;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.055,16),chromeMat);
    stem.position.y=0.092;
    cymbal.add(stem);
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.003,32),chromeMat);
    washer.position.y=0.081;
    cymbal.add(washer);
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
    raycastTargets.push(body);
  }

  function addHoop(parent, radius, y, tubeRadius, _metalRadius) {
    // Closed, rolled triple-flange cross section: highlights and dark recesses have real depth.
    const h = Math.abs(tubeRadius);
    const section = [[-0.008,-h],[-0.008,h*0.7],[-0.006,h],[-0.002,h+0.003],
      [0.004,h+0.003],[0.008,h],[0.009,h*0.55],[0.009,-h*0.45],
      [0.017,-h*0.55],[0.02,-h*0.8],[0.02,-h],[0.013,-h*1.1],[-0.008,-h]];
    const hoop = new THREE.Mesh(new THREE.LatheGeometry(section.map(([r,y])=>new THREE.Vector2(radius+r,y)),160),chromeMat);
    hoop.position.y=y;hoop.castShadow=true;parent.add(hoop);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(radius-0.005,0.0035,10,160),darkChromeMat);
    seat.rotation.x=Math.PI/2;seat.position.y=y-h*0.7;parent.add(seat);
    const bead = new THREE.Mesh(new THREE.TorusGeometry(radius-0.004,0.0024,10,160),chromeMat);
    bead.rotation.x=Math.PI/2;bead.position.y=y-h*0.92;parent.add(bead);
  }

  function addLugs(parent, drumType, radius, depth, count) {
    for(let i=0;i<count;i++) {
      const angle=i/count*Math.PI*2;
      const hardware=new THREE.Group();
      hardware.rotation.y=Math.PI/2-angle;
      hardware.position.set(Math.cos(angle)*radius,0,Math.sin(angle)*radius);
      hardware.userData.drumType=drumType;
      // Separate top/bottom cast housings, black gaskets and machined tension screws.
      [0,-depth].forEach((end,index)=>{
        const sign=index===0?-1:1;
        const gasket=new THREE.Mesh(new RoundedBoxGeometry(0.032,0.056,0.009,2,0.003),rubberMat);
        gasket.position.set(0,end+sign*0.078,0.009);hardware.add(gasket);
        const lug=new THREE.Mesh(new RoundedBoxGeometry(0.027,0.048,0.023,3,0.007),chromeMat);
        lug.position.set(0,end+sign*0.078,0.019);lug.castShadow=true;hardware.add(lug);
        const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.0035,0.0035,0.073,16),chromeMat);
        rod.position.set(0,end+sign*0.018,0.026);hardware.add(rod);
        const washer=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.004,24),chromeMat);
        washer.position.set(0,end-sign*0.024,0.026);hardware.add(washer);
        const bolt=new THREE.Mesh(new RoundedBoxGeometry(0.010,0.010,0.010,2,0.001),chromeMat);
        bolt.position.set(0,end-sign*0.031,0.026);hardware.add(bolt);
        const ear=new THREE.Mesh(new RoundedBoxGeometry(0.027,0.006,0.027,3,0.006),chromeMat);
        ear.position.set(0,end-sign*0.019,0.015);hardware.add(ear);
        for(let thread=0;thread<5;thread++) {
          const ridge=new THREE.Mesh(new THREE.TorusGeometry(0.0037,0.00055,4,12),darkChromeMat);
          ridge.rotation.x=Math.PI/2;ridge.position.set(0,end+sign*(0.033+thread*0.003),0.026);
          hardware.add(ridge);
        }
      });
      parent.add(hardware);
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
    const base = new THREE.Vector3(position[0] * 0.55, 0.78, -0.24);
    const target = new THREE.Vector3(position[0], position[1] - 0.20, position[2] - radius - 0.024);
    group.add(createPipeBetweenPoints(base, target, 0.015, chromeMat));
    const clamp = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.05, 0.05, 3, 0.008), chromeMat);
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

  function hit(drumType, velocity = 1, _isLeft = true) {
    const part = parts.get(drumType === 'openHihat' ? 'hihat' : drumType);
    if (!part) return;

    part.flash = Math.max(part.flash, 0.10 + velocity * 0.06);

    if (part.isCymbal) {
      // Scale down swing/movement velocity by ~50%
      part.swingVelocityX = -(0.45 + velocity * 0.35);
      const isLeftSide = (drumType === 'crash' || drumType === 'hihat' || drumType === 'openHihat');
      part.swingVelocityZ = (isLeftSide ? 1.0 : -1.0) * (0.22 + velocity * 0.18);
      part.bodyPunchVelocity = 0.04 * velocity;
      part.scaleYVelocity = -0.12 * velocity;
    } else {
      // Balanced compression / squash velocity
      part.depressVelocity = -(part.isTom ? 0.35 : 0.12) * velocity;
      part.bodyPunchVelocity = -(part.isTom ? 0.04 : 0.045) * velocity;
      part.scaleYVelocity = -(part.isTom ? 0.16 : 0.18) * velocity;
      if (drumType === 'kick') {
        kickPedalTimer = 0.16;
        kickPedalPower = velocity;
      }
    }

    // The existing hit drives only a brief local surface response.
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
          const colorHex = 0xe8ac70;
          part.flashMesh.material.emissive?.setHex(colorHex);
          part.flashMesh.material.emissiveIntensity = part.flash * 0.7;
        }
      } else if (part.flashMesh?.material) {
        part.flashMesh.material.emissive?.setHex(0x000000);
      }

      if (part.flashMesh?.material && hoveredPart === partName) {
        part.flashMesh.material.emissive.setHex(0xbe793d);
        part.flashMesh.material.emissiveIntensity = Math.max(part.flash * 0.7, 0.065);
      }

      if (part.isCymbal) {
        // Lower tension and higher damping for slower, longer, more obvious swaying
        const tension = 100;
        const damping = 0.72;
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
      const tension = part.isKick ? 45 : part.isTom ? 130 : 65;
      const damping = part.isKick ? 0.88 : part.isTom ? 0.82 : 0.86;
      part.depressVelocity += (0 - part.depression) * tension * dt;
      part.depressVelocity *= Math.pow(damping, dt * 60);
      part.depression += part.depressVelocity * dt;
      const maxDepression = part.isKick ? -0.045 : part.isTom ? -0.022 : -0.08;
      part.depression = Math.max(maxDepression, Math.min(0.0175, part.depression));

      part.bodyPunchVelocity += (0 - part.bodyPunch) * (part.isTom ? 20 : 15) * dt;
      part.bodyPunchVelocity *= Math.pow(part.isTom ? 0.84 : 0.86, dt * 60);
      part.bodyPunch += part.bodyPunchVelocity * dt;
      const maxBodyPunch = part.isTom ? -0.025 : -0.05;
      part.bodyPunch = Math.max(maxBodyPunch, Math.min(0.0125, part.bodyPunch));

      part.group.position.y = part.baseGroupY + part.bodyPunch;
      if (part.isTom) {
        // Pinned rim, visible concave centre. No expanding head that protrudes through the hoop.
        part.headMesh.position.y=part.baseHeadY;
        const positions=part.headMesh.geometry.attributes.position;
        const radius=part.headMesh.userData.deformRadius;
        for(let i=0;i<positions.count;i++) {
          const distance=Math.hypot(positions.getX(i),positions.getZ(i))/radius;
          positions.setY(i,Math.min(0,part.depression)*Math.pow(Math.max(0,1-distance*distance),2));
        }
        positions.needsUpdate=true;
        part.headMesh.geometry.computeVertexNormals();
      } else {
        part.headMesh.position.y = part.baseHeadY + part.depression;
      }

      // Group scale animation for drums
      part.scaleYVelocity += (1 - part.group.scale.y) * 160 * dt;
      part.scaleYVelocity *= Math.pow(0.72, dt * 60);
      part.group.scale.y += part.scaleYVelocity * dt;
      part.group.scale.x = 1;
      part.group.scale.z = 1;
      if (part.baseHeadScale && !part.isTom) {
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

  }

  return {
    group,
    hit,
    update,
    raycastTargets,
    setHovered(drumType) { hoveredPart = drumType === 'openHihat' ? 'hihat' : drumType; },
  };
}

function createCymbalSurface() {
  const size=1024;
  const normal=new Uint8Array(size*size*4), direction=new Uint8Array(size*size*4), color=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=(x-size/2)/(size/2),v=(y-size/2)/(size/2);
    const radius=Math.hypot(u,v),angle=Math.atan2(v,u),i=(y*size+x)*4;
    const grooves=Math.sin(radius*2*Math.PI*85)*0.28+Math.sin(radius*2*Math.PI*43)*0.07;
    const hammer=Math.sin(x*0.71+y*0.31)*Math.sin(y*0.47-x*0.27)*0.035;
    const nx=Math.cos(angle)*grooves+hammer,ny=Math.sin(angle)*grooves+hammer;
    const length=Math.hypot(nx,ny,1);
    normal[i]=(nx/length*.5+.5)*255;normal[i+1]=(ny/length*.5+.5)*255;
    normal[i+2]=(1/length*.5+.5)*255;normal[i+3]=255;
    direction[i]=(-Math.sin(angle)*.5+.5)*255;direction[i+1]=(Math.cos(angle)*.5+.5)*255;
    direction[i+2]=255;direction[i+3]=255;
    const ring=Math.sin(radius*Math.PI*2*85);
    const value=236+ring*13+Math.sin(radius*Math.PI*2*43)*5;
    color[i]=value;color[i+1]=value;color[i+2]=value;color[i+3]=255;
  }
  const make=data=>{
    const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
    tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
  };
  const albedo=make(color);albedo.colorSpace=THREE.SRGBColorSpace;
  return {normal:make(normal),direction:make(direction),color:albedo};
}

// Procedural visual assets: no downloaded images or audio dependencies.
function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a23a10'; ctx.fillRect(0,0,1024,512);
  for (let y = 0; y < 512; y++) {
    const light = 0.5 + 0.5*Math.sin(y*1.71)*Math.sin(y*0.37);
    ctx.strokeStyle = y%4 === 0 ? 'rgba(47,12,4,0.42)' : 'rgba(236,135,55,'+(light*0.36)+')';
    ctx.beginPath();
    for(let x=0;x<=1024;x+=8) {
      const yy=y+2.1*Math.sin(x*0.016+y*0.09)+0.8*Math.sin(x*0.035+y*0.12);
      if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
function createHeadTexture() {
  const canvas = document.createElement('canvas'); canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const light=ctx.createRadialGradient(94,84,6,128,128,170);
  light.addColorStop(0,'#deddd5');light.addColorStop(0.65,'#c9c9c3');light.addColorStop(1,'#969b9b');
  ctx.fillStyle=light;ctx.fillRect(0,0,256,256);
  for(let i=0;i<12000;i++) {
    const hashX=Math.sin(i*127.1)*43758.5453,hashY=Math.sin(i*311.7)*19234.135;
    const x=(hashX-Math.floor(hashX))*256,y=(hashY-Math.floor(hashY))*256;
    ctx.fillStyle='rgba(90,85,74,0.045)';ctx.fillRect(x,y,1,1);
  }
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
