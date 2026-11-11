import * as THREE from 'three';
export const WORLD_PANEL_LIMITS = { minScale:.55,maxScale:1.75,minDistance:.70,maxDistance:4.5,deadzone:.3,scaleSpeed:.85,distanceSpeed:.85 } as const;
// Shared opt-in grab/scale/distance behavior for any world-fixed panel.
// Up/negative Y = farther; down = nearer. Left/right scales.
// Thumbsticks are inert until this panel's handle is held with Trigger.
export function createWorldPanelTransform(mesh:THREE.Object3D,rig:THREE.Group,key:string|null,options?:{
  translationOnly?:boolean; constrainPosition?:(position:THREE.Vector3,eye:THREE.Vector3)=>void;
}) {
  let input:XRInputSource|null=null;
  const candidate=new THREE.Matrix4(),world=new THREE.Matrix4(),relative=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),offset=new THREE.Vector3(),grabOffset=new THREE.Vector3();
  function grip(source:XRInputSource,frame:XRFrame,reference:XRReferenceSpace|null){
    const pose=reference&&source.gripSpace?frame.getPose(source.gripSpace,reference):null;if(!pose||pose.emulatedPosition)return false;
    rig.updateWorldMatrix(true,false);world.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld);return true;
  }
  function save(){if(!key)return;try{localStorage.setItem(key,JSON.stringify({version:1,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.x}));}catch{/* Keep current session pose. */}}
  function constrain(eye:THREE.Vector3){offset.copy(mesh.position).sub(eye);const distance=offset.length();if(distance<1e-6)offset.set(0,0,-1);else offset.divideScalar(distance);mesh.position.copy(eye).addScaledVector(offset,THREE.MathUtils.clamp(distance,WORLD_PANEL_LIMITS.minDistance,WORLD_PANEL_LIMITS.maxDistance));}
  return {
    get input(){return input;},save,
    load(eye:THREE.Vector3){if(!key)return false;try{const pose=JSON.parse(localStorage.getItem(key)??'null');
      if(pose?.version!==1||!Array.isArray(pose.position)||pose.position.length!==3||!pose.position.every((v:number)=>Number.isFinite(v)&&Math.abs(v)<30)
        ||!Array.isArray(pose.quaternion)||pose.quaternion.length!==4||!pose.quaternion.every(Number.isFinite)||Math.abs(Math.hypot(...pose.quaternion)-1)>.01)return false;
      position.fromArray(pose.position).sub(eye);if(position.length()<WORLD_PANEL_LIMITS.minDistance-.001||position.length()>WORLD_PANEL_LIMITS.maxDistance+.001||position.z>.25)return false;
      const size=pose.scale??1;if(!Number.isFinite(size)||size<WORLD_PANEL_LIMITS.minScale-.0001||size>WORLD_PANEL_LIMITS.maxScale+.0001)return false;
      mesh.position.fromArray(pose.position);mesh.quaternion.fromArray(pose.quaternion).normalize();mesh.scale.setScalar(THREE.MathUtils.clamp(size,WORLD_PANEL_LIMITS.minScale,WORLD_PANEL_LIMITS.maxScale));mesh.updateWorldMatrix(true,true);return true;
    }catch{return false;}},
    begin(source:XRInputSource,frame:XRFrame,reference:XRReferenceSpace|null){if(input||!grip(source,frame,reference))return false;
      mesh.updateWorldMatrix(true,true);relative.copy(world).invert().multiply(mesh.matrixWorld);
      if(options?.translationOnly)grabOffset.setFromMatrixPosition(world).negate().add(mesh.position);
      input=source;return true;},
    update(source:XRInputSource,frame:XRFrame,reference:XRReferenceSpace|null,eye:THREE.Vector3,delta=0){if(input!==source||!grip(source,frame,reference))return false;
      if(options?.translationOnly){
        mesh.position.setFromMatrixPosition(world).add(grabOffset);
        if(options.constrainPosition)options.constrainPosition(mesh.position,eye);else constrain(eye);
        mesh.updateWorldMatrix(true,true);return true;
      }
      candidate.copy(world).multiply(relative).decompose(mesh.position,mesh.quaternion,scale);mesh.scale.copy(scale);
      const axes=source.gamepad?.axes,buttons=source.gamepad?.buttons;
      const vertical=(axes?.[3]??axes?.[1]??0)+(buttons?.[13]?.pressed?1:0)-(buttons?.[12]?.pressed?1:0);
      const horizontal=(axes?.[2]??axes?.[0]??0)+(buttons?.[15]?.pressed?1:0)-(buttons?.[14]?.pressed?1:0);
      const dt=Math.min(.05,Math.max(0,delta));let adjusted=false;
      if(Math.abs(horizontal)>WORLD_PANEL_LIMITS.deadzone){mesh.scale.setScalar(THREE.MathUtils.clamp(mesh.scale.x*Math.exp(horizontal*dt*WORLD_PANEL_LIMITS.scaleSpeed),WORLD_PANEL_LIMITS.minScale,WORLD_PANEL_LIMITS.maxScale));adjusted=true;}
      if(Math.abs(vertical)>WORLD_PANEL_LIMITS.deadzone){offset.copy(mesh.position).sub(eye).normalize();mesh.position.addScaledVector(offset,-vertical*dt*WORLD_PANEL_LIMITS.distanceSpeed);adjusted=true;}
      const before=position.copy(mesh.position);constrain(eye);adjusted ||= before.distanceToSquared(mesh.position)>1e-10;
      mesh.updateWorldMatrix(true,true);if(adjusted)relative.copy(world).invert().multiply(mesh.matrixWorld);return true;
    },
    finish(source?:XRInputSource){if(input&&(!source||input===source)){input=null;save();}},
  };
}
export type WorldPanelTransform=ReturnType<typeof createWorldPanelTransform>;
