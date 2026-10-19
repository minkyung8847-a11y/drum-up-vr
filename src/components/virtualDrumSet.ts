// @ts-nocheck
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const drumPositions: Record<string, [number, number, number]> = {
  crash: [-0.88, 1.32, 0.02],
  hihat: [-0.82, 0.94, 0.28],
  kick: [0.0, 0.45, 0.08],
  openHihat: [-0.82, 0.94, 0.28],
  ride: [0.86, 1.48, 0.1],
  snare: [-0.54, 0.70, 0.64],
  smallTom: [-0.30, 1.26, -0.12],
  middleTom: [0.30, 1.26, -0.12],
  floorTom: [0.76, 0.70, 0.54],
};

const drumColors = {
  blackShell: 0x686b6e,
  blackShellDark: 0x1a0800,
  chrome: 0xeff3f6,
  chromeDark: 0x34383c,
  cymbal: 0xd8e0e8, // Sleek silver/platinum cymbal alloy
  cymbalDark: 0x7c858d,
  drumHead: 0xf0e9dc,
  rubber: 0x161616,
  highlight: 0xf2f6fa,
};


export function createVirtualDrumSet(scene, options: { layout?: Record<string, {
  diameter: number; depth?: number; position: [number, number, number]; tilt?: [number, number]; beaterScale?: number;
}> } = {}) {
  const layout = options.layout;
  const positions = Object.fromEntries(Object.entries(drumPositions).map(([id, position]) => [id, layout?.[id]?.position ?? position]));
  const radiusFor = (id, fallback) => layout?.[id] ? layout[id].diameter / 2 : fallback;
  const depthFor = (id, fallback) => layout?.[id]?.depth ?? fallback;
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
    metalness: 0.58,
    roughness: 0.34,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
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

  createBassDrum('kick', positions.kick);
  createTom('snare', positions.snare, radiusFor('snare', 0.23), depthFor('snare', 0.16), { tiltX: 0.08, tiltZ: -0.06, legStyle: 'stand' });
  createTom('smallTom', positions.smallTom, radiusFor('smallTom', 0.24), depthFor('smallTom', 0.26), { tiltX: 0.40, tiltZ: 0.08, mountToBass: true });
  createTom('middleTom', positions.middleTom, radiusFor('middleTom', 0.24), depthFor('middleTom', 0.26), { tiltX: 0.40, tiltZ: -0.08, mountToBass: true });
  addCentralTomPost();
  createTom('floorTom', positions.floorTom, radiusFor('floorTom', 0.38), depthFor('floorTom', 0.38), { tiltX: 0.04, tiltZ: -0.04, legStyle: 'floor' });
  createCymbal('hihat', positions.hihat, radiusFor('hihat', 0.25), { stacked: true, standHeight: layout ? positions.hihat[1] : 0.95 });
  createCymbal('crash', positions.crash, radiusFor('crash', 0.39), { standHeight: layout ? positions.crash[1] : 1.33, tiltX: 0.18, tiltZ: -0.1 });
  createCymbal('ride', positions.ride, radiusFor('ride', 0.43), { standHeight: positions.ride[1], tiltX: 0.16, tiltZ: 0.1 });
  createKickPedal();
  createHihatPedal();

  scene.add(group);

  function createTom(name, position, radius, depth, options = {}) {
    const drum = new THREE.Group();
    drum.position.set(...position);
    drum.rotation.set(layout?.[name]?.tilt?.[0] ?? options.tiltX ?? 0, 0, layout?.[name]?.tilt?.[1] ?? options.tiltZ ?? 0);

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
    if (name === 'snare') drumHeadMat.map = createHeadTexture(true);

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
      hitRadius: radius * 0.968,
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

    const radius = radiusFor(name, 0.44);
    const depth = depthFor(name, 0.38);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 96, 1, true), shellMat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.userData.drumType = name;
    drum.add(shell);

    const frontHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, 0.018, 96),
      new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.54, map: createHeadTexture() }),
    );
    frontHead.position.y = depth / 2 + 0.012;
    frontHead.userData.drumType = name;
    for (const ringRadius of [radius * 0.77, radius * 0.80]) {
      const headRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.0018, 6, 128), darkChromeMat);
      headRing.rotation.x = Math.PI / 2;
      headRing.position.y = 0.012;
      frontHead.add(headRing);
    }
    drum.add(frontHead);

    const rearHead = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.93, radius * 0.93, 0.016, 96),
      new THREE.MeshStandardMaterial({ color: 0xe9e2d7, roughness: 0.58, map: createHeadTexture() }),
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
      hitRadius: radius * 0.93,
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
    cymbal.rotation.set(layout?.[name]?.tilt?.[0] ?? options.tiltX ?? 0.08, 0, layout?.[name]?.tilt?.[1] ?? options.tiltZ ?? 0);

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
      hitRadius: radius,
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
    const base = layout ? new THREE.Vector3(positions.kick[0], Math.min(positions.smallTom[1], positions.middleTom[1]) - 0.12, positions.kick[2]) : new THREE.Vector3(0, 1.16, -0.06);
    const target = new THREE.Vector3(position[0], position[1] - 0.20, position[2] - radius - 0.024);
    group.add(createPipeBetweenPoints(base, target, 0.015, chromeMat));
    const clamp = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.05, 0.05, 3, 0.008), chromeMat);
    clamp.position.copy(target);
    clamp.castShadow = true;
    group.add(clamp);
  }

  function addCentralTomPost() {
    const bottom = layout ? new THREE.Vector3(positions.kick[0], positions.kick[1] + radiusFor('kick', 0.44), positions.kick[2]) : new THREE.Vector3(0, 0.84, -0.06);
    const top = layout ? new THREE.Vector3(positions.kick[0], Math.min(positions.smallTom[1], positions.middleTom[1]) - 0.10, positions.kick[2]) : new THREE.Vector3(0, 1.18, -0.06);
    group.add(createPipeBetweenPoints(bottom, top, 0.018, chromeMat));
    for (const y of layout ? [bottom.y + 0.02, top.y - 0.02] : [0.88, 1.16]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.045, 24), darkChromeMat);
      collar.position.set(top.x, y, top.z);
      collar.castShadow = true;
      group.add(collar);
    }
  }

  function addSnareStand(position, radius) {
    const standDepth = depthFor('snare', 0.16);
    const top = new THREE.Vector3(position[0], position[1] - standDepth, position[2]);
    const bottom = new THREE.Vector3(position[0], 0.08, position[2]);
    group.add(createPipeBetweenPoints(bottom, top, 0.014, chromeMat));
    addTripodFeet(new THREE.Vector3(position[0], 0.08, position[2]), 0.27, 0);

    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + 0.3;
      const end = new THREE.Vector3(
        position[0] + Math.cos(angle) * radius * 0.8,
        position[1] - standDepth + 0.05,
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
      if (layout) {
        parent.updateMatrixWorld(true);
        parent.localToWorld(bottom);
        bottom.y = 0.025;
        parent.worldToLocal(bottom);
      }
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

  function addTripodFeet(center, radius, angleOffset = Math.PI / 6) {
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 + angleOffset;
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

  // Detailed single-pedal kick mechanism, aligned to the bass drum center.
  function createKickPedal() {
    const pedal = new THREE.Group();
    pedal.name = 'kick-pedal';
    pedal.position.set(layout ? positions.kick[0] : 0, 0.04, layout ? positions.kick[2] + depthFor('kick', 0.38) / 2 + 0.23 : 0.50);

    const base = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.025, 0.50, 4, 0.008), rubberMat);
    base.position.y = 0.006;
    base.castShadow = true;
    base.receiveShadow = true;
    pedal.add(base);

    // Matte black rectangular frame and raised side rails.
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.026, 0.47, 3, 0.004), rubberMat);
      rail.position.set(side * 0.082, 0.041, 0);
      rail.castShadow = true;
      pedal.add(rail);
    }
    for (const z of [-0.22, 0.22]) {
      const crossbar = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.025, 0.025, 3, 0.004), rubberMat);
      crossbar.position.set(0, 0.041, z);
      crossbar.castShadow = true;
      pedal.add(crossbar);
    }

    const pedalSilverMat = new THREE.MeshPhysicalMaterial({
      color: 0xc2c7c9,
      metalness: 0.98,
      roughness: 0.24,
      anisotropy: 0.38,
      anisotropyRotation: 0,
      envMapIntensity: 1.1,
    });
    const boardPivot = new THREE.Group();
    boardPivot.position.set(0, 0.066, -0.20);
    boardPivot.rotation.x = -0.18;

    // Tapered outline with a shallow formed bend at the toe end.
    const boardSections = [
      { z: 0, width: 0.104, top: -0.012 },
      { z: 0.23, width: 0.132, top: -0.012 },
      { z: 0.29, width: 0.142, top: -0.012 },
      { z: 0.315, width: 0.142, top: -0.026 },
      { z: 0.405, width: 0.136, top: -0.026 },
    ];
    const boardGeometry = new THREE.BufferGeometry();
    const boardPositions: number[] = [];
    const boardUvs: number[] = [];
    const boardIndices: number[] = [];
    const sectionCount = boardSections.length;
    boardSections.forEach(({ z, width, top }) => {
      boardPositions.push(-width / 2, top, z, width / 2, top, z);
      boardUvs.push(z / 0.405, 0, z / 0.405, 1);
    });
    boardSections.forEach(({ z, width, top }) => {
      boardPositions.push(-width / 2, top - 0.012, z, width / 2, top - 0.012, z);
      boardUvs.push(z / 0.405, 0, z / 0.405, 1);
    });
    const bottomOffset = sectionCount * 2;
    for (let i = 0; i < sectionCount - 1; i += 1) {
      const left = i * 2;
      const right = left + 1;
      const nextLeft = left + 2;
      const nextRight = left + 3;
      const bottomLeft = bottomOffset + left;
      const bottomRight = bottomOffset + right;
      const bottomNextLeft = bottomOffset + nextLeft;
      const bottomNextRight = bottomOffset + nextRight;
      boardIndices.push(left, nextLeft, right, right, nextLeft, nextRight);
      boardIndices.push(bottomLeft, bottomRight, bottomNextLeft, bottomRight, bottomNextRight, bottomNextLeft);
      boardIndices.push(left, bottomLeft, nextLeft, nextLeft, bottomLeft, bottomNextLeft);
      boardIndices.push(right, nextRight, bottomRight, nextRight, bottomNextRight, bottomRight);
    }
    boardIndices.push(0, 1, bottomOffset, 1, bottomOffset + 1, bottomOffset);
    const endLeft = (sectionCount - 1) * 2;
    const endRight = endLeft + 1;
    boardIndices.push(endLeft, bottomOffset + endLeft, endRight, endRight, bottomOffset + endLeft, bottomOffset + endRight);
    boardGeometry.setAttribute("position", new THREE.Float32BufferAttribute(boardPositions, 3));
    boardGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(boardUvs, 2));
    boardGeometry.setIndex(boardIndices);
    boardGeometry.computeVertexNormals();
    const board = new THREE.Mesh(boardGeometry, pedalSilverMat);
    board.castShadow = true;
    board.receiveShadow = true;
    board.userData.drumType = "kick";
    boardPivot.add(board);
    pedal.add(boardPivot);
    kickPedalBoard = boardPivot;
    raycastTargets.push(board);

    // Hinge axle, bearings, and the small linkage from the board to the beater shaft.
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.20, 24), chromeMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.066, -0.20);
    pedal.add(axle);
    for (const side of [-1, 1]) {
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.022, 24), darkChromeMat);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.set(side * 0.092, 0.066, -0.20);
      pedal.add(bearing);

      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.026, 12), chromeMat);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(side * 0.105, 0.066, -0.20);
      pedal.add(bolt);

      const link = createPipeBetweenPoints(
        new THREE.Vector3(side * 0.065, 0.045, 0.025),
        new THREE.Vector3(side * 0.065, 0.083, -0.155),
        0.006,
        chromeMat,
      );
      pedal.add(link);
    }

    const beaterGroup = new THREE.Group();
    beaterGroup.name = 'kick-beater';
    const beaterScale = layout?.kick?.beaterScale ?? 1;
    beaterGroup.scale.setScalar(beaterScale);
    // Preserve the felt face's alignment with the existing bass drum head.
    // The pedal board, base, axle and bass shell remain at their original scale.
    beaterGroup.position.set(0, 0.08, -0.16 - 0.0658 * (1 - beaterScale));
    const beaterStem = createPipeBetweenPoints(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.33, -0.04), 0.006, chromeMat);
    beaterGroup.add(beaterStem);

    const beaterClamp = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.035, 0.025, 3, 0.006), darkChromeMat);
    beaterClamp.position.set(0, 0.075, -0.009);
    beaterGroup.add(beaterClamp);
    const clampBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.038, 12), chromeMat);
    clampBolt.rotation.z = Math.PI / 2;
    clampBolt.position.set(0, 0.075, -0.009);
    beaterGroup.add(clampBolt);

    const feltMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c5, roughness: 0.86 });
    const feltProfile = [
      new THREE.Vector2(0, -0.022),
      new THREE.Vector2(0.026, -0.022),
      new THREE.Vector2(0.039, -0.016),
      new THREE.Vector2(0.043, -0.006),
      new THREE.Vector2(0.043, 0.006),
      new THREE.Vector2(0.038, 0.015),
      new THREE.Vector2(0.028, 0.020),
      new THREE.Vector2(0.020, 0.022),
      new THREE.Vector2(0, 0.022),
    ];
    const feltHead = new THREE.Mesh(new THREE.LatheGeometry(feltProfile, 32), feltMat);
    feltHead.rotation.x = Math.PI / 2;
    feltHead.position.set(0, 0.33, -0.04);
    feltHead.castShadow = true;
    beaterGroup.add(feltHead);
    const feltFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.003, 24),
      new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.82 }),
    );
    feltFace.rotation.x = Math.PI / 2;
    feltFace.position.set(0, 0.33, -0.0635);
    beaterGroup.add(feltFace);
    const feltScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0015, 16), chromeMat);
    feltScrew.rotation.x = Math.PI / 2;
    feltScrew.position.set(0, 0.33, -0.0658);
    beaterGroup.add(feltScrew);

    pedal.add(beaterGroup);
    kickBeaterGroup = beaterGroup;

    group.add(pedal);
  }

  function createHihatPedal() {
    const pedal = new THREE.Group();
    pedal.position.set(positions.hihat[0], 0.035, layout ? positions.hihat[2] + 0.16 : 0.52);

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
        kickBeaterGroup.rotation.x = -Math.abs(amount) * (0.4 + kickPedalPower * 0.4);
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
    // Playing surfaces only: shells, stands and hardware are not VR hit zones.
    // Mesh transforms include the caller's existing kit placement and scale.
    hitSurfaces: [...parts.entries()].map(([id, part]) => ({
      id, mesh: part.isCymbal ? part.flashMesh : part.headMesh,
      radius: part.hitRadius, cymbal: part.isCymbal,
      height: part.isKick ? 0.009 : 0,
    })),
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
  ctx.fillStyle = '#65676a'; ctx.fillRect(0,0,1024,512);
  for (let y = 0; y < 512; y++) {
    const light = 0.5 + 0.5*Math.sin(y*1.71)*Math.sin(y*0.37);
    ctx.strokeStyle = y%4 === 0 ? 'rgba(22,24,27,0.22)' : 'rgba(185,190,196,'+(light*0.13)+')';
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
function createHeadTexture(cymbalShadow = false) {
  const canvas = document.createElement('canvas'); canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const light=ctx.createRadialGradient(94,84,6,128,128,170);
  light.addColorStop(0,'#faf7ee');light.addColorStop(0.65,'#eae5da');light.addColorStop(1,'#d4d0c7');
  ctx.fillStyle=light;ctx.fillRect(0,0,256,256);
  for(let i=0;i<12000;i++) {
    const hashX=Math.sin(i*127.1)*43758.5453,hashY=Math.sin(i*311.7)*19234.135;
    const x=(hashX-Math.floor(hashX))*256,y=(hashY-Math.floor(hashY))*256;
    ctx.fillStyle='rgba(90,85,74,0.045)';ctx.fillRect(x,y,1,1);
  }
  if (cymbalShadow) {
    const shadow = ctx.createRadialGradient(35, 50, 10, 60, 80, 190);
    shadow.addColorStop(0, 'rgba(39,42,46,0.16)');
    shadow.addColorStop(1, 'rgba(39,42,46,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
