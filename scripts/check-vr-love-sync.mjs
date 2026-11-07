import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null}});await vite.listen();let browser;
try {
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]);
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {VRMusicTransport,LOVE_COUNT_IN,parseLoveChart,loveChartOffset}=await import('/src/components/vrMusicSong.ts');
    const {outputAudioTime,setNoteSyncMs,getNoteSyncMs}=await import('/src/components/vrNoteSync.ts');
    const {captureRhythmSurfaces,createVRNoteLanes,createVRNoteHighway}=await import('/src/components/vrNoteHighway.ts');
    const {createRestoredVRDrumSet}=await import('/src/components/restoredVRDrumSet.ts');
    const chart=await(await fetch('/songs/love/love_first_4_bars.json')).json();
    const starts=[],logs=[];let stops=0;const debug=console.debug;console.debug=(label,event)=>{if(label.includes('note arrival'))logs.push(event);};
    let output=20;
    const gain=()=>({gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}});
    const context={currentTime:20,outputLatency:1,getOutputTimestamp:()=>({contextTime:output,performanceTime:performance.now()}),
      destination:{},resume:async()=>{},createGain:gain,
      createBufferSource:()=>({connect(){},disconnect(){},stop(){stops++;},start:(...args)=>starts.push(args)}),
      createOscillator:()=>({frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}})};
    const transport=new VRMusicTransport(context,{duration:300});
    const scene=new T.Scene(),kit=createRestoredVRDrumSet(scene);scene.updateMatrixWorld(true);
    const surfaces=captureRhythmSurfaces(kit.hitSurfaces),lanes=createVRNoteLanes(surfaces,new T.Vector3(0,1.35,1));
    const notes=parseLoveChart(chart).map(note=>({...note,time:note.time+chart.audioStartOffsetSeconds}));
    const highway=createVRNoteHighway(scene,surfaces,lanes.paths,()=>{}, {notes,audio:transport,offset:LOVE_COUNT_IN,windows:{perfect:50,great:120},
      timingDebug:{contextAt:t=>transport.contextTimeAt(t),outputTime:()=>transport.outputTime()}});
    highway.restart(1000);await Promise.resolve();await Promise.resolve();
    const mp3=20.035+LOVE_COUNT_IN,target=mp3+2.9,eye=new T.Vector3(0,1.35,1);
    const advance=t=>{output=t;context.currentTime=t+1;highway.update(Math.random()*100000,eye);};
    advance(mp3);const firstAtMP3Start=highway.strike('kick',0);
    advance(target-1);const note=scene.getObjectByName('note-kick-2900'),middle=note?.position.clone();
    advance(target-.04);const near=note?.position.clone();
    const linearProgress=!!middle&&!!near&&!middle.equals(near);
    advance(target+.000001);const onBeat=highway.strike('kick',0),ride=highway.strike('ride',0);
    const observed=logs.filter(l=>l.instrument==='kick')[0];
    highway.restart(2000);await Promise.resolve();await Promise.resolve();
    const oneRestart=starts.length===2&&stops===1;
    const restartMP3=transport.mp3StartContextTime;
    highway.setNoteSyncMs(100);advance(restartMP3+2.9);const positiveEarly=highway.strike('kick',0);
    // Within 120ms is GREAT, so test target crossing via arrival logs separately.
    highway.restart(3000);await Promise.resolve();await Promise.resolve();
    highway.setNoteSyncMs(-100);advance(transport.mp3StartContextTime+2.8);const negative=highway.strike('kick',0);
    setNoteSyncMs(-123);const savedNegative=getNoteSyncMs()===-120;setNoteSyncMs(123);const savedPositive=getNoteSyncMs()===120;setNoteSyncMs(0);
    const reset=getNoteSyncMs()===0;
    const fallback=outputAudioTime({currentTime:10,outputLatency:.2})===9.8;
    highway.dispose();transport.dispose();lanes.dispose();console.debug=debug;
    return {chartOffset:loveChartOffset(),rawFirst:chart.notes[0].time,firstAtMP3Start,onBeat,ride,linearProgress,
      scheduled:Math.abs(starts[0][0]-mp3)<1e-9,oneCountdown:Math.abs(mp3-20.035-LOVE_COUNT_IN)<1e-9,
      observedError:observed.arrivalErrorMs,contextTarget:observed.scheduledContextSeconds,target,
      positiveEarly,negative,savedNegative,savedPositive,reset,fallback,oneRestart};
  });
  assert.equal(result.chartOffset,2.9);assert.equal(result.rawFirst,0);assert.equal(result.firstAtMP3Start,'Miss');
  assert.equal(result.onBeat,'Perfect');assert.equal(result.ride,'Perfect');assert.equal(result.positiveEarly,'Great');assert.equal(result.negative,'Perfect');
  for(const key of ['scheduled','oneCountdown','linearProgress','savedNegative','savedPositive','reset','fallback','oneRestart'])assert(result[key],key);
  assert(Math.abs(result.contextTarget-result.target)<1e-9);assert(Math.abs(result.observedError)<1,'Arrival log is audio-output based');
  console.log('PASS: measured 2.90s chart anchor, one count-in, 1s simulated output buffering, exact shared-clock arrivals, signed live offsets, 10ms persistence/reset and arrival diagnostics.',result);
}finally{await browser?.close();await vite.close();}
