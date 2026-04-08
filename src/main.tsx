import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const isTauriDesktop =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

if (isTauriDesktop) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    }).catch(() => {
      // Ignore cleanup failures in desktop mode.
    });
  }

  if ('caches' in window) {
    void caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))),
    ).catch(() => {
      // Ignore cache cleanup failures in desktop mode.
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
