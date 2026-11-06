import { useEffect, useRef, useState } from 'react';
import { emptyPedalState, PedalConnection } from './PedalConnection';
import type { PedalRole } from './PedalConnection';

export function usePedalConnection(role: PedalRole, onKick?: (velocity: number, id: string) => boolean,
  onHiHat?: (pressed: boolean, id: string) => boolean) {
  const [state, setState] = useState(emptyPedalState);
  const client = useRef<PedalConnection | null>(null);
  const kick = useRef(onKick); kick.current = onKick;
  const hiHat = useRef(onHiHat); hiHat.current = onHiHat;
  useEffect(() => {
    const connection = new PedalConnection(role, setState, (velocity, id) => kick.current?.(velocity, id) ?? false,
      (pressed, id) => hiHat.current?.(pressed, id) ?? false);
    client.current = connection;
    return () => { connection.disconnect(role === 'vr'); client.current = null; };
  }, [role]);
  return { state, client };
}
export const connectionLabels = { offline: '연결 안 됨', connecting: '서버 연결 중', waiting: '상대 장치 대기',
  connected: '연결됨', reconnecting: '재연결 중', error: '연결 오류' };
