import * as THREE from 'three';
import type {DrumHitSurface} from './vrStickCollision';
import {DRUM_ACCENTS} from './vrLaneConfig';
import {softNeonColor} from './vrNeonStyle';
export {DRUM_ACCENTS} from './vrLaneConfig';
export const DRUM_NEON_STYLE={rimInner:.938,rimOuter:.962,idleOpacity:.62,hitOpacity:.82,duration:.24,surfaceLift:.0015,glowSpan:2.7} as const;
// Two restrained layers share the visible playing surface, including cymbal motion.
export function createVRDrumFeedback(surfaces:DrumHitSurface[],visuals?:Map<string,{head:THREE.Mesh}>){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(128,128,0,128,128,128);
 for(const [stop,color] of [[0,'#000'],[.975,'#000'],[.985,'#fff'],[.993,'#fff'],[1,'#000']] as const)gradient.addColorStop(stop,color);
 ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);const softRim=new THREE.CanvasTexture(canvas);
 const states=surfaces.map(surface=>{
  const parent=visuals?.get(surface.id)?.head??surface.mesh;
  parent.geometry.computeBoundingBox();const bounds=parent.geometry.boundingBox!;
  // Use the actual visible head radius, not its larger invisible collision proxy.
  const radius=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x),Math.abs(bounds.min.z),Math.abs(bounds.max.z));
  const rimHeight=surface.cymbal ? .019*(1-.95)**2 : bounds.max.y;
  const y=rimHeight+DRUM_NEON_STYLE.surfaceLift,color=softNeonColor(DRUM_ACCENTS[surface.id]);
  const material=new THREE.MeshBasicMaterial({color,alphaMap:softRim,transparent:true,opacity:DRUM_NEON_STYLE.idleOpacity,depthTest:false,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const rim=new THREE.Mesh(new THREE.RingGeometry(radius*DRUM_NEON_STYLE.rimInner,radius*DRUM_NEON_STYLE.rimOuter,96),material);
  rim.name=`drum-accent-rim-${surface.id}`;rim.rotation.x=-Math.PI/2;rim.position.y=y;rim.renderOrder=4;parent.add(rim);
  const glowMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
   uniforms:{tint:{value:color.clone()},pulse:{value:0}},
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec2 vUv;uniform vec3 tint;uniform float pulse;void main(){
    float r=length((vUv-.5)*2.),centre=.703704;
    float nearGlow=exp(-pow((r-centre)/.055,2.))*(.10+.14*pulse);
    float outerGlow=exp(-pow((r-centre)/(.115+.025*pulse),2.))*(.045+.09*pulse);
    float wash=(1.-smoothstep(.55,.71,r))*(.012+.09*pulse);
    float edge=1.-smoothstep(.90,1.,r);gl_FragColor=vec4(tint,max(nearGlow+outerGlow,wash)*edge);
#include <colorspace_fragment>
}`});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(radius*DRUM_NEON_STYLE.glowSpan,radius*DRUM_NEON_STYLE.glowSpan),glowMaterial);
  halo.name=`drum-neon-glow-${surface.id}`;halo.rotation.x=-Math.PI/2;halo.position.y=y-.0002;halo.renderOrder=3;parent.add(halo);
  const waveMaterial=material.clone();waveMaterial.alphaMap=null;waveMaterial.opacity=0;
  const wave=new THREE.Mesh(new THREE.RingGeometry(.92,1,64),waveMaterial);wave.name=`drum-hit-wave-${surface.id}`;wave.rotation.x=-Math.PI/2;wave.position.y=surface.height+.019;wave.visible=false;wave.renderOrder=5;parent.add(wave);
  return{id:surface.id,rim,halo,wave,age:Infinity,velocity:1,radius:surface.radius};
 });
 return{
  hit(id:string,velocity:number){const state=states.find(s=>s.id===id);if(state){state.age=0;state.velocity=velocity;state.rim.material.opacity=DRUM_NEON_STYLE.hitOpacity;state.halo.material.uniforms.pulse.value=velocity;state.wave.visible=true;}},
  update(delta:number){for(const state of states){state.age+=delta;const t=state.age/DRUM_NEON_STYLE.duration,boost=Math.max(0,1-t)**2*state.velocity;
   state.rim.material.opacity=DRUM_NEON_STYLE.idleOpacity+(DRUM_NEON_STYLE.hitOpacity-DRUM_NEON_STYLE.idleOpacity)*boost;state.halo.material.uniforms.pulse.value=boost;
   state.wave.visible=t<1;if(t>=1)state.wave.scale.setScalar(1);else{state.wave.scale.setScalar(state.radius*(.20+1.05*t));state.wave.material.opacity=.72*(1-t)**2*state.velocity;}
  }},
  dispose(){for(const state of states)for(const mesh of[state.rim,state.halo,state.wave]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}softRim.dispose();},
 };
}
