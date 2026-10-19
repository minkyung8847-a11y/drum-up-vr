import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { createStudioEnvironment } from "./studioEnvironment";
import { createVirtualDrumSet, drumPositions } from "./virtualDrumSet";

export type Drum3DPartId = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "tom3" | "crash" | "ride";

export interface Drum3DHandle {
  hitDrum: (partId: Drum3DPartId) => void;
}

interface Drum3DProps {
  showroom?: boolean;
  onPartClick?: (partId: Drum3DPartId) => void;
  onDrumPositionsUpdate?: (positions: Record<Drum3DPartId, { x: number; y: number }>) => void;
}

// Maps internal drum set IDs to external standard pad IDs
const INTERNAL_TO_EXTERNAL: Record<string, Drum3DPartId> = {
  kick: "kick",
  snare: "snare",
  hihat: "hihat",
  openHihat: "hihat",
  smallTom: "tom1",
  middleTom: "tom2",
  floorTom: "tom3",
  crash: "crash",
  ride: "ride",
};

const EXTERNAL_TO_INTERNAL: Record<Drum3DPartId, string> = {
  kick: "kick",
  snare: "snare",
  hihat: "hihat",
  tom1: "smallTom",
  tom2: "middleTom",
  tom3: "floorTom",
  crash: "crash",
  ride: "ride",
};

