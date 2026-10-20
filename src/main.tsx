import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
// Self-hosted: no request to a third-party font service.
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/landing.css';
import './styles/studio.css';
import { App } from './App.tsx';

// The site lives under /<repo>/ on GitHub Pages; BASE_URL carries that prefix.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
