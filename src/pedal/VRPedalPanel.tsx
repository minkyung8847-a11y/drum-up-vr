import { useState } from 'react';
import { savedRelayURL } from './PedalConnection';
import { connectionLabels, usePedalConnection } from './usePedalConnection';
import './pedal.css';

export function VRPedalPanel({ onKick, onHiHat, unlock, onButtonMode }: {
  onKick: (velocity: number, id: string) => boolean;
  onHiHat: (pressed: boolean, id: string) => boolean;
  unlock: () => Promise<boolean>; onButtonMode: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(savedRelayURL);
  const [audio, setAudio] = useState('헤드셋에서 소리 활성화를 눌러주세요.');
  const { state, client } = usePedalConnection('vr', onKick, onHiHat);
  return <div className="vr-pedal-control">
    <button onClick={() => setOpen(!open)}>VR pedals{state.status === 'connected' ? ' ●' : ''}</button>
    {open && <section className="vr-pedal-panel pedal-card" aria-label="킥 페달 연결">
      <h2>왼쪽 하이햇 · 오른쪽 킥 페달 연결</h2>
      <p>VR 입장 전에 설정하세요. 노트북에서 <a href="#/pedal" target="_blank" rel="noreferrer">Pedal Controller</a>를 엽니다.</p>
      <label>릴레이 서버 주소<input aria-label="릴레이 서버 주소" value={endpoint} type="url" placeholder="wss://relay.example.com/pedal" onChange={e => setEndpoint(e.target.value)} /></label>
      <div className="pedal-buttons"><button onClick={() => { client.current?.disconnect(true); client.current?.connect(endpoint); }}>새 연결 코드</button><button onClick={() => client.current?.disconnect(true)}>연결 종료</button></div>
      {state.code && <><output className="pedal-code" data-testid="pairing-code">{state.code.slice(0, 5)}-{state.code.slice(5)}</output><p>10분 내 노트북에 입력하세요. 한 대만 연결되며 코드 사용 후에는 새 코드로 다시 연결해야 합니다.</p></>}
      <p className={`pedal-connection ${state.status}`} data-testid="pedal-connection">● {connectionLabels[state.status]}</p>
      {state.message && <p role="alert">{state.message}</p>}
      <button onClick={() => { void unlock().then(ready => setAudio(ready ? '소리 준비 완료' : '소리 로딩 중이거나 차단됨 — 다시 눌러주세요.')); }}>소리 활성화</button>
      <p>{audio}</p><p>원격 페달 적용: <b data-testid="remote-kicks">{state.played}</b> · 미적용: {state.dropped}</p>
      <label className="pedal-checkbox"><input type="checkbox" defaultChecked onChange={e => onButtonMode(e.target.checked)} />오른쪽 Grip 버튼으로 킥 연주</label>
      <p>오른쪽 Grip은 한 번 누를 때 킥, 왼쪽 Grip은 누르는 동안 하이햇 닫힘입니다. 소리가 안 나면 VR 컨트롤러 트리거로 소리를 활성화하세요.</p>
      <button onClick={() => setOpen(false)}>닫기</button>
    </section>}
  </div>;
}
