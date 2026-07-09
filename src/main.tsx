import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe global localStorage wrapper to prevent QuotaExceededError from crashing React
try {
  const originalSetItem = window.localStorage.setItem;
  window.localStorage.setItem = function (key: string, value: string) {
    try {
      originalSetItem.call(window.localStorage, key, value);
    } catch (e: any) {
      console.warn("localStorage.setItem failed (possibly quota exceeded) for key:", key, e);
    }
  };
} catch (e) {
  console.error("Failed to install safe localStorage wrapper:", e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
