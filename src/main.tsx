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

// Register service worker for PWA capability and listen to beforeinstallprompt
if (typeof window !== "undefined") {
  // Stash beforeinstallprompt event
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as any).deferredPrompt = e;
    console.log("[PWA] beforeinstallprompt event fired and deferred.");
    // Dispatch custom event so React can update its state
    window.dispatchEvent(new CustomEvent("pwa-install-prompt-available"));
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then((registration) => {
          console.log("[PWA] Service Worker registered successfully with scope:", registration.scope);
        })
        .catch((error) => {
          console.error("[PWA] Service Worker registration failed:", error);
        });
    });
  }
}
