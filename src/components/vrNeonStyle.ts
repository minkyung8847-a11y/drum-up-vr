import * as THREE from 'three';
// Visual tuning only. Timing, instrument identity and chart values stay separate.
export const NEON_STYLE={saturation:.75,noteAspect:1.6,noteRingOpacity:.76,noteFillMin:.35,noteFillMax:.50,noteGlowOpacity:.10} as const;
export function softNeonColor(hex:number){
 const color=new THREE.Color(hex),hsl={h:0,s:0,l:0};color.getHSL(hsl,THREE.SRGBColorSpace);
 return color.setHSL(hsl.h,hsl.s*NEON_STYLE.saturation,hsl.l,THREE.SRGBColorSpace);
}

export const VR_JUDGMENT_COLORS={Miss:'#ff565f',Great:'#50d987',Perfect:'#f2c45c'} as const;
