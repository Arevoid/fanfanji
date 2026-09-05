// Keep the first paint aligned with the persisted appearance preference.
// The React ThemeProvider remains the runtime source of truth.
(function () {
  var light = "#f7f7f5";
  var dark = "#171719";
  var theme = "light";
  var globalFontSize = 16;
  try {
    var raw = localStorage.getItem("phone_appearance_settings");
    var mode = raw ? JSON.parse(raw).themeMode : "light";
    if (mode === "dark") theme = "dark";
    else if (mode === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
    var settingsRaw = localStorage.getItem("phone_settings");
    var savedFontSize = settingsRaw ? Number(JSON.parse(settingsRaw).globalFontSize) : 16;
    if (isFinite(savedFontSize)) globalFontSize = Math.max(13, Math.min(20, Math.round(savedFontSize)));
  } catch (_) {}
  var color = theme === "dark" ? dark : light;
  function applyFirstPaintTheme() {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = color;
    document.documentElement.style.setProperty("--app-root-font-size", globalFontSize + "px");
    document.documentElement.style.setProperty("--app-font-scale", String(globalFontSize / 16));
    if (document.body) {
      document.body.style.colorScheme = theme;
      document.body.style.backgroundColor = color;
    }
    var root = document.getElementById("root");
    if (root) {
      root.style.colorScheme = theme;
      root.style.backgroundColor = color;
    }
    var meta = document.getElementById("app-theme-color");
    if (meta) meta.content = color;
    var appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatusBar) appleStatusBar.content = theme === "dark" ? "black-translucent" : "default";
  }
  applyFirstPaintTheme();
  document.addEventListener("DOMContentLoaded", applyFirstPaintTheme, { once: true });
})();
