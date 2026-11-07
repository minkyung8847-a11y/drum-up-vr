// Exercises the actual reviewed user chart; no synthetic continuation is played.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await vite.listen();let browser;
try {
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]);
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {parseLoveChart,validateLoveFullChart,VRMusicTransport,LOVE_COUNT_IN}=await import('/src/components/vrMusicSong.ts');
    const {LOVE_CHART_OFFSET_SECONDS}=await import('/src/components/vrNoteSync.ts');
    const {captureRhythmSurfaces,createVRNoteLanes,createVRNoteHighway}=await import('/src/components/vrNoteHighway.ts');
    const {createVRUnifiedPanel}=await import('/src/components/vrUnifiedPanel.ts');
    const {panelActionAt}=await import('/src/components/vrUnifiedPanelDesign.ts');
    const {createRestoredVRDrumSet}=await import('/src/components/restoredVRDrumSet.ts');
    const baseline=await(await fetch('/songs/love/love_first_4_bars.json')).json();
    const full=await(await fetch('/songs/love/love_full_75_bars_DRAFT.json')).json();
    const parsed=validateLoveFullChart(full,baseline),opening=parseLoveChart(baseline);
    const preserved=JSON.stringify(parsed.slice(0,52))===JSON.stringify(opening);
    let rejected=false;try{validateLoveFullChart({...full,notes:full.notes.map((n,i)=>i? n:{...n,time:n.time+.01})},baseline);}catch{rejected=true;}
    const sources=[];const gain=()=>({gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}});
    const context={currentTime:100,resume:async()=>{},destination:{},createGain:gain,
      createBufferSource:()=>{const source={connect(){},disconnect(){},stop(){},start(){},onended:null};sources.push(source);return source;},
      createOscillator:()=>({frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}})};
    const transport=new VRMusicTransport(context,{duration:307.776});
    const scene=new T.Scene(),kit=createRestoredVRDrumSet(scene),rig=new T.Group();scene.add(rig);scene.updateMatrixWorld(true);
    const surfaces=captureRhythmSurfaces(kit.hitSurfaces),lanes=createVRNoteLanes(surfaces,new T.Vector3(0,1.35,1));
    const ui=createVRUnifiedPanel(scene,rig,kit.group,{background:'studio',getVolume:()=>.8,setVolume(){},onBackground(){},onRhythm(){},onViewMode(){}});
    let totals;
    const highway=createVRNoteHighway(scene,surfaces,lanes.paths,(s,j)=>ui.setRhythmStatus(s,j),{
      notes:parsed.map(note=>({...note,time:note.time+LOVE_CHART_OFFSET_SECONDS})),audio:transport,offset:LOVE_COUNT_IN,
      noteSyncMs:230,windows:{perfect:50,great:120},onResults:(p,g,m)=>{totals={p,g,m};if(ui.state.rhythm==='finished')ui.showSongResults(p,g,m);}});
    highway.restart(0);await Promise.resolve();await Promise.resolve();
    const mp3Start=transport.mp3StartContextTime,eye=new T.Vector3(0,1.35,1);
    const targets=[[1,1,'kick'],[1,1,'ride'],[5,1,'crash'],[9,1.5,'hihat'],[18,4,'hihat'],[25,1.5,'ride'],[58,4.5,'floorTom'],[76,4.5,'hihat']];
    const judgments=[];let arrivalPositions=0,maxVisible=0;
    for(const time of [...new Set(parsed.map(n=>n.time))]){
      context.currentTime=mp3Start+time+LOVE_CHART_OFFSET_SECONDS+.230+.0000001;
      highway.update(time%2?999999:-100,eye);
      const anchor=scene.getObjectByName('note-highway-anchor');
      maxVisible=Math.max(maxVisible,anchor.children.filter(n=>n.name.startsWith('note-')&&n.visible).length);
      for(const note of parsed.filter(n=>n.time===time)){
        const mesh=scene.getObjectByName(`note-${note.instrument}-${(note.time+LOVE_CHART_OFFSET_SECONDS)*1000+230}`);
        const target=lanes.paths.get(note.instrument)(0,new T.Vector3());
        if(!mesh?.visible||mesh.position.distanceTo(target)>1e-5)throw Error('Wrong arrival '+note.measure+':'+note.measureBeat+' '+note.instrument);
        arrivalPositions++;
        if(targets.some(([bar,beat,id])=>note.measure===bar&&note.measureBeat===beat&&note.instrument===id))
          judgments.push(highway.strike(note.instrument,0));
      }
    }
    const continuous=sources.length===1&&transport.mp3StartContextTime===mp3Start;
    sources[0].onended();
    const cleanup=scene.getObjectByName('note-highway-anchor').children.filter(o=>o.name.startsWith('note-')).every(o=>!o.visible);
    const score=ui.state.songResults;
    const back=panelActionAt(ui.state,512,800)?.kind==='results';
    const ended=ui.state.rhythm==='finished'&&cleanup&&totals.p+totals.g+totals.m===parsed.length&&score.perfect===targets.length&&score.miss===parsed.length-targets.length&&back;
    const accuracy=Math.abs(score.accuracy-targets.length/parsed.length*100)<1e-9;
    highway.dispose();transport.dispose();lanes.dispose();ui.dispose();
    return {preserved,rejected,judgments,arrivalPositions,maxVisible,noteCount:parsed.length,bars:full.bars,rest77:parsed.every(n=>n.measure!==77),continuous,ended,accuracy,chartOffset:LOVE_CHART_OFFSET_SECONDS,preroll:LOVE_COUNT_IN};
  });
  for(const key of ['preserved','rejected','continuous','ended','accuracy'])assert(result[key],key);
  for(const judgment of result.judgments)assert.equal(judgment,'Perfect');
  assert.equal(result.noteCount,985);assert.equal(result.bars,77);assert(result.rest77);
  assert.equal(result.arrivalPositions,985);assert(result.maxVisible<=32);
  assert.equal(result.chartOffset,2.9);assert.equal(result.preroll,4*60/62);
  console.log('PASS: actual 985-note reviewed DRAFT, protected opening, continuous bars 4/5 through 76 and rest 77, retained audio epoch/offset/travel/calibration, instrument targets, end cleanup/results/back hit region. Transcription remains partially verified; physical Quest 3 NOT tested.');
}finally{await browser?.close();await vite.close();}
