import * as THREE from 'three';
import type {DrumHitSurface} from './vrStickCollision';
import {DRUM_ACCENTS} from './vrLaneConfig';
export {DRUM_ACCENTS} from './vrLaneConfig';
export const DRUM_NEON_STYLE={rimInner:.958,rimOuter:1.006,idleOpacity:.38,hitOpacity:.70,duration:.24} as const;
// Physical-hit feedback has its own pooled geometry; it never depends on score notes.
export function createVRDrumFeedback(surfaces:DrumHitSurface[],visuals?:Map<string,{head:THREE.Mesh}>){
 // One shared soft alpha texture; no per-hit particles or canvas uploads.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64);
 for(const [stop,color] of [[0,'#000'],[.952,'#000'],[.967,'#fff'],[.985,'#fff'],[1,'#000']] as const)gradient.addColorStop(stop,color);ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const softRim=new THREE.CanvasTexture(canvas);
 let time=0;
 const states=surfaces.map((surface,index)=>{
  const parent=visuals?.get(surface.id)?.head??surface.mesh;
  const material=new THREE.MeshBasicMaterial({color:DRUM_ACCENTS[surface.id],alphaMap:softRim,transparent:true,opacity:DRUM_NEON_STYLE.idleOpacity,depthTest:false,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const rim=new THREE.Mesh(new THREE.RingGeometry(surface.radius*DRUM_NEON_STYLE.rimInner,surface.radius*DRUM_NEON_STYLE.rimOuter,96),material);
  rim.name=`drum-accent-rim-${surface.id}`;rim.rotation.x=-Math.PI/2;rim.position.y=surface.height+.016;rim.renderOrder=4;parent.add(rim);
  const glowMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
   uniforms:{tint:{value:new THREE.Color(DRUM_ACCENTS[surface.id])},pulse:{value:0},time:{value:index*.73}},
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec2 vUv;uniform vec3 tint;uniform float pulse;uniform float time;void main(){
    vec2 p=(vUv-.5)*2.;float r=length(p),angle=atan(p.y,p.x),centre=.555556;
    float halo=exp(-pow((r-centre)/(.10+.04*pulse),2.))*(.64+.28*pulse);
    float spread=exp(-pow((r-centre)/(.19+.025*pulse),2.))*(.20+.12*pulse);
    float wash=(1.-smoothstep(.40,.56,r))*(.07+.17*pulse);
    float sparkle=pow(max(0.,sin(angle*17.+sin(angle*7.)*2.)),32.)*pow(max(0.,sin(time*1.7+angle*5.)),12.)*exp(-pow((r-centre)/.026,2.))*.23;
    float edge=1.-smoothstep(.88,1.,r);gl_FragColor=vec4(mix(tint,vec3(1.),sparkle*.25),min(.96,max(halo+spread,wash)+sparkle)*edge);
#include <colorspace_fragment>
}`});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(surface.radius*3.6,surface.radius*3.6),glowMaterial);halo.name=`drum-neon-glow-${surface.id}`;halo.rotation.x=-Math.PI/2;halo.position.y=surface.height+.014;halo.renderOrder=3;parent.add(halo);
  const waveMaterial=material.clone();waveMaterial.alphaMap=null;waveMaterial.opacity=0;
  const wave=new THREE.Mesh(new THREE.RingGeometry(.92,1,64),waveMaterial);wave.name=`drum-hit-wave-${surface.id}`;wave.rotation.x=-Math.PI/2;wave.position.y=surface.height+.019;wave.visible=false;wave.renderOrder=5;parent.add(wave);
  return{id:surface.id,rim,halo,wave,age:Infinity,velocity:1,radius:surface.radius};
 });
 return{
  hit(id:string,velocity:number){const state=states.find(s=>s.id===id);if(state){state.age=0;state.velocity=velocity;state.rim.material.opacity=DRUM_NEON_STYLE.hitOpacity;state.halo.material.uniforms.pulse.value=velocity;state.wave.visible=true;}},
  update(delta:number){time+=Math.max(0,delta);for(const [index,state] of states.entries()){state.halo.material.uniforms.time.value=time+index*.73;state.age+=delta;const t=state.age/DRUM_NEON_STYLE.duration,boost=Math.max(0,1-t)**2*state.velocity;
   state.rim.material.opacity=DRUM_NEON_STYLE.idleOpacity+(DRUM_NEON_STYLE.hitOpacity-DRUM_NEON_STYLE.idleOpacity)*boost;state.halo.material.uniforms.pulse.value=boost;
   state.wave.visible=t<1;if(t>=1)state.wave.scale.setScalar(1);else{state.wave.scale.setScalar(state.radius*(.20+1.05*t));state.wave.material.opacity=.72*(1-t)**2*state.velocity;}
  }},
  dispose(){for(const state of states)for(const mesh of[state.rim,state.halo,state.wave]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}softRim.dispose();},
 };
}
