import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './features/theme/ThemeProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

// Register service worker for PWA capability and listen to beforeinstallprompt
if (typeof window !== "undefined") {
  // A previously installed PWA worker can keep controlling a local Vite page
  // even after its source has changed. Remove that controller once on local
  // development hosts so lazy-loaded Chat chunks always come from the dev
  // server instead of an old cache.
  if ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && "serviceWorker" in navigator) {
    const cleanupKey = "fanfan-local-sw-cleaned";
    if (!sessionStorage.getItem(cleanupKey)) {
      sessionStorage.setItem(cleanupKey, "1");
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
        caches.keys().then((cacheNames) => Promise.all(cacheNames.filter((name) => name.startsWith("fanfan-phone-")).map((name) => caches.delete(name)))),
      ]).then(() => {
        if (navigator.serviceWorker.controller) window.location.reload();
      }).catch(() => undefined);
    }
  }

  // Stash beforeinstallprompt event
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as any).deferredPrompt = e;
    console.log("[PWA] beforeinstallprompt event fired and deferred.");
    // Dispatch custom event so React can update its state
    window.dispatchEvent(new CustomEvent("pwa-install-prompt-available"));
  });

  if ("serviceWorker" in navigator) {
    const registerSW = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          console.log("[PWA] Service Worker registered successfully with scope:", registration.scope);
          registration.update().catch((error) => {
            console.warn("[PWA] Service Worker update check failed:", error);
          });
        })
        .catch((error) => {
          console.error("[PWA] Service Worker registration failed:", error);
        });
    };

    if (document.readyState === "complete" || document.readyState === "interactive") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }
  }
}
