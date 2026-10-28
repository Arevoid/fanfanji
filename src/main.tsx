import {StrictMode, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { ThemeProvider } from './features/theme/ThemeProvider.tsx';
import { isDevLoopbackOrigin } from './core/runtime/devOrigin.ts';
import { installDevRuntimeProbe } from './core/runtime/devDiagnostics.ts';
import { initializeMemoryAdmissionV2Promotion } from './features/chat/services/directChatMemoryAdmissionPromotion.ts';
import { recoverMemoryStoreTransaction } from './core/storage/memoryStoreTransaction.ts';
import { initializeMemoryWriterCoordination, getMemoryWriterState, subscribeMemoryWriterState } from './core/storage/memoryWriterCoordination.ts';
import { recoverSourceMessageMutation } from './features/characterKnowledge/services/sourceMessageMutationService.ts';

installDevRuntimeProbe();
const applicationRoot = createRoot(document.getElementById('root')!);
function MemoryWriterNotice() {
  const current = useSyncExternalStore(subscribeMemoryWriterState, getMemoryWriterState);
  if (current === 'writer') return null;
  return <div role="status" className="fixed left-0 right-0 top-0 z-[10000] bg-amber-100 p-3 text-center text-sm text-amber-950">
    {current === 'unsupported' ? '当前浏览器无法建立安全写入保护，聊天和记忆暂为只读。请允许网站存储，或更新浏览器后重试。'
      : current === 'expired' ? '页面写入权限已过期，聊天和记忆暂为只读。请刷新本页，重新加载最新数据后继续。'
      : '另一个窗口正在维护聊天和记忆，此窗口只读。关闭另一个窗口后刷新本页；异常关闭时，请等待约30秒再刷新。'}
    <button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>刷新本页</button>
  </div>;
}
async function mountApplication() {
applicationRoot.render(<div role="status" style={{ padding: 24, fontFamily: 'system-ui' }}>正在打开米饭机…</div>);
const memoryWriter = await initializeMemoryWriterCoordination();
if (memoryWriter === 'writer') initializeMemoryAdmissionV2Promotion();
const memoryRecovery = memoryWriter === 'writer' ? recoverMemoryStoreTransaction() : { success: true };
if(memoryWriter === 'writer' && memoryRecovery.success && !await recoverSourceMessageMutation()) memoryRecovery.success=false;
const appModule = await import('./App.tsx');
if(import.meta.env.DEV&&window.location.hostname==='127.0.0.4'&&window.location.port==='3104'
 &&new URLSearchParams(window.location.search).get('memoryAcceptanceFixture')==='1'&&memoryWriter==='writer'){
 const fixture=await import('./features/characterKnowledge/dev/memoryAcceptanceFixture');
 await fixture.prepareMemoryAcceptanceFixture(appModule.DEFAULT_SETTINGS);
}
if (import.meta.env.DEV && (window.location.hostname === '127.0.0.3' || window.location.hostname === '127.0.0.9' && new URLSearchParams(window.location.search).get('memoryCostGateFixture')==='1') && window.location.port === '3103'
  && new URLSearchParams(window.location.search).get('chatPerformanceFixture') === '1' && memoryWriter === 'writer') {
  const fixture = await import('./features/chat/dev/chatPerformanceFixture');
  await fixture.prepareChatPerformanceFixture(appModule.DEFAULT_SETTINGS);
}
const App = appModule.default;

applicationRoot.render(
  <StrictMode>
    <ThemeProvider>
      <MemoryWriterNotice />
      {memoryRecovery.success ? <App /> : <div role="alert">记忆恢复尚未完成。原始快照已保留，请释放浏览器存储空间后重新打开。</div>}
    </ThemeProvider>
  </StrictMode>,
);
}
void mountApplication().catch(() => applicationRoot.render(<div role="alert" style={{ padding: 24 }}>页面暂时无法打开。<button onClick={() => window.location.reload()}>重新加载</button></div>));

// Register service worker for PWA capability and listen to beforeinstallprompt
if (typeof window !== "undefined") {
  // A deployment can leave an already-open PWA pointing at a removed hashed
  // chunk. Vite exposes this as `vite:preloadError`; older browsers often
  // surface the same condition as an unhandled dynamic-import rejection.
  // Recover once per short window so a stale client refreshes onto the new
  // asset graph without entering an infinite reload loop.
  const staleModuleRecoveryKey = "fanfan-stale-module-recovery-at";
  const recoverFromStaleModule = async () => {
    try {
      const previousAttempt = Number(window.sessionStorage.getItem(staleModuleRecoveryKey) || 0);
      const now = Date.now();
      if (Number.isFinite(previousAttempt) && previousAttempt > 0 && now - previousAttempt < 30_000) return;
      window.sessionStorage.setItem(staleModuleRecoveryKey, String(now));
    } catch {
      // A restricted storage context should still receive the normal reload.
    }
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      }
    } catch {
      // A failed cleanup should not leave the user stuck on the old module.
    } finally {
      window.location.reload();
    }
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    void recoverFromStaleModule();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "");
    if (/dynamically imported module|importing a module script failed|loading chunk/i.test(message)) {
      event.preventDefault();
      void recoverFromStaleModule();
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
