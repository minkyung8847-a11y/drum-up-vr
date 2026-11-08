import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
export const DRUM_ACCENTS: Record<string, number> = { crash:0xffa35c,hihat:0x52ffae,snare:0xff4fad,kick:0xff803b,smallTom:0x35e4ff,middleTom:0x43ffda,floorTom:0xf967e5,ride:0x6db9ff };
// Independent of the note highway: rims and physical-hit waves also work in FREE PLAY.
export function createVRDrumFeedback(surfaces: DrumHitSurface[], visuals?: Map<string, {head: THREE.Mesh}>) {
  const states=surfaces.map(surface=>{
    const parent=visuals?.get(surface.id)?.head ?? surface.mesh;
    const geometry=new THREE.RingGeometry(surface.radius*.984,surface.radius*1.002,96);
    const material=new THREE.MeshBasicMaterial({color:DRUM_ACCENTS[surface.id],transparent:true,opacity:.52,depthTest:false,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const rim=new THREE.Mesh(geometry,material);rim.name=`drum-accent-rim-${surface.id}`;rim.rotation.x=-Math.PI/2;rim.position.y=surface.height+.016;rim.renderOrder=4;parent.add(rim);
    const waveGeometry=new THREE.RingGeometry(.94,1,64),waveMaterial=material.clone();waveMaterial.opacity=0;
    const wave=new THREE.Mesh(waveGeometry,waveMaterial);wave.name=`drum-hit-wave-${surface.id}`;wave.rotation.x=-Math.PI/2;wave.position.y=surface.height+.019;wave.visible=false;wave.renderOrder=5;parent.add(wave);
    return {id:surface.id,rim,wave,age:Infinity,velocity:1,radius:surface.radius};
  });
  return {
    hit(id:string,velocity:number){const state=states.find(s=>s.id===id);if(state){state.age=0;state.velocity=velocity;state.rim.material.opacity=.95;state.wave.visible=true;}},
    update(delta:number){for(const state of states){state.age+=delta;const t=state.age/.24;
      state.rim.material.opacity=.52+.43*Math.max(0,1-t)**2*state.velocity;
      state.wave.visible=t<1;if(t>=1)state.wave.scale.setScalar(1);if(t<1){state.wave.scale.setScalar(state.radius*(.20+.82*t));state.wave.material.opacity=.55*(1-t)**2*state.velocity;}
    }},
    dispose(){for(const state of states)for(const mesh of [state.rim,state.wave]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}},
  };
}