export const Drum3D = forwardRef<Drum3DHandle, Drum3DProps>(({ onPartClick, onDrumPositionsUpdate, showroom = false }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drumSetRef = useRef<any>(null);
  
  // Keep ref to callback to prevent re-initializing Three.js when callback updates
  const onPartClickRef = useRef(onPartClick);
  useEffect(() => {
    onPartClickRef.current = onPartClick;
  }, [onPartClick]);

  const onDrumPositionsUpdateRef = useRef(onDrumPositionsUpdate);
  useEffect(() => {
    onDrumPositionsUpdateRef.current = onDrumPositionsUpdate;
  }, [onDrumPositionsUpdate]);

  // Expose trigger control to parent
  useImperativeHandle(ref, () => ({
    hitDrum(partId: Drum3DPartId) {
      console.log(`[Drum3D] hitDrum method called for: ${partId}, drumSetRef.current is:`, !!drumSetRef.current);
      if (drumSetRef.current) {
        const internalId = EXTERNAL_TO_INTERNAL[partId];
        console.log(`[Drum3D] Invoking 3D scene hit for: ${internalId}`);
        drumSetRef.current.hit(internalId, 1.0);
      }
    }
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 2. Camera setup - centered on the 3D drum kit bounds
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
    // Fit the complete kit, including cymbal edges, in both wide and narrow stages.
    const frameKit = (w: number, h: number) => {
      camera.aspect = w / Math.max(h, 1);
      const distance = Math.max(2.65, 1.65 / (Math.tan(Math.PI / 8) * camera.aspect));
      camera.position.set(0, 0.70 + distance * 0.58, 0.1 + distance * 0.815);
      if (showroom) {
        const showcaseDistance = Math.max(2.6, 1.48 / (Math.tan(Math.PI / 8) * camera.aspect));
        camera.position.set(0, 0.70 + showcaseDistance * 0.38, 0.1 + showcaseDistance * 0.925);
      }
      camera.lookAt(0, 0.70, 0.1);
      camera.updateProjectionMatrix();
    };
    frameKit(width, height);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, showroom ? 1.5 : 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !showroom;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = createStudioEnvironment();
    const environment = pmrem.fromScene(room, 0.015);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.95;
    room.traverse(object => { if(object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
    pmrem.dispose();
    container.appendChild(renderer.domElement);

    // 4. Lighting setup
    const ambientLight = new THREE.AmbientLight(0xe8eaf0, 0.28);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff4e5, 2.8);
    dirLight.position.set(-3, 6, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = -2;
    dirLight.shadow.normalBias = 0.012;
    dirLight.shadow.radius = 4;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Spotlight to accent chrome and cymbal specular gradients
    const spotLight = new THREE.SpotLight(0xffffff, 1.2, 10, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 5, 2);
    scene.add(spotLight);
    const rimLight = new THREE.DirectionalLight(0xc6d6ef, 1.6);
    rimLight.position.set(2, 3, -2);
    scene.add(rimLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20,20), new THREE.ShadowMaterial({opacity:showroom ? 0.04 : 0.13}));
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.016;
    ground.receiveShadow = true;
    scene.add(ground);

    // 5. Initialize the high-fidelity procedural 3D Drum Set
    const virtualDrum = createVirtualDrumSet(scene);
    if (showroom) virtualDrum.group.rotation.y = Math.PI;
    drumSetRef.current = virtualDrum;

    // 6. Raycast Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(virtualDrum.raycastTargets, true);

      if (intersects.length > 0) {
        let intersectedObj: THREE.Object3D | null = intersects[0].object;
        while (intersectedObj) {
          if (intersectedObj.userData && intersectedObj.userData.drumType) {
            const drumType = intersectedObj.userData.drumType;
            virtualDrum.hit(drumType, 1.0);
            
            if (onPartClickRef.current) {
              const externalId = INTERNAL_TO_EXTERNAL[drumType];
              if (externalId) onPartClickRef.current(externalId);
            }
            break;
          }
          intersectedObj = intersectedObj.parent;
        }
      }
    };

    if (!showroom) renderer.domElement.addEventListener("mousedown", handleMouseDown);

    // Showroom-only rotation; the practice view retains its existing hit controls.
    let pointerX: number | null = null;
    let pointerStartX = 0;
    let moved = false;
    let targetRotation = 0;
    let angularVelocity = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startRotation = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerX = pointerStartX = event.clientX;
      moved = false;
      angularVelocity = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const moveRotation = (event: PointerEvent) => {
      if (pointerX === null) return;
      const delta = (event.clientX - pointerX) * 0.004;
      pointerX = event.clientX;
      moved ||= Math.abs(event.clientX - pointerStartX) > 5;
      targetRotation = THREE.MathUtils.clamp(targetRotation + delta, -0.65, 0.65);
      angularVelocity = delta * 12;
    };
    const endRotation = (event: PointerEvent) => {
      if (pointerX === null) return;
      pointerX = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (!moved && event.type === 'pointerup') handleMouseDown(event);
      if (event.type === 'pointercancel') angularVelocity = 0;
    };
    if (showroom) {
      renderer.domElement.style.touchAction = 'pan-y';
      renderer.domElement.addEventListener('pointerdown', startRotation);
      renderer.domElement.addEventListener('pointermove', moveRotation);
      renderer.domElement.addEventListener('pointerup', endRotation);
      renderer.domElement.addEventListener('pointercancel', endRotation);
    }

    // Presentation-only hover; the existing mousedown callback and ID mapping stay intact.
    const handleHover = (event: MouseEvent) => {
      if (showroom) { renderer.domElement.style.cursor = pointerX === null ? 'grab' : 'grabbing'; return; }
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(mouse,camera);
      const target = raycaster.intersectObjects(virtualDrum.raycastTargets,true)[0]?.object;
      virtualDrum.setHovered(target?.userData.drumType ?? null);
      renderer.domElement.style.cursor = target ? 'pointer' : 'default';
    };
    const clearHover = () => virtualDrum.setHovered(null);
    renderer.domElement.addEventListener('mousemove', handleHover);
    renderer.domElement.addEventListener('mouseleave', clearHover);

    // 7. Animation Loop
    let reqId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (showroom) {
        const dt = Math.min(delta, 0.05);
        if (pointerX === null && !reducedMotion) {
          targetRotation = THREE.MathUtils.clamp(targetRotation + angularVelocity * dt, -0.65, 0.65);
          angularVelocity *= Math.exp(-9 * dt);
        }
        virtualDrum.group.rotation.y = reducedMotion ? Math.PI + targetRotation
          : THREE.MathUtils.damp(virtualDrum.group.rotation.y, Math.PI + targetRotation, 14, dt);
        renderer.domElement.dataset.rotation = (virtualDrum.group.rotation.y - Math.PI).toFixed(4);
      }
      virtualDrum.update(delta);
      renderer.render(scene, camera);
    };

    animate();

    // 8. Projection calculation
    const updateProjectedPositions = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      const positions3D: Record<Drum3DPartId, [number, number, number]> = {
        crash: [-0.88, 1.32, 0.02],
        hihat: [-0.82, 0.94, 0.28],
        kick: [0.0, 0.45, 0.282],
        ride: drumPositions.ride,
        snare: drumPositions.snare,
        tom1: drumPositions.smallTom,
        tom2: drumPositions.middleTom,
        tom3: drumPositions.floorTom,
      };

      const projected: Record<string, { x: number; y: number }> = {};
      const tempV = new THREE.Vector3();

      (Object.keys(positions3D) as Drum3DPartId[]).forEach((partId) => {
        const pos = positions3D[partId];
        tempV.set(pos[0], pos[1], pos[2]);
        tempV.project(camera);
        projected[partId] = {
          x: (tempV.x * 0.5 + 0.5) * w,
          y: (-(tempV.y * 0.5) + 0.5) * h,
        };
      });

      if (onDrumPositionsUpdateRef.current) {
        onDrumPositionsUpdateRef.current(projected as Record<Drum3DPartId, { x: number; y: number }>);
      }
    };

    // Calculate initially and after a short delay for container layout stabilization
    updateProjectedPositions();
    const initTimer1 = setTimeout(updateProjectedPositions, 0);
    const initTimer2 = setTimeout(updateProjectedPositions, 300);

    // 9. Handle Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      frameKit(w, h);
      renderer.setSize(w, h);
      updateProjectedPositions();
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      clearTimeout(initTimer1);
      clearTimeout(initTimer2);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener("mousedown", handleMouseDown);
        renderer.domElement.removeEventListener('pointerdown', startRotation);
        renderer.domElement.removeEventListener('pointermove', moveRotation);
        renderer.domElement.removeEventListener('pointerup', endRotation);
        renderer.domElement.removeEventListener('pointercancel', endRotation);
        renderer.domElement.removeEventListener('mousemove', handleHover);
        renderer.domElement.removeEventListener('mouseleave', clearHover);
        if (container) {
          container.removeChild(renderer.domElement);
        }
      }
      cancelAnimationFrame(reqId);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
            materials.add(material);
            Object.values(material).forEach(value => { if(value instanceof THREE.Texture) textures.add(value); });
          });
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      environment.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [showroom]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        position: "relative",
        cursor: "pointer",
        minHeight: "0",
      }}
    />
  );
});

Drum3D.displayName = "Drum3D";
