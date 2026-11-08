export const DRUM_HEIGHT_KEY='drumup.vr.drum-height.v1';
export const DRUM_HEIGHT={default:0,min:-.30,max:.30,step:.02} as const;
export function clampDrumHeight(value:number){return Number.isFinite(value)?Math.round(Math.min(DRUM_HEIGHT.max,Math.max(DRUM_HEIGHT.min,value))*1000)/1000:DRUM_HEIGHT.default;}
export function readDrumHeight(){try{const value=JSON.parse(localStorage.getItem(DRUM_HEIGHT_KEY)??'null');return typeof value==='number'?clampDrumHeight(value):DRUM_HEIGHT.default;}catch{return DRUM_HEIGHT.default;}}
export function saveDrumHeight(value:number){const height=clampDrumHeight(value);let saved=true;try{localStorage.setItem(DRUM_HEIGHT_KEY,JSON.stringify(height));}catch{saved=false;}return{height,saved};}
