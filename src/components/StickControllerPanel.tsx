import { useState } from 'react';
import type { StickHand } from './virtualDrumsticks';
import { DEFAULT_GRIP_OFFSETS } from './xrDrumstickControllers';
import type { StickPose } from './xrDrumstickControllers';
import { DEFAULT_HAND_STICK } from './xrHandDrumsticks';
import type { HandStickCalibration } from './xrHandDrumsticks';

const DEFAULT_PREVIEW_POSES: Record<StickHand, StickPose> = {
  left: { position: [-0.23, -0.38, -0.62], rotation: [0, -9.167324722, 0] },
  right: { position: [0.23, -0.38, -0.62], rotation: [0, 9.167324722, 0] },
};
interface Props {
  immersive: boolean;
  onChange: (mode: 'preview' | 'offset', hand: StickHand, pose: StickPose) => void;
  onHandChange: (hand: StickHand, calibration: HandStickCalibration) => void;
}
type SetupMode = 'preview' | 'offset' | 'hand';

export function StickControllerPanel({ immersive, onChange, onHandChange }: Props) {
  const [hand, setHand] = useState<StickHand>('left');
  const [mode, setMode] = useState<SetupMode>('preview');
  const [poses, setPoses] = useState(() => ({ preview: structuredClone(DEFAULT_PREVIEW_POSES), offset: structuredClone(DEFAULT_GRIP_OFFSETS) }));
  const [handPoses, setHandPoses] = useState(() => ({ left: structuredClone(DEFAULT_HAND_STICK), right: structuredClone(DEFAULT_HAND_STICK) }));
  const handPose = handPoses[hand];
  const pose = mode === 'hand' ? handPose : poses[mode][hand];
  const setHandPose = (next: HandStickCalibration) => {
    setHandPoses(previous => ({ ...previous, [hand]: next }));
    onHandChange(hand, next);
  };
  const setPose = (next: StickPose) => {
    if (mode === 'hand') { setHandPose({ ...handPose, ...next }); return; }
    setPoses(previous => ({ ...previous, [mode]: { ...previous[mode], [hand]: next } }));
    onChange(mode, hand, next);
  };
  return <details className="vr-stick-panel">
    <summary>Stick setup</summary>
    <p>Adjust each hand separately. Hand-tracked tips are estimated from hand pose and stick length.</p>
    <div className="vr-stick-options">
      <label>Hand <select aria-label="Hand" value={hand} onChange={event => setHand(event.target.value as StickHand)}><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Adjust <select aria-label="Adjust" value={mode} onChange={event => setMode(event.target.value as SetupMode)}><option value="preview">Desktop pose</option><option value="offset">VR grip offset</option><option value="hand">Real stick calibration</option></select></label>
    </div>
    <p>{mode === 'preview' ? 'Moves the desktop stick only.' : mode === 'hand'
      ? 'Applies only in Real Stick Mode. Set the full length, then align the tip using position and rotation.'
      : 'Saved for this page session. Applied relative to each tracked grip; previewed on the desktop stick.'}</p>
    {mode === 'hand' && <fieldset disabled={immersive}>
      <legend>Stick length (m)</legend>
      <label className="vr-stick-slider"><span>Length</span><input type="range" aria-label={`${hand} hand stick length`}
        min={0.25} max={0.55} step={0.005} value={handPose.length}
        onChange={event => setHandPose({ ...handPose, length: Number(event.target.value) })} />
        <output>{handPose.length.toFixed(3)}</output>
      </label>
    </fieldset>}
    {(['position', 'rotation'] as const).map(kind => <fieldset key={kind} disabled={immersive}>
      <legend>{kind === 'position' ? 'Position (m)' : 'Rotation (°)'}</legend>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <label className="vr-stick-slider" key={axis}>
        <span>{axis}</span><input type="range" aria-label={`${hand} ${mode} ${kind} ${axis}`}
          min={kind === 'rotation' ? -90 : mode === 'preview' ? -1.2 : -0.15}
          max={kind === 'rotation' ? 90 : mode === 'preview' ? 1.2 : 0.15}
          step={kind === 'rotation' ? 1 : 0.005} value={pose[kind][index]}
          onChange={event => { const next = structuredClone(pose); next[kind][index] = Number(event.target.value); setPose(next); }} />
        <output>{pose[kind][index].toFixed(kind === 'rotation' ? 1 : 3)}</output>
      </label>)}
    </fieldset>)}
    <button type="button" disabled={immersive} onClick={() => {
      if (mode === 'hand') setHandPose(structuredClone(DEFAULT_HAND_STICK));
      else setPose(structuredClone(mode === 'preview' ? DEFAULT_PREVIEW_POSES[hand] : DEFAULT_GRIP_OFFSETS[hand]));
    }}>Reset {hand} {mode === 'preview' ? 'pose' : mode === 'hand' ? 'calibration' : 'offset'}</button>
  </details>;
}
