import { StrictMode, lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const VRPractice = lazy(() => import('./components/VRPractice.tsx'))

export function Entry() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const navigate = () => setHash(window.location.hash)
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  return hash === '#/vr' || hash === '#/ar'
    ? <Suspense fallback={null}><VRPractice key={hash} preferredMode={hash === '#/ar' ? 'ar' : 'vr'} /></Suspense>
    : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Entry />
  </StrictMode>,
)
