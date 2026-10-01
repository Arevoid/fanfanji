import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './features/theme/ThemeProvider.tsx';
import { isDevLoopbackOrigin } from './core/runtime/devOrigin.ts';
import { installDevRuntimeProbe } from './core/runtime/devDiagnostics.ts';
import { initializeMemoryAdmissionV2Promotion } from './features/chat/services/directChatMemoryAdmissionPromotion.ts';

installDevRuntimeProbe();
initializeMemoryAdmissionV2Promotion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

// Register service worker for PWA capability and listen to beforeinstallprompt
if (typeof window !== "undefined") {
  // A deployment can leave an already-open PWA pointing at a removed hashed
  // chunk. Vite exposes this as `vite:preloadError`; older browsers often
  // surface the same condition as an unhandled dynamic-import rejection.
  // Recover once per short window so a stale client refreshes onto the new
  // asset graph without entering an infinite reload loop.
  const staleModuleRecoveryKey = "fanfan-stale-module-recovery-at";
  const recoverFromStaleModule = () => {
    try {
      const previousAttempt = Number(window.sessionStorage.getItem(staleModuleRecoveryKey) || 0);
      const now = Date.now();
      if (Number.isFinite(previousAttempt) && previousAttempt > 0 && now - previousAttempt < 30_000) return;
      window.sessionStorage.setItem(staleModuleRecoveryKey, String(now));
    } catch {
      // A restricted storage context should still receive the normal reload.
    }
    window.location.reload();
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recoverFromStaleModule();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "");
    if (/dynamically imported module|importing a module script failed|loading chunk/i.test(message)) {
      event.preventDefault();
      recoverFromStaleModule();
    }
  });

  // A previously installed PWA worker can keep controlling a local Vite page
  // even after its source has changed. Remove that controller once on dev-only
  // loopback hosts so lazy-loaded Chat chunks always come from the dev server
  // instead of an old cache. Production builds keep the normal PWA path.
  const isLocalDevelopmentHost = isDevLoopbackOrigin(
    window.location.hostname,
    Boolean(typeof import.meta.env !== "undefined" && import.meta.env.DEV),
  );
  if (isLocalDevelopmentHost && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).then(() => {
      if (navigator.serviceWorker.controller) window.location.reload();
    }).catch(() => undefined);
  }

  // Stash beforeinstallprompt event
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as any).deferredPrompt = e;
    console.log("[PWA] beforeinstallprompt event fired and deferred.");
    // Dispatch custom event so React can update its state
    window.dispatchEvent(new CustomEvent("pwa-install-prompt-available"));
  });

  if (!isLocalDevelopmentHost && "serviceWorker" in navigator) {
    let reloadedForControllerChange = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForControllerChange) return;
      reloadedForControllerChange = true;
      window.location.reload();
    });

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
