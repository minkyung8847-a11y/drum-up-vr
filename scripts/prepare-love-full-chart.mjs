// Offline score corrections only. No templates are generated during gameplay.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/prepare-love-full-chart.mjs <user DRAFT.json>');
const raw=await readFile(input),chart=JSON.parse(raw),opening=JSON.parse(await readFile('public/songs/love/love_first_4_bars.json','utf8'));
assert.equal(chart.bpm,62);assert.equal(chart.bars,75);
assert.deepEqual(chart.notes.filter(n=>n.bar<=4),opening.notes,'Do not change the synchronized opening');
const changes=[];
function replace(bar,beat,from,to,reason){
  const note=chart.notes.find(n=>n.bar===bar&&n.beat===beat&&n.instrument===from);
  assert(note,`Missing ${bar}:${beat} ${from}`);note.instrument=to;changes.push({bar,beat,from,to,reason});
}
function remove(bar,beat,instrument,reason){
  const at=chart.notes.findIndex(n=>n.bar===bar&&n.beat===beat&&n.instrument===instrument);
  assert(at>=0);chart.notes.splice(at,1);changes.push({bar,beat,from:instrument,to:null,reason});
}
// Higher x-note with ledger/accent: conventional crash assignment. No drum
// legend was supplied, so timbre interpretation remains explicitly provisional.
for(const bar of [5,9,15,19,25,35,39,43,51,57,59,67,69,73])
  replace(bar,1,bar>=9&&bar<=24?'hihat':'ride','crash','Higher cymbal x-note with accent; crash interpretation');
replace(18,4,'hihat','hihat-open','Open circle above beat-4 quarter-note');
remove(18,4.5,'hihat','Beat-4 open hi-hat is a quarter-note');
remove(24,4.5,'hihat','Beat-4 cymbal/snare is a quarter-note');
remove(58,4,'ride','Beat 4 is a snare fill, not a cymbal hit');
replace(58,4.5,'ride','floorTom','Lower solid head at the last eighth; floor-tom assignment provisional');
// The line marked 73 contains four played measures, followed by one full rest.
// Transcribe the visible measure 76; do not repeat the 75-bar draft at runtime.
const bar76=[['kick',1],['ride',1],['ride',1.5],['ride',2],['snare',2],['ride',2.5],
  ['kick',3],['ride',3],['kick',3.5],['ride',3.5],['ride',4],['snare',4],['hihat-open',4.5]];
for(const [instrument,beat]of bar76)chart.notes.push({time:Number(((75*4+beat-1)*60/62).toFixed(6)),instrument,bar:76,beat});
chart.bars=77;chart.endTimeSeconds=Number((77*4*60/62).toFixed(6));
chart.notes.sort((a,b)=>a.time-b.time);assert.deepEqual(chart.notes.filter(n=>n.bar<=4),opening.notes);
chart.transcriptionStatus='PARTIALLY SHEET-REVIEWED DRAFT; not a verified complete transcription';
chart.originalDraft={file:'love_full_75_bars_DRAFT.json',sha256:createHash('sha256').update(raw).digest('hex'),bars:75,notes:975};
chart.scoreNotes='Full screenshot reviewed for bar layout and visible main-note rhythms. Original 1-4 preserved; 5-75 corrected where legible; 76 transcribed from the last line; 77 is an explicit whole-bar rest. No notes generated beyond the score.';
chart.sheetReview={source:'사랑으로 악보.png',status:'partial',
  barCountEvidence:'Right-page lines: 39-42,43-46,47-50,51-54,55-58,59-63,64-68,69-72,73-76, then bar 77 rest.',
  reviewed:['Visible kick/snare main groove beats in bars 5-76','Closed H.H. instruction at bar 9 and Ride instruction at bar 25/39',
    'Open quarter-note at bar 18 beat 4','Quarter-note ending of bar 24','Main rhythmic outline of bar 58 fill','Final played measure and whole-bar rest'],
  corrections:changes,
  unresolved:[
    {bars:[5,9,15,19,25,35,39,43,51,57,59,67,69,73],issue:'Higher accented cymbal mapped conventionally to crash; no notation legend supplied to prove timbre.'},
    {bars:[58],issue:'Small snare grace note before beat 4 has no exact measured time. Not synthesized at an arbitrary offset. Last lower solid head mapped provisionally to floorTom.'},
    {bars:[76],issue:'Final open-circle cymbal mapped provisionally to hihat-open despite preceding Ride instruction.'},
    {bars:[5,76],issue:'Mixed MP3 performance timing/drift and each individual sounding stroke have not been manually validated. JSON time values and working clock are preserved.'}
  ]};
await writeFile('public/songs/love/love_full_75_bars_DRAFT.json',JSON.stringify(chart,null,2)+'\n');
console.log({notes:chart.notes.length,bars:chart.bars,counts:Object.fromEntries([...new Set(chart.notes.map(n=>n.instrument))].map(id=>[id,chart.notes.filter(n=>n.instrument===id).length])),changes:changes.length,openingUnchanged:true,status:chart.transcriptionStatus});
