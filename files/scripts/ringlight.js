// Ring Light — a full-viewport glow along the screen edges that acts as a
// soft fill light for the webcam in dark rooms. Runs as an ISOLATED-world
// content script (unlike inject.js/bgblur.js) because it only ever touches
// the DOM, never the page's own JS objects, so it doesn't need MAIN-world
// access — and isolated-world scripts get chrome.storage directly, no
// postMessage bridge required.
(function () {
  const EDGE_FADE_PX = 140; // how close the cursor has to get to an edge to start fading the glow

  let config = { ringLight: false, ringLightColor: "#fff4e6", ringLightIntensity: 50, ringLightStyle: "gradient" };
  let overlay = null;
  let mouseMoveBound = false;

  function colorToRgb(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      const v = m ? m[1] : "fff4e6";
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }

  function ensureOverlay() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "nori-ring-light-overlay";
      overlay.style.cssText = [
          "position:fixed", "inset:0", "pointer-events:none", "z-index:2147483647",
          "transition:opacity 0.25s ease, box-shadow 0.2s ease"
      ].join(";");
      (document.body || document.documentElement).appendChild(overlay);
      return overlay;
  }

  function applyStyle() {
      const el = ensureOverlay();
      const [r, g, b] = colorToRgb(config.ringLightColor);
      // `factor` is 0-1 across the whole 0-200 slider, so alpha/blur/spread
      // all keep climbing right up to the top of the range instead of alpha
      // saturating around the halfway mark and the top half only widening.
      const factor = Math.max(0, Math.min(200, config.ringLightIntensity ?? 50)) / 200;

      if (config.ringLightStyle === "solid") {
          // A flat, hard-edged band of color around the screen — no blur,
          // just a wider/more opaque frame as intensity goes up.
          const alpha = 0.35 + factor * 0.65;
          const thickness = 10 + factor * 70;
          el.style.boxShadow = `inset 0 0 0 ${thickness}px rgba(${r}, ${g}, ${b}, ${alpha})`;
      } else {
          // Soft glow fading from transparent at the center to the chosen
          // color at the edges.
          const alpha = 0.15 + factor * 0.8;
          const blur = 80 + factor * 420;
          const spread = 8 + factor * 92;
          el.style.boxShadow = `inset 0 0 ${blur}px ${spread}px rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      el.style.opacity = "1";
  }

  function onMouseMove(e) {
      if (!overlay) return;
      const distToEdge = Math.min(e.clientX, e.clientY, window.innerWidth - e.clientX, window.innerHeight - e.clientY);
      const fade = Math.max(0, Math.min(1, distToEdge / EDGE_FADE_PX));
      overlay.style.opacity = String(fade);
  }

  function setEnabled(enabled) {
      if (enabled) {
          applyStyle();
          if (!mouseMoveBound) {
              window.addEventListener("mousemove", onMouseMove, { passive: true });
              mouseMoveBound = true;
          }
      } else {
          if (mouseMoveBound) {
              window.removeEventListener("mousemove", onMouseMove);
              mouseMoveBound = false;
          }
          if (overlay) { overlay.remove(); overlay = null; }
      }
  }

  function applyConfig(newConfig) {
      const wasEnabled = config.ringLight;
      config = { ...config, ...newConfig };
      if (config.ringLight) {
          setEnabled(true); // re-applies color/intensity/style even if already on
      } else if (wasEnabled) {
          setEnabled(false);
      }
  }

  chrome.storage.local.get(["config"], (result) => {
      if (result.config) applyConfig(result.config);
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local" && changes.config) {
          applyConfig(changes.config.newValue || {});
      }
  });
})();
