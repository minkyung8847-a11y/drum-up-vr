import {NEON_STYLE,softNeonColor} from './vrNeonStyle';
import { VR_NEON_LANES, DRUM_ACCENTS as COLORS, VR_LANE_LAYOUT } from './vrLaneConfig';
import * as THREE from 'three';
import type { DrumHitSurface } from './vrStickCollision';
import type { NoteEvent } from '../types';
import { PAD_TO_INSTRUMENT } from './songDrumMapping';
import type { SongWindows } from './songPlayback';
import { NOTE_TRAVEL_TIME } from './songPracticeTiming';
import { VR_BASIC_DRUM_BEAT } from './vrBasicDrumBeat';

export const RHYTHM_BPM = VR_BASIC_DRUM_BEAT.bpm;
export const VR_JUDGMENT_LINE = {
  belowCymbals: .06, depthBehindKit: .25, padding: .12,
  thickness: .006, glowHeight: .045, farDepth: 7, farRise: 1.25,
} as const;
export const VR_NOTE_EFFECT_MS = { success: 200, miss: 160 } as const;
const TRAVEL_MS = 3000, PERFECT_MS = 50, GREAT_MS = 120;
export type RhythmState = 'idle' | 'playing' | 'paused' | 'finished';
export type RhythmJudgment = 'Perfect' | 'Great' | 'Miss';
export type RhythmAction = 'toggle' | 'restart';
type RhythmSurface = DrumHitSurface & { world: THREE.Matrix4 };
type ProgressCallback = (perfect: number, great: number, miss: number, scoreTime: number) => void;
export type RhythmAudio = Pick<HTMLAudioElement, 'currentTime' | 'paused' | 'seeking' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>;
type ScoreMedia = { notes: readonly NoteEvent[]; audio: RhythmAudio; offset: number; windows: SongWindows;
  noteSyncMs?: number; timingDebug?: { contextAt: (timelineSeconds: number) => number; outputTime: () => number };
  onResults?: ProgressCallback };
export function captureRhythmSurfaces(surfaces: DrumHitSurface[]): RhythmSurface[] {
  return surfaces.map(surface => ({ ...surface, world: surface.mesh.matrixWorld.clone() }));
}

