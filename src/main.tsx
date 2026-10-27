import { StrictMode, lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const VRPractice = lazy(() => import('./components/VRPractice.tsx'))
const ARPractice = lazy(() => import('./components/ARPractice.tsx'))

export function Entry() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const navigate = () => setHash(window.location.hash)
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  return hash === '#/vr'
    ? <Suspense fallback={null}><VRPractice /></Suspense>
    : hash === '#/ar' ? <Suspense fallback={null}><ARPractice /></Suspense>
    : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Entry />
  </StrictMode>,
)
