import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import AuthScreen from './features/auth/AuthScreen.jsx'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthScreen />
  </StrictMode>,
)
