import { StrictMode, lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getHeadsetSong } from './components/songPlayback'

const VRPractice = lazy(() => import('./components/VRPractice.tsx'))
const PedalController = lazy(() => import('./pedal/PedalController.tsx'))
const LocalKickTest = lazy(() => import('./pedal/LocalKickTest.tsx'))

export function Entry() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const navigate = () => setHash(window.location.hash)
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const song = hash === '#/vr-song' ? getHeadsetSong() : undefined
  return hash === '#/vr' || hash === '#/ar' || song
    ? <StrictMode><Suspense fallback={null}><VRPractice key={hash} preferredMode={hash === '#/ar' ? 'ar' : 'vr'} song={song} /></Suspense></StrictMode>
    : hash === '#/pedal' ? <StrictMode><Suspense fallback={null}><PedalController /></Suspense></StrictMode>
      : hash === '#/kick-test' ? <StrictMode><Suspense fallback={null}><LocalKickTest /></Suspense></StrictMode>
        : <App />
}

createRoot(document.getElementById('root')!).render(
  <Entry />,
)
