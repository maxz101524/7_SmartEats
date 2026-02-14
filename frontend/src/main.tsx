import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './static/css/custom.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
