import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrandExperience } from './components/brand/BrandIntro'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandExperience><App /></BrandExperience>
  </StrictMode>,
)
