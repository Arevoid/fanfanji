import { useEffect, useState } from "react";

interface DeferredInstallPrompt {
  prompt: () => Promise<void> | void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" | string }>;
}

type PwaWindow = Window & {
  deferredPrompt?: DeferredInstallPrompt | null;
};

/** Tracks standalone mode and owns the browser install prompt lifecycle. */
export function usePwaInstall() {
  const [isPwaInstallable, setIsPwaInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const browserWindow = window as PwaWindow;
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
        || document.referrer.includes("android-app://");
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    if (browserWindow.deferredPrompt) setIsPwaInstallable(true);

    const handlePromptAvailable = () => setIsPwaInstallable(true);
    window.addEventListener("pwa-install-prompt-available", handlePromptAvailable);
    return () => window.removeEventListener("pwa-install-prompt-available", handlePromptAvailable);
  }, []);

  const handlePwaInstall = async () => {
    const browserWindow = window as PwaWindow;
    const promptEvent = browserWindow.deferredPrompt;
    if (!promptEvent) {
      alert("抱歉，您的浏览器目前尚未触发 PWA 安装。通常这发生在您通过非安全连接访问、使用受限制的浏览器套壳，或者您的设备已经安装了该应用的情况下。\n\n请尝试在 Safari / Chrome / Edge 浏览器中直接打开本页面，或通过浏览器内置的“安装应用”/“添加到主屏幕”菜单选项进行手动安装！");
      return;
    }
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`[PWA] Install prompt outcome: ${outcome}`);
      if (outcome === "accepted") {
        browserWindow.deferredPrompt = null;
        setIsPwaInstallable(false);
      }
    } catch (error) {
      console.error("[PWA] Install prompt failed:", error);
    }
  };

  return { isPwaInstallable, isStandalone, handlePwaInstall };
}
