import type { RefObject } from 'react';
import type { FootPedalController, FootPedalState } from './footPedal';
import './footPedal.css';

export function FootPedalSettings({ state, controller }: {
  state: FootPedalState | null; controller: RefObject<FootPedalController | null>;
}) {
  return <details className="foot-pedal-settings" onToggle={event => {
    if (event.target === event.currentTarget && !event.currentTarget.open) controller.current?.cancel();
  }}>
    <summary>SETTINGS · CONTROLLER · FOOT PEDAL</summary>
    {state && <section aria-label="Foot pedal settings">
      <h3>FOOT PEDAL</h3>
      <button aria-pressed={state.enabled} onClick={() => controller.current?.setEnabled(!state.enabled)}>
        ENABLE FOOT PEDAL: {state.enabled ? 'ON' : 'OFF'}
      </button>
      <p>KEY BINDING · <strong>CURRENT KEY: {state.label}</strong></p>
      <div className="foot-pedal-buttons">
        <button onClick={() => controller.current?.detect()}>AUTO DETECT</button>
        <button onClick={() => controller.current?.test()}>TEST INPUT</button>
        <button onClick={() => controller.current?.cancel()}>CANCEL</button>
      </div>
      <p role="status"><i className={state.pressed ? 'pressed' : ''} />{state.pressed ? 'PEDAL PRESSED' : 'PEDAL IDLE'} · {state.label}</p>
      <p>INPUT STATUS: {!state.enabled ? 'DISABLED' : state.status === 'INPUT DETECTED' ? 'INPUT DETECTED' : 'WAITING'}</p>
      <p>CONNECTION STATUS: <strong>{state.status}</strong></p>
      <p>{state.message}</p>
      <p>KICK: {state.played === null ? 'WAITING' : state.played ? 'PLAYED' : 'NOT PLAYED (audio / duplicate / visibility)'}</p>
      <small>일반 키보드와 USB 풋스위치는 구분할 수 없습니다. ESC / CANCEL로 자동 감지를 취소합니다.</small>
      <details><summary>INPUT DEBUG</summary>
        <pre>{JSON.stringify({ code: state.eventCode, key: state.eventKey, keydown: state.down,
          keyup: state.up, repeat: state.repeat, ignoredRepeats: state.ignoredRepeats, immersiveXR: state.immersive,
          lastInput: state.lastInput ? new Date(state.lastInput).toLocaleTimeString() : null }, null, 2)}</pre>
      </details>
    </section>}
  </details>;
}
