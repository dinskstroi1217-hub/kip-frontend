import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

// Mock-режим включается до первого рендера, чтобы window.fetch уже был
// перехвачен к моменту, когда LoginPage запустит useAsync(driversApi.list).
if (import.meta.env.VITE_USE_MOCKS === 'true') {
  const { installMocks } = await import('./mocks/install');
  installMocks();
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
