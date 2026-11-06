import { useEffect, useState } from 'react';
import { attachSpaceInput } from './inputs';
import { LOCAL_KICK_ENABLED, localKickEndpoint } from './PedalConnection';
import type { PedalState } from './PedalConnection';
import { connectionLabels, usePedalConnection } from './usePedalConnection';
import './pedal.css';

export default function LocalKickTest() {
  const { state, client } = usePedalConnection('pedal');
  const [code, setCode] = useState('');
  useEffect(() => {
    if (LOCAL_KICK_ENABLED) return attachSpaceInput(window, () => client.current?.kick());
  }, [client]);
  return <main className="pedal-page">
    <header><a href="#/vr">DRUM UP VR</a><span>노트북 전용</span></header>
    <h1>로컬 킥 입력 테스트</h1>
    {LOCAL_KICK_ENABLED ? <section className="pedal-card">
      <p>Quest 3의 VR 페이지에서 만든 연결 코드를 입력하세요.</p>
      <label>VR 연결 코드<input value={code} onChange={event => setCode(event.target.value.toUpperCase())}
        autoComplete="off" spellCheck={false} maxLength={16} /></label>
      <div className="pedal-buttons">
        <button onClick={() => client.current?.connect(localKickEndpoint(), code, false)}>VR에 연결</button>
        <button onClick={() => client.current?.disconnect()}>연결 해제</button>
      </div>
      <p role="status">{connectionLabels[state.status]}</p>
      {state.message && <p role="alert">{state.message}</p>}
      <button className="pedal-test" disabled={state.status !== 'connected'} onClick={() => client.current?.kick()}>TEST KICK</button>
      <p>Space를 누르거나 버튼을 클릭하세요. 키를 누르고 있으면 한 번만 전송합니다.</p>
      <div className="pedal-counts">
        <span>전송 <b data-testid="lan-kick-sent">{state.sent}</b></span>
        <span>실행 <b data-testid="lan-kick-played">{state.played}</b></span>
        <span>미실행 <b data-testid="lan-kick-dropped">{state.dropped}</b></span>
      </div>
    </section> : <p>VITE_DRUMUP_LAN_KICK=1로 로컬 개발 서버를 실행하세요.</p>}
  </main>;
}

export function LocalKickReceiver({ onKick, onStatus }: {
  onKick: (velocity: number) => boolean;
  onStatus: (state: PedalState) => void;
}) {
  const { state, client } = usePedalConnection('vr', onKick);
  const [open, setOpen] = useState(false);
  useEffect(() => onStatus(state), [onStatus, state]);
  return <div className="vr-pedal-control">
    <button onClick={() => setOpen(!open)}>로컬 킥 테스트</button>
    {open && <section className="vr-pedal-panel pedal-card" aria-label="로컬 킥 연결">
      <p>같은 주소의 <a href="#/kick-test" target="_blank" rel="noreferrer">노트북 킥 테스트</a>에서 코드를 입력하세요.</p>
      <div className="pedal-buttons">
        <button onClick={() => { client.current?.disconnect(true); client.current?.connect(localKickEndpoint(), '', false); }}>로컬 연결 코드 만들기</button>
        <button onClick={() => client.current?.disconnect(true)}>로컬 연결 종료</button>
      </div>
      {state.code && <output data-testid="lan-kick-code">{state.code}</output>}
      <p data-testid="lan-kick-receiver-status">{connectionLabels[state.status]}</p>
      {state.message && <p role="alert">{state.message}</p>}
      <p>수신 <b data-testid="lan-kick-received">{state.receivedKicks}</b> · 마지막 입력 {state.lastKickAt === null
        ? '—' : new Date(state.lastKickAt).toLocaleTimeString()} · {state.lastKickPlayed === null ? '입력 대기' : state.lastKickPlayed ? '실행됨' : '미실행'}</p>
    </section>}
  </div>;
}
