import { useState } from 'react';
import type { StickHand } from './virtualDrumsticks';
import { DEFAULT_GRIP_OFFSETS } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';

const DEFAULT_PREVIEW_POSES: Record<StickHand, StickPose> = {
  left: { position: [-0.23, -0.38, -0.62], rotation: [0, -9.167324722, 0] },
  right: { position: [0.23, -0.38, -0.62], rotation: [0, 9.167324722, 0] },
};
interface Props {
  immersive: boolean;
  onChange: (mode: 'preview' | 'offset', hand: StickHand, pose: StickPose) => void;
}
export function StickControllerPanel({ immersive, onChange }: Props) {
  const [hand, setHand] = useState<StickHand>('left');
  const [mode, setMode] = useState<'preview' | 'offset'>('preview');
  const [poses, setPoses] = useState(() => ({ preview: structuredClone(DEFAULT_PREVIEW_POSES), offset: structuredClone(DEFAULT_GRIP_OFFSETS) }));
  const pose = poses[mode][hand];
  const setPose = (next: StickPose) => {
    setPoses(previous => ({ ...previous, [mode]: { ...previous[mode], [hand]: next } }));
    onChange(mode, hand, next);
  };
  return <details className="vr-stick-panel">
    <summary>Stick setup</summary>
    <p>Desktop preview only — real VR tracking requires a headset.</p>
    <div className="vr-stick-options">
      <label>Hand <select aria-label="Hand" value={hand} onChange={event => setHand(event.target.value as StickHand)}><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Adjust <select aria-label="Adjust" value={mode} onChange={event => setMode(event.target.value as 'preview' | 'offset')}><option value="preview">Desktop pose</option><option value="offset">VR grip offset</option></select></label>
    </div>
    <p>{mode === 'preview' ? 'Moves the desktop stick only.' : 'Saved for this page session. Applied relative to each tracked grip; previewed on the desktop stick.'}</p>
    {(['position', 'rotation'] as const).map(kind => <fieldset key={kind} disabled={immersive}>
      <legend>{kind === 'position' ? 'Position (m)' : 'Rotation (°)'}</legend>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <label className="vr-stick-slider" key={axis}>
        <span>{axis}</span><input type="range" aria-label={`${hand} ${mode} ${kind} ${axis}`}
          min={kind === 'rotation' ? -90 : mode === 'offset' ? -0.15 : -1.2}
          max={kind === 'rotation' ? 90 : mode === 'offset' ? 0.15 : 1.2}
          step={kind === 'rotation' ? 1 : 0.005} value={pose[kind][index]}
          onChange={event => { const next = structuredClone(pose); next[kind][index] = Number(event.target.value); setPose(next); }} />
        <output>{pose[kind][index].toFixed(kind === 'rotation' ? 1 : 3)}</output>
      </label>)}
    </fieldset>)}
    <button type="button" disabled={immersive} onClick={() => setPose(structuredClone(mode === 'preview' ? DEFAULT_PREVIEW_POSES[hand] : DEFAULT_GRIP_OFFSETS[hand]))}>Reset {hand} {mode === 'preview' ? 'pose' : 'offset'}</button>
  </details>;
}