export function createVRNoteLanes(surfaces: RhythmSurface[], _eye: THREE.Vector3) {
  // Capture the authored kit once. All endpoints share world Y/Z, independent
  // of head pose or the individual drum/cymbal surface's height and tilt.
  const centres = surfaces.map(surface => ({ id: surface.id, cymbal: surface.cymbal,
    position: new THREE.Vector3(0, surface.height, 0).applyMatrix4(surface.world),
    radius: surface.radius * new THREE.Vector3().setFromMatrixColumn(surface.world, 0).length() }));
  const upperCymbals = centres.filter(s => s.cymbal && s.id !== 'hihat');
  const tomTop = Math.max(...centres.filter(s => /Tom/.test(s.id)).map(s => s.position.y));
  const y = Math.max(tomTop + .035, Math.min(...upperCymbals.map(s => s.position.y)) - VR_JUDGMENT_LINE.belowCymbals);
  const z = Math.min(...centres.map(s => s.position.z)) - VR_JUDGMENT_LINE.depthBehindKit;
  const kick = centres.find(surface=>surface.id==='kick')!;
  const leftTom = centres.find(surface=>surface.id==='smallTom')!, rightTom = centres.find(surface=>surface.id==='middleTom')!;
  const spacing = THREE.MathUtils.clamp(Math.abs(rightTom.position.x-leftTom.position.x)/2,VR_LANE_LAYOUT.minimumSpacing,VR_LANE_LAYOUT.maximumSpacing);
  const kickIndex = VR_NEON_LANES.findIndex(lane=>lane.id==='kick');
  const centreX = kick.position.x;
  const targets = VR_NEON_LANES.map((_,index)=>new THREE.Vector3(centreX+(index-kickIndex)*spacing,y,z));
  const halfWidth = Math.max(...targets.map(target=>Math.abs(target.x-centreX)+spacing*.5),...centres.map(s=>Math.abs(s.position.x-centreX)+s.radius)) + VR_JUDGMENT_LINE.padding;
  const minX=centreX-halfWidth,maxX=centreX+halfWidth;
  const layout={minX,maxX,y,z,centreX,spacing};
  let heightDelta=0;
  const positions:THREE.Vector3[]=[],colors:number[]=[];
  const paths:Map<string,(progress:number,out:THREE.Vector3)=>THREE.Vector3>=new Map(VR_NEON_LANES.map((lane,index)=>{
    const target=targets[index],start=new THREE.Vector3(target.x,y+VR_JUDGMENT_LINE.farRise,z-VR_JUDGMENT_LINE.farDepth);
    positions.push(target,start);const color=new THREE.Color(lane.color);colors.push(color.r,color.g,color.b,color.r,color.g,color.b);
    // Equal X at start/end: independent parallel world-space paths; perspective comes from the camera.
    return [lane.id,(progress:number,out:THREE.Vector3)=>out.set(target.x,target.y+heightDelta+VR_JUDGMENT_LINE.farRise*progress,target.z-VR_JUDGMENT_LINE.farDepth*progress)] as const;
  }));
  const geometry=new THREE.BufferGeometry().setFromPoints(positions);geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.LineBasicMaterial({visible:false,color:0xffffff,transparent:true,opacity:.30,depthTest:false,depthWrite:false,toneMapped:false});
  const lines=new THREE.LineSegments(geometry,material);lines.name='vr-note-lanes';lines.renderOrder=1;
  // One quad batch, one material/pass for all lane cores and soft VR glow.
  const ribbonPositions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<positions.length;i+=2){const end=positions[i],start=positions[i+1],base=ribbonPositions.length/3;
    for(const p of [end,start])for(const dx of [-.011,.011])ribbonPositions.push(p.x+dx,p.y,p.z);
    uvs.push(0,0,1,0,0,1,1,1);indices.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  const ribbonGeometry=new THREE.BufferGeometry();ribbonGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ribbonPositions,3));ribbonGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));ribbonGeometry.setIndex(indices);
  const ribbonMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,uniforms:{arMode:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;uniform float arMode;void main(){float d=abs(vUv.x-.5)*2.;float aa=min(.8,fwidth(d)*.65);float core=1.-smoothstep(.12-aa,.23+aa,d);float halo=exp(-d*d*9.)*.10;float alpha=mix(core*.66+halo,core*.84,arMode);gl_FragColor=vec4(mix(vec3(.94,.96,1.),vec3(.018,.022,.028),arMode),alpha);\n#include <colorspace_fragment>\n}'});
  const ribbons=new THREE.Mesh(ribbonGeometry,ribbonMaterial);ribbons.name='vr-lane-ribbons';ribbons.renderOrder=1;lines.add(ribbons);
  const markerGeometry=new THREE.RingGeometry(.017,VR_LANE_LAYOUT.markerRadius,40);
  const markers=VR_NEON_LANES.map((lane,index)=>{
    const marker=new THREE.Mesh(markerGeometry,new THREE.MeshBasicMaterial({color:lane.color,transparent:true,opacity:.8,depthTest:false,depthWrite:false,toneMapped:false}));
    marker.name='lane-point-'+lane.id;marker.position.copy(targets[index]);marker.renderOrder=4;lines.add(marker);return marker;
  });
  const lineGeometry = new THREE.PlaneGeometry(maxX - minX, VR_JUDGMENT_LINE.glowHeight);
  const lineMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { core: { value: VR_JUDGMENT_LINE.thickness / VR_JUDGMENT_LINE.glowHeight } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv; uniform float core; void main(){float y=abs(vUv.y-.5)*2.; float edge=smoothstep(0.,.07,vUv.x)*smoothstep(0.,.07,1.-vUv.x); float a=(.82*(1.-smoothstep(core*.4,core,y))+.16*exp(-y*y*9.))*edge;gl_FragColor=vec4(.91,.94,1.,a);}' });
  const judgmentLine = new THREE.Mesh(lineGeometry, lineMaterial); judgmentLine.name = 'vr-judgment-line';
  judgmentLine.position.set(layout.centreX, y, z); judgmentLine.renderOrder = 3; lines.add(judgmentLine);
  return { lines, paths, layout, judgmentLine,
    shiftHeight(delta:number) { heightDelta+=delta;lines.position.y+=delta;layout.y+=delta;lines.updateWorldMatrix(true,true); },
    setPassthrough(enabled: boolean) { ribbonMaterial.uniforms.arMode.value=enabled?1:0;material.color.setHex(enabled?0x11151b:0xffffff); },
    dispose() { lines.removeFromParent(); geometry.dispose(); material.dispose(); ribbonGeometry.dispose();ribbonMaterial.dispose(); lineGeometry.dispose(); lineMaterial.dispose(); markerGeometry.dispose(); markers.forEach(marker=>marker.material.dispose()); } };
}

export function createVRNoteHighway(scene: THREE.Scene, surfaces: RhythmSurface[],
  paths: ReturnType<typeof createVRNoteLanes>['paths'], onStatus: (state: RhythmState, judgment?: RhythmJudgment) => void,
  media?: ScoreMedia, onProgress?: ProgressCallback) {
  const anchor = new THREE.Group(); anchor.name = 'note-highway-anchor'; scene.add(anchor);
  const ringCanvas = document.createElement('canvas'); ringCanvas.width = ringCanvas.height = 128;
  const ctx = ringCanvas.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [stop, alpha] of [[0,0],[.48,0],[.57,.1],[.64,1],[.70,1],[.77,.18],[1,0]]) gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  const texture = new THREE.CanvasTexture(ringCanvas), geometry = new THREE.PlaneGeometry(1,1);
  const flashCanvas = document.createElement('canvas'); flashCanvas.width = flashCanvas.height = 64;
  const flashContext = flashCanvas.getContext('2d')!, glow = flashContext.createRadialGradient(32,32,0,32,32,32);
  glow.addColorStop(0,'#fff'); glow.addColorStop(.3,'#ffffff90'); glow.addColorStop(1,'#ffffff00');
  flashContext.fillStyle = glow; flashContext.fillRect(0,0,64,64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const material = (color: number) => new THREE.MeshBasicMaterial({ color, map: texture,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const targets = [...paths.values()].map(path => path(0, new THREE.Vector3()));
  const width = Math.max(...targets.map(p => p.x)) - Math.min(...targets.map(p => p.x));
  const noteSize = THREE.MathUtils.clamp(width / Math.max(1, surfaces.length - 1) * .72, .14, .20);
  const noteMaterials = new Set<THREE.ShaderMaterial>();
  const lanes = new Map(surfaces.map(({id}) => [id, { positionAt: paths.get(id)!, noteMaterial: new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { tint: { value: softNeonColor(COLORS[id] ?? 0xffffff) }, fill: { value: 0 },ringAlpha:{value:NEON_STYLE.noteRingOpacity},fillMin:{value:NEON_STYLE.noteFillMin},fillMax:{value:NEON_STYLE.noteFillMax},glowAlpha:{value:NEON_STYLE.noteGlowOpacity} },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 tint;uniform float fill;uniform float ringAlpha;uniform float fillMin;uniform float fillMax;uniform float glowAlpha;void main(){float r=length((vUv-.5)*2.);float ring=smoothstep(.615,.65,r)*(1.-smoothstep(.69,.74,r));float halo=exp(-pow((r-.675)*17.,2.))*glowAlpha;float radius=.615*sqrt(clamp(fill,0.,1.));float disc=fill>.0001?1.-smoothstep(radius-.012,radius+.012,r):0.;float a=max(min(.80,ring*ringAlpha+halo),disc*mix(fillMin,fillMax,fill));gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}'
  }), noteSize }]));
  const labelTextures = new Map<RhythmJudgment, THREE.CanvasTexture>();
  for (const text of ['Perfect','Great','Miss'] as const) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d')!; context.font = '600 36px Arial'; context.textAlign = 'center';
    context.fillStyle = text === 'Miss' ? '#9ba1ac' : '#f3f5fa'; context.fillText(text.toUpperCase(),128,45);
    labelTextures.set(text,new THREE.CanvasTexture(canvas));
  }
  // Fixed pool: no texture/canvas/material allocation on a strike, even for chords.
  const effects = Array.from({length: 16}, (_, index) => {
    const ghost = new THREE.Mesh(geometry, material(0xffffff)), ripple = new THREE.Mesh(geometry, material(0xffffff));
    const flash = new THREE.Mesh(geometry, material(0xffffff));
    flash.material.map = flashTexture;
    const label = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: labelTextures.get('Perfect'),
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    const group = new THREE.Group(); group.name = `rhythm-hit-effect-${index}`; group.visible = false; anchor.add(group);
    group.add(ghost,ripple,flash,label); group.children.forEach(mesh => { mesh.renderOrder = 5; });
    return { group, ghost, ripple, flash, label, at: -Infinity, duration: 200, success: true, size: noteSize,
      origin: new THREE.Vector3(), target: new THREE.Vector3() };
  });
  const travel = media ? NOTE_TRAVEL_TIME * 1000 : TRAVEL_MS;
  const perfectWindow = media?.windows.perfect ?? PERFECT_MS, greatWindow = media?.windows.great ?? GREAT_MS;
  const earlyWindow = media ? greatWindow : travel * .15;
  const events = media ? media.notes.map(note => ({ id: note.instrument ?? PAD_TO_INSTRUMENT[note.padId], arrival: note.time * 1000 }))
    : VR_BASIC_DRUM_BEAT.events.map(note => ({id: note.id, arrival: travel + note.hitTimeMs}));
  type NoteMesh = THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  const pool: NoteMesh[] = [];
  let noteSyncMs = media?.noteSyncMs ?? 0;
  const notes = events.filter(event => lanes.has(event.id)).sort((a,b) => a.arrival-b.arrival).map(({id,arrival}) => ({
    id, lane: lanes.get(id)!, arrival: arrival + noteSyncMs, arrivalObserved: false, mesh: undefined as NoteMesh | undefined, resolved: false }));
  const showNote = (note: typeof notes[number]) => {
    if (!note.mesh) {
      note.mesh = pool.pop() ?? new THREE.Mesh(geometry,note.lane.noteMaterial.clone());
      noteMaterials.add(note.mesh.material); anchor.add(note.mesh);
    }
    note.mesh.name = `note-${note.id}-${note.arrival}`; note.mesh.material.uniforms.tint.value.copy(note.lane.noteMaterial.uniforms.tint.value);
    note.mesh.renderOrder = 2; note.mesh.visible = true; return note.mesh;
  };
  const hideNote = (note: typeof notes[number]) => {
    if (!note.mesh) return; note.mesh.visible = false; note.mesh.removeFromParent(); pool.push(note.mesh); note.mesh = undefined;
  };
  let refreshOnSeek = false;
  let state: RhythmState = 'idle', epoch = 0, pauseAt = 0, perfect = 0, great = 0, miss = 0;
  // Deliberately identical to the existing audio-based timing equation.
  const elapsedAt = (now: number) => media ? (media.audio.currentTime - media.offset) * 1000 : (state === 'paused' ? pauseAt : now) - epoch;
  const report = (now: number) => (media?.onResults ?? onProgress)?.(perfect,great,miss,(elapsedAt(now)-(media ? 0 : travel))/1000);
  function updateEffects(elapsed: number) {
    for (const effect of effects) {
      if (!effect.group.visible) continue;
      const t = THREE.MathUtils.clamp((elapsed-effect.at)/effect.duration,0,1);
      if (t >= 1) { effect.group.visible = false; continue; }
      effect.ghost.position.copy(effect.origin); effect.ghost.scale.set(effect.size*(1-.92*t),effect.size*(1-.92*t)/NEON_STYLE.noteAspect,1);
      effect.ghost.material.opacity = (effect.success ? 1 : .22)*(1-t)**2;
      effect.ripple.visible = effect.flash.visible = effect.success;
      effect.ripple.position.copy(effect.origin); effect.ripple.scale.set(effect.size*(1+2.2*t),effect.size*(1+2.2*t)/NEON_STYLE.noteAspect,1); effect.ripple.material.opacity = .55*(1-t)**2;
      effect.flash.position.copy(effect.target); effect.flash.scale.set(effect.size*(1+1.2*t),.045,1); effect.flash.material.opacity = .75*(1-t)**3;
      effect.label.position.copy(effect.origin); effect.label.position.y += .17 + .035*t; effect.label.scale.set(.28,.07,1); effect.label.material.opacity = (effect.success ? 1 : .45)*(1-t);
    }
  }
  function effectAt(lane: typeof notes[number]['lane'], arrival: number, elapsed: number, judgment: RhythmJudgment) {
    const effect = effects.find(e => !e.group.visible) ?? effects.reduce((a,b) => a.at < b.at ? a : b);
    effect.at = elapsed; effect.success = judgment !== 'Miss'; effect.duration = effect.success ? VR_NOTE_EFFECT_MS.success : VR_NOTE_EFFECT_MS.miss;
    effect.size = lane.noteSize; lane.positionAt((arrival-elapsed)/travel,effect.origin); lane.positionAt(0,effect.target);
    effect.label.material.map = labelTextures.get(judgment)!; effect.group.userData.judgment = judgment; effect.group.visible = true;
    updateEffects(elapsed);
  }
  function setState(next: RhythmState) { state = next; onStatus(state); }
  function clear() {
    perfect = great = miss = 0;
    for (const note of notes) { note.resolved = false; note.arrivalObserved = false; hideNote(note); }
    effects.forEach(effect => { effect.group.visible = false; });
  }
  function play() { setState('playing'); if (media) void media.audio.play().catch(() => { if (state === 'playing' && media.audio.paused) setState('paused'); }); }
  function restart(now: number) { clear(); epoch = now; if (media) { media.audio.currentTime = 0; onSeeked(); } play(); }
  function pause(now: number) { if (state !== 'playing') return false; pauseAt = now; media?.audio.pause(); setState('paused'); return true; }
  function judge(id: string, now: number): RhythmJudgment | undefined {
    if (state !== 'playing' || (media && (media.audio.paused || media.audio.seeking))) return;
    const elapsed = elapsedAt(now); let closest: typeof notes[number] | undefined, distance = Infinity;
    for (const note of notes) {
      if (note.arrival > elapsed + earlyWindow) break;
      if (note.resolved || note.id !== id || note.arrival < elapsed-greatWindow) continue;
      const offset = Math.abs(elapsed-note.arrival); if (offset < distance) { closest = note; distance = offset; }
    }
    if (!closest) return 'Miss';
    closest.resolved = true; hideNote(closest);
    const judgment: RhythmJudgment = distance > greatWindow + 1e-6 ? 'Miss' : distance <= perfectWindow + 1e-6 ? 'Perfect' : 'Great';
    if (judgment === 'Perfect') perfect++; else if (judgment === 'Great') great++; else miss++;
    effectAt(closest.lane,closest.arrival,elapsed,judgment); report(now); return judgment;
  }
  function onSeeked() { clear(); refreshOnSeek = true; const elapsed = elapsedAt(0); for (const note of notes) note.resolved = note.arrival < elapsed-greatWindow; }
  function finish(now: number) {
    for (const note of notes) { if (!note.resolved) { note.resolved = true; miss++; } hideNote(note); }
    effects.forEach(effect => { effect.group.visible = false; }); setState('finished'); report(now);
  }
  const onEnded = () => finish(0);
  media?.audio.addEventListener('seeked',onSeeked); media?.audio.addEventListener('ended',onEnded);
  return {
    setNoteSyncMs(value: number) { if (!media) return; const delta = value-noteSyncMs; noteSyncMs=value; for (const note of notes) note.arrival+=delta; },
    restart, pause,
    shiftHeight(delta:number) {
      for(const note of notes) if(note.mesh) note.mesh.position.y+=delta;
      for(const effect of effects){effect.origin.y+=delta;effect.target.y+=delta;for(const mesh of effect.group.children)mesh.position.y+=delta;}
    },
    seekTo(timelineSeconds: number, now: number) {
      if (!media || !Number.isFinite(timelineSeconds)) return;
      const resume = state === 'playing'; media.audio.pause(); media.audio.currentTime = Math.max(media.offset,timelineSeconds);
      onSeeked(); if (resume) play(); else setState('paused'); report(now);
    },
    toggle(now: number) { if (state === 'playing') pause(now); else if (state === 'paused') { epoch+=now-pauseAt; play(); } else restart(now); },
    stop() { media?.audio.pause(); clear(); setState('idle'); },
    strike(id: string, now: number) {
      const judgment=judge(id,now); if (judgment) onStatus(state,judgment); return judgment;
    },
    update(now: number, _viewer: THREE.Vector3) {
      // No note movement, expiration, judging or effect decay while paused.
      if (state !== 'playing' && !(state === 'paused' && refreshOnSeek)) return;
      if (state === 'playing' && media && media.audio.paused) return;
      refreshOnSeek = false;
      const elapsed=elapsedAt(now); if (state === 'playing') updateEffects(elapsed);
      if (!media && elapsed >= travel+VR_BASIC_DRUM_BEAT.durationMs) { finish(now); return; }
      for (const note of notes) {
        const remaining=note.arrival-elapsed;
        if (media?.timingDebug && !note.arrivalObserved && remaining<=0) {
          note.arrivalObserved=true;
          console.debug('[DRUM UP SYNC] note arrival',{instrument:note.id,targetMP3Seconds:note.arrival/1000,
            spawnMP3Seconds:(note.arrival-travel)/1000,scheduledContextSeconds:media.timingDebug.contextAt(media.offset+note.arrival/1000),
            observedOutputContextSeconds:media.timingDebug.outputTime(),arrivalErrorMs:-remaining,resolvedBeforeArrival:note.resolved});
        }
        if (state === 'playing' && !note.resolved && remaining < -greatWindow && !media?.audio.seeking) {
          note.resolved=true; miss++; hideNote(note); effectAt(note.lane,note.arrival,elapsed,'Miss'); onStatus(state,'Miss');
        }
        if (note.resolved || remaining>travel || remaining < -greatWindow) { hideNote(note); continue; }
        const mesh=showNote(note); note.lane.positionAt(remaining/travel,mesh.position); mesh.scale.set(note.lane.noteSize,note.lane.noteSize/NEON_STYLE.noteAspect,1);
        mesh.userData.fill = THREE.MathUtils.clamp(1-remaining/travel,0,1); mesh.material.uniforms.fill.value = mesh.userData.fill;
      }
      report(now);
    },
    dispose() {
      media?.audio.removeEventListener('seeked',onSeeked); media?.audio.removeEventListener('ended',onEnded); media?.audio.pause();
      anchor.removeFromParent(); geometry.dispose(); texture.dispose(); flashTexture.dispose(); labelTextures.forEach(texture=>texture.dispose());
      lanes.forEach(lane=>lane.noteMaterial.dispose()); noteMaterials.forEach(material=>material.dispose());
      for (const effect of effects) for (const mesh of [effect.ghost,effect.ripple,effect.flash,effect.label]) mesh.material.dispose();
    },
  };
}
