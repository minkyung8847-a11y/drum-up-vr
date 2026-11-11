import { openVRPractice } from './helpers/open-vr-practice.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installMockWebXR} from './helpers/mock-webxr.mjs';
import {installUnifiedPanelControls} from './helpers/unified-panel-controls.mjs';
const vite=await createServer({server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(installMockWebXR,{mode:'switchable'});await openVRPractice(page, `${vite.resolvedUrls.local[0]}#/vr`);await page.locator('.vr-practice-hint').filter({hasText:'Click to play'}).waitFor({timeout:30000});
 const result=await page.evaluate(async()=>{
  const T=window.THREE=await import(performance.getEntriesByType('resource').find(e=>/\/three\.js\?/.test(e.name)).name);
  const {createRestoredVRDrumSet}=await import('/src/components/restoredVRDrumSet.ts'),{createVRDrumInteraction}=await import('/src/components/vrDrumInteraction.ts'),{drumSynth}=await import('/src/utils/synth.ts');
  const scene=new T.Scene(),kit=createRestoredVRDrumSet(scene);scene.background=new T.Color(0x101114);scene.add(new T.AmbientLight(0xffffff,1.5));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,6,4);scene.add(light);
  const sources=kit.hitSurfaces.map(s=>s.mesh),visibility=sources.map(o=>o.visible),original=sources.map(o=>{o.updateWorldMatrix(true,false);return o.matrixWorld.toArray();}),lower=kit.hiHatLower,lowerMatrix=lower.matrix.clone();
  const sounds=[],trigger=drumSynth.trigger,choke=drumSynth.chokeOpenHiHat,running=drumSynth.isAudioRunning;drumSynth.trigger=(id)=>sounds.push(id);drumSynth.chokeOpenHiHat=()=>{};drumSynth.isAudioRunning=()=>true;
  const interaction=createVRDrumInteraction(kit),hat=scene.getObjectByName('cymbal-visual-hihat'),crash=scene.getObjectByName('cymbal-visual-crash'),pivot=scene.getObjectByName('cymbal-wobble-hihat');
  const step=(seconds)=>{for(let t=0;t<seconds;t+=1/180)interaction.update(1/180);scene.updateMatrixWorld(true);};
  const localPoint=new T.Vector3(),inverse=lower.matrixWorld.clone().invert();
  const gap=()=>{scene.updateMatrixWorld(true);inverse.copy(lower.matrixWorld).invert();let min=Infinity;const attr=hat.geometry.attributes.position;for(let i=0;i<attr.count;i++){localPoint.fromBufferAttribute(attr,i);if(Math.hypot(localPoint.x,localPoint.z)<kit.hitSurfaces.find(s=>s.id==='hihat').radius*.99)continue;localPoint.applyMatrix4(hat.matrixWorld).applyMatrix4(inverse);min=Math.min(min,-localPoint.y);}return min;};
  const closedGap=gap();assertLocal(closedGap>=0&&closedGap<.002,'closed rims contact '+closedGap);
  interaction.setHiHatClosed(false);step(.14);const openGap=gap();assertLocal(openGap>.03,'open gap '+openGap);
  const peak=(id,seconds)=>{let max=0,late=0;interaction.hit(id);for(let t=0;t<seconds;t+=1/180){interaction.update(1/180);const p=scene.getObjectByName('cymbal-wobble-'+id);const a=Math.hypot(p.rotation.x,p.rotation.z);max=Math.max(max,a);if(t>2&&t<2.3)late=Math.max(late,a);}return{max,late};};
  const open=peak('hihat',1.4);interaction.setHiHatClosed(true);step(.16);const closed=peak('hihat',.6);const crashMotion=peak('crash',3.2);assertLocal(open.max>.04&&closed.max<open.max*.15&&crashMotion.max>open.max*1.5&&crashMotion.max<open.max*2.2&&crashMotion.late>.0001,'relative wobble '+JSON.stringify({open,closed,crashMotion}));
  // Closed rim cannot cross the fixed lower rim, even through rapid repeated hits.
  let minGap=Infinity,maxGap=0;for(let i=0;i<360;i++){if(i%15===0)interaction.hit('hihat');interaction.update(1/180);const g=gap();minGap=Math.min(minGap,g);maxGap=Math.max(maxGap,g);}assertLocal(minGap>=-1e-7&&maxGap<.004,'closed overlap '+minGap+' '+maxGap);
  interaction.setHiHatClosed(false);step(.14);interaction.hit('crash');step(.03);const before=crash.parent.rotation.x;interaction.hit('crash');assertLocal(crash.parent.rotation.x===before,'repeat resets angle');interaction.update(1/180);assertLocal(crash.parent.rotation.x>before,'repeat impulse missing');
  for(let i=0;i<150;i++){interaction.setHiHatClosed(i%2===0);interaction.hit('hihat');interaction.update(.016);}interaction.setHiHatClosed(true);step(8);
  assertLocal(pivot.rotation.x===0&&pivot.rotation.z===0&&gap()<.002,'drift');assertLocal(lower.matrix.equals(lowerMatrix),'lower moved');
  const stable=sources.every((o,i)=>{o.updateWorldMatrix(true,false);return o.matrixWorld.toArray().every((n,j)=>Math.abs(n-original[i][j])<1e-10);});assertLocal(stable,'collision reference moved');
  for(const id of ['hihat','crash'])for(const prefix of ['drum-accent-rim-','drum-neon-glow-','drum-hit-wave-'])assertLocal(scene.getObjectByName(prefix+id).parent===scene.getObjectByName('cymbal-visual-'+id),'neon detached');
  interaction.setHiHatClosed(false);step(.14);interaction.hit('hihat');interaction.setHiHatClosed(true);interaction.hit('hihat');assertLocal(sounds.includes('hihat-open')&&sounds.includes('hihat-closed')&&sounds.includes('hihat-pedal')&&sounds.includes('crash'),'sound mapping changed');
  // Side-by-side side view from the same fixed camera: actual geometry, open and closed.
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(700,500);const camera=new T.PerspectiveCamera(42,1.4,.01,20),centre=new T.Vector3();hat.getWorldPosition(centre);camera.position.copy(centre).add(new T.Vector3(.7,.15,.7));camera.lookAt(centre);
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=500;const ctx=canvas.getContext('2d');
  for(let i=0;i<2;i++){interaction.setHiHatClosed(i===1);step(2);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,i*700,0);ctx.fillStyle='#fff';ctx.font='bold 24px sans-serif';ctx.fillText(i?'CLOSED':'OPEN',i*700+24,35);}const preview=canvas.toDataURL('image/png');renderer.dispose();
  interaction.dispose();assertLocal(sources.every((o,i)=>o.visible===visibility[i])&&!scene.getObjectByName('cymbal-lift-hihat'),'dispose');drumSynth.trigger=trigger;drumSynth.chokeOpenHiHat=choke;drumSynth.isAudioRunning=running;
  const update=T.Scene.prototype.updateMatrixWorld;T.Scene.prototype.updateMatrixWorld=function(...args){if(this.getObjectByName('vr-unified-panel'))window.scene=this;return update.apply(this,args);};
  return{closedGap,openGap,minGap,maxGap,open,closed,crashMotion,preview};
  function assertLocal(ok,message){if(!ok)throw Error(message);}
 });
 const preview=join(tmpdir(),'drum-up-hihat-open-closed.png');await writeFile(preview,Buffer.from(result.preview.split(',')[1],'base64'));delete result.preview;console.log(result);console.log('PREVIEW '+preview);
 await page.waitForFunction(()=>window.scene);await page.getByRole('button',{name:'Enter VR',exact:true}).click();await page.getByRole('button',{name:'Exit VR',exact:true}).waitFor();await page.evaluate(installUnifiedPanelControls);
 const grip=await page.evaluate(()=>{const input=window.testXR.connect('left');input.targetRaySpace={...input.gripSpace};window.panelStep(20);const lift=window.scene.getObjectByName('cymbal-lift-hihat'),lower=window.scene.getObjectByName('cymbal-visual-hihat').parent.parent.parent.children.find(o=>o.userData.drumType==='hihat'&&o.visible);const lowerY=lower?.position.y;const open=lift.position.y;input.gamepad.buttons[1].pressed=true;input.gamepad.buttons[1].value=1;window.panelEmit('squeezestart',input);window.panelStep(20);const closed=lift.position.y;input.gamepad.buttons[1].pressed=false;input.gamepad.buttons[1].value=0;window.panelEmit('squeezeend',input);window.panelStep(25);return{open,closed,reopened:lift.position.y,lowerFixed:lower?.position.y===lowerY};});assert(grip.closed<grip.open-.02&&Math.abs(grip.reopened-grip.open)<1e-8&&grip.lowerFixed,JSON.stringify(grip));assert.deepEqual(errors,[]);console.log('PASS damped additive cymbal impulses, 2-3s crash, geometry-safe closed rim, fixed lower, no drift/collision changes, attached neon, original sound mapping, real left Grip close/reopen. Windows Edge mocked XR; physical Quest not tested.');
}finally{await browser?.close();await vite.close();}
