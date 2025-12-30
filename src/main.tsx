import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './useI18n.tsx'
import App from './App.tsx'
import './vibe-design-system/tokens.css'
import './vibe-design-system/components/githubLinkBanner.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
