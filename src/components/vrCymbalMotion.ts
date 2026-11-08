import * as THREE from 'three';
import type {DrumHitSurface} from './vrStickCollision';

// Radians, seconds and local model units. Only the visible cymbal plates move.
export const VR_CYMBAL_MOTION = {
  open: {amplitude:.075, frequency:26, damping:5.5, maxTilt:.11},
  closed: {amplitude:.002, frequency:38, damping:18, maxTilt:.003},
  crash: {amplitude:.14, frequency:20, damping:3.2, maxTilt:.22},
  closeSeconds:.09, openSeconds:.13, contactSeconds:.055, contactLift:.0005,
  rimClearance:.00015, upperRimThickness:.0012, sleepAngle:.00001,
} as const;
type Axis={angle:number;velocity:number};
function advance(axis:Axis,delta:number,frequency:number,damping:number){
  const w=Math.sqrt(frequency*frequency-damping*damping),e=Math.exp(-damping*delta),c=Math.cos(w*delta),s=Math.sin(w*delta),x=axis.angle,v=axis.velocity;
  axis.angle=e*(x*c+(v+damping*x)/w*s);
  axis.velocity=e*(v*c-(damping*v+frequency*frequency*x)/w*s);
  if(Math.abs(axis.angle)<VR_CYMBAL_MOTION.sleepAngle&&Math.abs(axis.velocity)<.0001){axis.angle=0;axis.velocity=0;}
}
export function createVRCymbalMotion(surfaces:DrumHitSurface[],lower?:THREE.Mesh|null){
  const states=surfaces.filter(s=>s.id==='hihat'||s.id==='crash').map(surface=>{
    const source=surface.mesh,parent=source.parent!,edge=parent.children.find(o=>o instanceof THREE.Mesh&&o.geometry.type==='TorusGeometry');
    const lift=new THREE.Group(),pivot=new THREE.Group();lift.name=`cymbal-lift-${surface.id}`;pivot.name=`cymbal-wobble-${surface.id}`;parent.add(lift);lift.add(pivot);
    // Keep the original hit/raycast mesh and its world transform untouched.
    const plate=source.clone(false);plate.name=`cymbal-visual-${surface.id}`;pivot.add(plate);const visible=source.visible;source.visible=false;
    const edgeParent=edge?.parent,edgePosition=edge?.position.clone(),edgeQuaternion=edge?.quaternion.clone();if(edge)pivot.add(edge);
    const upperEdgeY=edgePosition?.y??0;
    const closedY=surface.id==='hihat'&&lower?lower.position.y-upperEdgeY+VR_CYMBAL_MOTION.upperRimThickness+VR_CYMBAL_MOTION.rimClearance:0;
    return {id:surface.id,source,plate,visible,edge,edgeParent,edgePosition,edgeQuaternion,lift,pivot,closedY,radius:surface.radius+VR_CYMBAL_MOTION.upperRimThickness,x:{angle:0,velocity:0},z:{angle:0,velocity:0},closed:true,from:closedY,to:closedY,baseY:closedY,transition:1,contact:Infinity};
  });
  const visuals=new Map(states.map(s=>[s.id,{head:s.plate}]));
  function setClosed(closed:boolean){const state=states.find(s=>s.id==='hihat');if(!state||state.closed===closed)return;state.closed=closed;state.from=state.baseY;state.to=closed?state.closedY:0;state.transition=0;state.contact=Infinity;}
  function update(delta:number){
    const dt=Math.max(0,Number.isFinite(delta)?delta:0);
    for(const state of states){
      const style=state.id==='crash'?VR_CYMBAL_MOTION.crash:state.closed?VR_CYMBAL_MOTION.closed:VR_CYMBAL_MOTION.open;
      advance(state.x,dt,style.frequency,style.damping);advance(state.z,dt,style.frequency,style.damping);
      state.x.angle=THREE.MathUtils.clamp(state.x.angle,-style.maxTilt,style.maxTilt);state.z.angle=THREE.MathUtils.clamp(state.z.angle,-style.maxTilt,style.maxTilt);
      if(state.id==='hihat'){
        const before=state.transition;state.transition=Math.min(1,state.transition+dt/(state.closed?VR_CYMBAL_MOTION.closeSeconds:VR_CYMBAL_MOTION.openSeconds));const t=state.transition*state.transition*(3-2*state.transition);state.baseY=THREE.MathUtils.lerp(state.from,state.to,t);
        if(before<1&&state.transition===1&&state.closed)state.contact=0;else state.contact+=dt;
      }
      // Rotation is derived from rest every frame, never accumulated on the mesh.
      state.pivot.rotation.set(state.x.angle,0,state.z.angle);
      const tilt=Math.acos(THREE.MathUtils.clamp(Math.cos(state.x.angle)*Math.cos(state.z.angle),-1,1));
      // The lowest top rim stays above the fixed lower rim, including closed hits.
      const safeY=state.id==='hihat'?state.closedY+state.radius*Math.sin(tilt):-Infinity;
      const contact=state.contact<VR_CYMBAL_MOTION.contactSeconds?VR_CYMBAL_MOTION.contactLift*Math.sin(Math.PI*state.contact/VR_CYMBAL_MOTION.contactSeconds)**2:0;
      state.lift.position.y=Math.max(state.baseY,safeY)+contact;
    }
  }
  update(0);
  return {visuals,setClosed,update,
    hit(id:string,velocity:number){const state=states.find(s=>s.id===id);if(!state)return;const style=id==='crash'?VR_CYMBAL_MOTION.crash:state.closed?VR_CYMBAL_MOTION.closed:VR_CYMBAL_MOTION.open;
      state.x.velocity=THREE.MathUtils.clamp(state.x.velocity+style.amplitude*style.frequency*velocity,-style.maxTilt*style.frequency,style.maxTilt*style.frequency);
      state.z.velocity=THREE.MathUtils.clamp(state.z.velocity+style.amplitude*style.frequency*.48*velocity,-style.maxTilt*style.frequency*.6,style.maxTilt*style.frequency*.6);
    },
    dispose(){for(const s of states){s.source.visible=s.visible;if(s.edge&&s.edgeParent){s.edgeParent.add(s.edge);s.edge.position.copy(s.edgePosition!);s.edge.quaternion.copy(s.edgeQuaternion!);}s.plate.removeFromParent();s.lift.removeFromParent();}},
  };
}
