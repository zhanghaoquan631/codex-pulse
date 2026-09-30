import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Another tab completing sign-in/sign-out must discard the previous account's view.
if ('BroadcastChannel' in window) {
  const authChannel = new BroadcastChannel('mezip-auth')
  authChannel.onmessage = event => { if (event.data === 'changed') window.location.reload() }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
