// Shared lane order and palette: notes, lane markers and physical drum neon.
// Confirmed image order: the extra pink snare makes eight independent lanes.
export const VR_NEON_LANES = [
  { id:'crash', color:0xb94dff, label:'CRASH' },
  { id:'hihat', color:0x246bff, label:'HI-HAT' },
  { id:'snare', color:0xff59bd, label:'SNARE' },
  { id:'smallTom', color:0x40d9ff, label:'SMALL TOM' },
  { id:'kick', color:0xff3048, label:'KICK' },
  { id:'middleTom', color:0xa5f64a, label:'MIDDLE TOM' },
  { id:'floorTom', color:0xffdc35, label:'FLOOR TOM' },
  { id:'ride', color:0xff891f, label:'RIDE' },
] as const;
export const DRUM_ACCENTS: Record<string,number> = Object.fromEntries(VR_NEON_LANES.map(lane=>[lane.id,lane.color]));
export const VR_LANE_LAYOUT = { minimumSpacing:.20, maximumSpacing:.25, markerRadius:.024 } as const;
