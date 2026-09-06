document.addEventListener("DOMContentLoaded", () => {
  // Chrome closes the action popup the instant its native file-picker
  // dialog steals focus, killing the file input's change event before it
  // fires. A window opened via chrome.windows.create isn't a transient
  // popup bubble, so it survives the dialog — reuse it for file selection.
  const urlParams = new URLSearchParams(location.search);
  const isStandalone = urlParams.has("standalone");

  const maincam = document.getElementById("maincam");
  const canvas = document.getElementById("maincanwas");
  const ctx = canvas.getContext("2d");
  const cameraSelect = document.querySelector(".cselement");
  const cpermitionEl = document.getElementById("cpermition");

  // Tabs
  const tabs = document.querySelectorAll(".radioitem");
  const tabContents = document.querySelectorAll(".tab-content");

  // Controls (Canvas)
  const scaleInput = document.getElementById("scalerange");
  const panXInput = document.getElementById("leftrightrange");
  const panYInput = document.getElementById("updownrange");
  const rotateInput = document.getElementById("rotaterange");
  const flipVInput = document.getElementById("flipvertical");
  const flipHInput = document.getElementById("fliphorizontal");
  const resetCanvasBtn = document.getElementById("resetCanvasBtn");
  const backgroundBlurInput = document.getElementById("backgroundBlur");
  const blurStrengthInput = document.getElementById("blurstrengthrange");

  // Grid lines are a preview-only composition aid — stored in localStorage
  // (like the theme) rather than the synced `config`, so there's no path
  // for them to ever reach the actual outgoing camera feed in inject.js.
  const gridToggle = document.getElementById("gridToggle");
  gridToggle.checked = localStorage.getItem("nori-grid") === "1";
  gridToggle.addEventListener("change", () => {
      localStorage.setItem("nori-grid", gridToggle.checked ? "1" : "0");
  });

  // Controls (Ring Light)
  const ringLightToggle = document.getElementById("ringLightToggle");
  const ringLightColorInput = document.getElementById("ringLightColor");
  const ringLightColorPill = document.getElementById("ringLightColorPill");
  const ringLightColorVal = document.getElementById("ringLightColorVal");
  const ringLightPresetChips = document.querySelectorAll("#ringLightPresets .color-chip");
  const ringLightIntensityInput = document.getElementById("ringLightIntensity");
  const ringLightStyleGroup = document.getElementById("ringLightStyleGroup");
  const ringLightStyleBtns = ringLightStyleGroup ? ringLightStyleGroup.querySelectorAll(".segmented-btn") : [];
  let ringLightStyle = "gradient";

  function setRingLightColor(color) {
      ringLightColorInput.value = color;
      if (ringLightColorPill) ringLightColorPill.style.backgroundColor = color;
      if (ringLightColorVal) ringLightColorVal.textContent = color.toUpperCase();
      ringLightPresetChips.forEach(chip => {
          chip.classList.toggle("active", chip.dataset.color.toLowerCase() === color.toLowerCase());
      });
  }

  ringLightColorInput.addEventListener("input", () => {
      setRingLightColor(ringLightColorInput.value);
  });

  ringLightPresetChips.forEach(chip => {
      chip.addEventListener("click", () => {
          setRingLightColor(chip.dataset.color);
          saveConfig();
      });
  });

  function setRingLightStyle(style) {
      ringLightStyle = style;
      ringLightStyleBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.style === style));
  }

  ringLightStyleBtns.forEach(btn => {
      btn.addEventListener("click", () => {
          setRingLightStyle(btn.dataset.style);
          saveConfig();
      });
  });

  ringLightToggle.addEventListener("change", () => {
      saveConfig();
  });

  const RING_LIGHT_DEFAULTS = { ringLight: false, ringLightColor: "#fff4e6", ringLightIntensity: 50, ringLightStyle: "gradient" };
  document.getElementById("resetRingLightBtn").addEventListener("click", () => {
      ringLightToggle.checked = RING_LIGHT_DEFAULTS.ringLight;
      setRingLightColor(RING_LIGHT_DEFAULTS.ringLightColor);
      ringLightIntensityInput.value = RING_LIGHT_DEFAULTS.ringLightIntensity;
      const intensityText = document.getElementById("ringlightintensitytext");
      if (intensityText) intensityText.innerText = RING_LIGHT_DEFAULTS.ringLightIntensity + "%";
      setRingLightStyle(RING_LIGHT_DEFAULTS.ringLightStyle);
      saveConfig();
  });

  const CANVAS_DEFAULTS = { scale: 1.2, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, backgroundBlur: false, backgroundBlurStrength: 50 };
  resetCanvasBtn.addEventListener("click", () => {
      scaleInput.value = CANVAS_DEFAULTS.scale;
      panXInput.value = CANVAS_DEFAULTS.panX;
      panYInput.value = CANVAS_DEFAULTS.panY;
      rotateInput.value = CANVAS_DEFAULTS.rotation;
      flipHInput.checked = CANVAS_DEFAULTS.flipH;
      flipVInput.checked = CANVAS_DEFAULTS.flipV;
      backgroundBlurInput.checked = CANVAS_DEFAULTS.backgroundBlur;
      blurStrengthInput.value = CANVAS_DEFAULTS.backgroundBlurStrength;
      saveConfig();
      startPreview(); // blur toggled off may need to drop the native constraint
  });

  // Controls (Filters)
  const brightnessInput = document.getElementById("brightnessrange");
  const contrastInput = document.getElementById("contrastrange");
  const saturationInput = document.getElementById("saturationrange");
  const autoEnhanceInput = document.getElementById("autoEnhance");
  const filterSwatches = document.querySelectorAll(".filter-swatch");

  // One-click color-fix presets. brightness/contrast/saturation feed the
  // existing sliders; grayscale/sepia/hueRotate are extra ctx.filter
  // components with no dedicated slider (kept simple/"basic" on purpose).
  const FILTER_PRESETS = {
      normal:    { brightness: 100, contrast: 100, saturation: 100, grayscale: 0,   sepia: 0,  hueRotate: 0 },
      fixtint:   { brightness: 108, contrast: 108, saturation: 110, grayscale: 0,   sepia: 0,  hueRotate: -6 },
      warm:      { brightness: 103, contrast: 102, saturation: 115, grayscale: 0,   sepia: 18, hueRotate: -4 },
      cool:      { brightness: 100, contrast: 104, saturation: 105, grayscale: 0,   sepia: 0,  hueRotate: 10 },
      vivid:     { brightness: 105, contrast: 118, saturation: 145, grayscale: 0,   sepia: 0,  hueRotate: 0 },
      fade:      { brightness: 110, contrast: 85,  saturation: 82,  grayscale: 0,   sepia: 10, hueRotate: 0 },
      vintage:   { brightness: 102, contrast: 92,  saturation: 88,  grayscale: 0,   sepia: 38, hueRotate: -8 },
      mono:      { brightness: 105, contrast: 112, saturation: 100, grayscale: 100, sepia: 0,  hueRotate: 0 },
      noir:      { brightness: 95,  contrast: 138, saturation: 100, grayscale: 100, sepia: 0,  hueRotate: 0 },
      cinematic: { brightness: 94,  contrast: 126, saturation: 88,  grayscale: 0,   sepia: 0,  hueRotate: -10 },
      chrome:    { brightness: 108, contrast: 122, saturation: 150, grayscale: 0,   sepia: 0,  hueRotate: 15 }
  };
  let grayscaleValue = 0, sepiaValue = 0, hueRotateValue = 0;
  let currentPresetName = "normal";

  function filterStringForPreset(name) {
      const p = FILTER_PRESETS[name];
      return `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%) grayscale(${p.grayscale}%) sepia(${p.sepia}%) hue-rotate(${p.hueRotate}deg)`;
  }

  // Live thumbnails: each swatch shows the actual camera feed with that
  // preset's filter applied, instead of an abstract color chip, so picking
  // one shows what it will really look like on you.
  const swatchPreviews = Array.from(filterSwatches).map(btn => ({
      preset: btn.dataset.preset,
      canvas: btn.querySelector(".swatch-preview"),
      ctx: btn.querySelector(".swatch-preview").getContext("2d")
  }));
  let swatchPreviewFrame = 0;

  function drawSwatchPreviews() {
      swatchPreviewFrame++;
      if (swatchPreviewFrame % 4 !== 0) return; // thumbnails don't need full frame rate

      swatchPreviews.forEach(({ preset, canvas: c, ctx: sctx }) => {
          const size = c.width;
          sctx.save();
          if (isSynthetic || !maincam.videoWidth) {
              sctx.filter = "none";
              sctx.fillStyle = "#2d3436";
              sctx.fillRect(0, 0, size, size);
          } else {
              sctx.filter = filterStringForPreset(preset);
              const vW = maincam.videoWidth, vH = maincam.videoHeight;
              const side = Math.min(vW, vH);
              sctx.drawImage(maincam, (vW - side) / 2, (vH - side) / 2, side, side, 0, 0, size, size);
          }
          sctx.restore();
      });
  }

  function setActiveSwatch(name) {
      filterSwatches.forEach(btn => btn.classList.toggle("active", btn.dataset.preset === name));
  }

  function applyPreset(name) {
      const preset = FILTER_PRESETS[name];
      if (!preset) return;
      brightnessInput.value = preset.brightness;
      contrastInput.value = preset.contrast;
      saturationInput.value = preset.saturation;
      grayscaleValue = preset.grayscale;
      sepiaValue = preset.sepia;
      hueRotateValue = preset.hueRotate;
      currentPresetName = name;
      autoEnhanceInput.checked = false;
      updateAutoEnhanceUI();
      setActiveSwatch(name);
      saveConfig();
  }

  filterSwatches.forEach(btn => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  resetFiltersBtn.addEventListener("click", () => applyPreset("normal"));

  // Controls (Text)
  const addTextBtn = document.getElementById("addTextBtn");
  const newTextInput = document.getElementById("newTextContent");
  const textList = document.getElementById("textList");
  const clearTextBtn = document.getElementById("clearTextBtn");

  clearTextBtn.addEventListener("click", () => {
      if (overlays.texts.length === 0) return;
      overlays.texts = [];
      saveConfig();
      renderTextList();
  });

  // Controls (Image)
  const newImageInput = document.getElementById("newImageFile");
  const imageList = document.getElementById("imageList");
  const clearImageBtn = document.getElementById("clearImageBtn");

  clearImageBtn.addEventListener("click", () => {
      if (overlays.images.length === 0) return;
      overlays.images = [];
      saveConfig();
      renderImageList();
  });

  canvas.width = 1280;
  canvas.height = 720;
  let isSynthetic = false;

  // Sharp (fully rotated/flipped/filtered/panned, pre-overlay) frame, drawn
  // here first so background blur can composite from it rather than the raw
  // <video> element — matches the transformed pixels the user actually sees.
  const sharpCanvas = document.createElement("canvas");
  const sharpCtx = sharpCanvas.getContext("2d");
  // Set once a stream is (re)acquired with the native `backgroundBlur`
  // constraint actually applied — skips the ML fallback compositing.
  let nativeBlurApplied = false;

  // State
  let overlays = {
      texts: [],
      images: []
  };
  const loadedImages = {}; // Cache for preview

  // Auto Fix Colors: periodically sample the live frame and derive
  // brightness/contrast that normalize it, instead of a fixed preset.
  let autoLevels = { brightness: 100, contrast: 100 };
  let autoLevelsFrame = 0;
  let autoAnalysisCanvas, autoAnalysisCtx;

  function computeAutoLevels(videoEl) {
      if (!videoEl.videoWidth) return null;
      if (!autoAnalysisCanvas) {
          autoAnalysisCanvas = document.createElement('canvas');
          autoAnalysisCanvas.width = 48;
          autoAnalysisCanvas.height = 27;
          autoAnalysisCtx = autoAnalysisCanvas.getContext('2d', { willReadFrequently: true });
      }
      autoAnalysisCtx.drawImage(videoEl, 0, 0, 48, 27);
      let data;
      try {
          data = autoAnalysisCtx.getImageData(0, 0, 48, 27).data;
      } catch (e) {
          return null;
      }
      let sum = 0, min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          if (lum < min) min = lum;
          if (lum > max) max = lum;
      }
      const avg = sum / (data.length / 4);
      const range = Math.max(max - min, 1);
      return {
          brightness: Math.min(160, Math.max(70, (128 / avg) * 100)),
          contrast: Math.min(150, Math.max(80, (170 / range) * 100))
      };
  }

  // --- Tab Logic ---
  tabs.forEach(tab => {
      tab.addEventListener("click", () => {
          tabs.forEach(t => t.classList.remove("selectedradio"));
          tab.classList.add("selectedradio");
          
          const target = tab.dataset.tab;
          tabContents.forEach(content => {
              content.classList.toggle("tab-active", content.id === `tab-${target}`);
          });
      });
  });

  // --- Camera Enumeration ---
  async function getCameras() {
      try {
          await navigator.mediaDevices.getUserMedia({ video: true });
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          
          cameraSelect.innerHTML = "";
          
          if (videoDevices.length === 0) {
              addOption("", "No Camera (Virtual Only)");
          } else {
              let added = false;
              videoDevices.forEach((device, index) => {
                  if (device.label === "Nori V Cam") return;
                  addOption(device.deviceId, device.label || `Camera ${index + 1}`);
                  added = true;
              });
              if (!added) addOption("", "No Camera (Virtual Only)");
          }

          chrome.storage.local.get(['selectedCamera'], (res) => {
              if (res.selectedCamera && videoDevices.some(d => d.deviceId === res.selectedCamera)) {
                  cameraSelect.value = res.selectedCamera;
              } else if (videoDevices.length > 0 && cameraSelect.options.length > 0) {
                  cameraSelect.selectedIndex = 0;
                  chrome.storage.local.set({ selectedCamera: cameraSelect.value });
              }
              startPreview();
          });
      } catch (e) {
          console.warn("Error enumerating cameras", e);
          addOption("", "No Camera (Virtual Only)");
          startPreview();
      }
  }

  function addOption(val, text) {
      const option = document.createElement("option");
      option.value = val;
      option.text = text;
      cameraSelect.appendChild(option);
  }

  // --- Configuration Management ---
  function loadConfig() {
      chrome.storage.local.get(['config'], (result) => {
          const config = result.config || { scale: 1.2, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturation: 100, autoEnhance: false, texts: [], images: [] };

          // Basic
          scaleInput.value = config.scale;
          panXInput.value = config.panX;
          panYInput.value = config.panY;
          rotateInput.value = config.rotation || 0;
          flipHInput.checked = config.flipH;
          flipVInput.checked = config.flipV;

          // Filters
          brightnessInput.value = config.brightness ?? 100;
          contrastInput.value = config.contrast ?? 100;
          saturationInput.value = config.saturation ?? 100;
          grayscaleValue = 0;
          sepiaValue = 0;
          hueRotateValue = 0;
          currentPresetName = "normal";
          setActiveSwatch(currentPresetName);
          autoEnhanceInput.checked = !!config.autoEnhance;
          updateAutoEnhanceUI();
          backgroundBlurInput.checked = false; // Feature unavailable (under development)
          blurStrengthInput.value = config.backgroundBlurStrength ?? 50;
          ringLightToggle.checked = !!config.ringLight;
          setRingLightColor(config.ringLightColor || "#fff4e6");
          ringLightIntensityInput.value = config.ringLightIntensity ?? 50;
          setRingLightStyle(config.ringLightStyle || "gradient");

          // Overlays
          overlays.texts = config.texts || [];
          overlays.images = config.images || [];

          renderTextList();
          renderImageList();
          updateLabels();
      });
  }

  function updateAutoEnhanceUI() {
      const auto = autoEnhanceInput.checked;
      brightnessInput.disabled = auto;
      contrastInput.disabled = auto;
  }

  function saveConfig() {
      const config = {
          scale: parseFloat(scaleInput.value),
          panX: parseFloat(panXInput.value),
          panY: parseFloat(panYInput.value),
          rotation: parseFloat(rotateInput.value),
          flipH: flipHInput.checked,
          flipV: flipVInput.checked,
          brightness: parseFloat(brightnessInput.value),
          contrast: parseFloat(contrastInput.value),
          saturation: parseFloat(saturationInput.value),
          grayscale: 0,
          sepia: 0,
          hueRotate: 0,
          filterPreset: "normal",
          autoEnhance: autoEnhanceInput.checked,
          backgroundBlur: false, // Feature unavailable (under development)
          backgroundBlurStrength: parseFloat(blurStrengthInput.value),
          ringLight: ringLightToggle.checked,
          ringLightColor: ringLightColorInput.value,
          ringLightIntensity: parseFloat(ringLightIntensityInput.value),
          ringLightStyle: ringLightStyle,
          texts: overlays.texts,
          images: overlays.images
      };
      chrome.storage.local.set({ config: config });
      updateLabels();
  }

  function updateLabels() {
      document.getElementById("rangetext").innerText = scaleInput.value + "x";
      document.getElementById("leftrighttext").innerText = panXInput.value;
      document.getElementById("updowntext").innerText = panYInput.value;
      document.getElementById("rotatetext").innerText = rotateInput.value + "°";

      if (autoEnhanceInput.checked) {
          document.getElementById("brightnesstext").innerText = Math.round(autoLevels.brightness) + "% (auto)";
          document.getElementById("contrasttext").innerText = Math.round(autoLevels.contrast) + "% (auto)";
      } else {
          document.getElementById("brightnesstext").innerText = brightnessInput.value + "%";
          document.getElementById("contrasttext").innerText = contrastInput.value + "%";
      }
      document.getElementById("saturationtext").innerText = saturationInput.value + "%";
      document.getElementById("blurstrengthtext").innerText = blurStrengthInput.value + "%";
      document.getElementById("ringlightintensitytext").innerText = ringLightIntensityInput.value + "%";
  }

  // --- Listeners (Basic) ---
  [scaleInput, panXInput, panYInput, rotateInput, flipVInput, flipHInput].forEach(el => {
      el.addEventListener('input', saveConfig);
  });

  // Manually tweaking a filter slider no longer matches any single preset.
  [brightnessInput, contrastInput, saturationInput].forEach(el => {
      el.addEventListener('input', () => {
          currentPresetName = "custom";
          setActiveSwatch(null);
          saveConfig();
      });
  });

  autoEnhanceInput.addEventListener('change', () => {
      updateAutoEnhanceUI();
      if (autoEnhanceInput.checked) {
          currentPresetName = "custom";
          setActiveSwatch(null);
      }
      saveConfig();
  });

  cameraSelect.addEventListener('change', () => {
      chrome.storage.local.set({ selectedCamera: cameraSelect.value });
      startPreview();
  });

  // Toggling blur may need to renegotiate the stream (to try the native
  // constraint); the strength slider just changes the ML fallback's draw.
  backgroundBlurInput.addEventListener('change', () => {
      saveConfig();
      startPreview();
  });
  blurStrengthInput.addEventListener('input', saveConfig);

  // Ring Light applies straight from chrome.storage via ringlight.js on
  // whatever page the user is on — no stream renegotiation needed here.
  [ringLightToggle, ringLightColorInput, ringLightIntensityInput].forEach(el => {
      el.addEventListener('input', saveConfig);
  });


  // --- Text Overlay Logic ---
  addTextBtn.addEventListener("click", () => {
      const text = newTextInput.value.trim();
      if (!text) return;
      
      overlays.texts.push({
          id: Date.now(),
          content: text,
          x: 50,
          y: 50,
          size: 40,
          color: "#ffffff",
          rotation: 0,
          flipH: false,
          flipV: false
      });
      newTextInput.value = "";
      saveConfig();
      renderTextList();
  });

  function escapeAttr(str) {
      return String(str ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
  }

  function renderTextList() {
      clearTextBtn.disabled = overlays.texts.length === 0;
      textList.innerHTML = "";
      if (overlays.texts.length === 0) {
          textList.innerHTML = `<div class="empty-hint">No text overlays added yet</div>`;
          return;
      }
      overlays.texts.forEach((item, index) => {
          const div = document.createElement("div");
          div.className = "overlay-item";
          const currentColor = item.color || "#ffffff";
          const currentRot = item.rotation || 0;
          div.innerHTML = `
            <div class="overlay-card-header">
                <div class="overlay-card-title-wrap">
                    <svg class="overlay-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="4 7 4 4 20 4 20 7"></polyline>
                        <line x1="9" y1="20" x2="15" y2="20"></line>
                        <line x1="12" y1="4" x2="12" y2="20"></line>
                    </svg>
                    <input type="text" class="overlay-text-edit update-text-content" data-idx="${index}" value="${escapeAttr(item.content)}" placeholder="Text content">
                </div>
                <button type="button" class="del-btn" data-idx="${index}" title="Delete text overlay">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
            <div class="overlay-controls-grid">
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">X Position</span>
                        <span class="field-val" id="text-val-x-${index}">${item.x}%</span>
                    </div>
                    <input type="range" min="0" max="100" class="update-text" data-idx="${index}" data-key="x" value="${item.x}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Y Position</span>
                        <span class="field-val" id="text-val-y-${index}">${item.y}%</span>
                    </div>
                    <input type="range" min="0" max="100" class="update-text" data-idx="${index}" data-key="y" value="${item.y}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Size</span>
                        <span class="field-val" id="text-val-size-${index}">${item.size}px</span>
                    </div>
                    <input type="range" min="10" max="200" class="update-text" data-idx="${index}" data-key="size" value="${item.size}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Rotation</span>
                        <span class="field-val" id="text-val-rotation-${index}">${currentRot}°</span>
                    </div>
                    <input type="range" min="-180" max="180" class="update-text" data-idx="${index}" data-key="rotation" value="${currentRot}">
                </div>
            </div>
            <div class="overlay-color-section">
                <div class="field-label-row">
                    <span class="field-label">Text Color</span>
                    <div class="color-picker-control small" title="Choose color">
                        <span class="color-preview-pill" style="background-color: ${currentColor};"></span>
                        <span class="color-hex-val">${currentColor.toUpperCase()}</span>
                        <input type="color" class="update-text-color" data-idx="${index}" data-key="color" value="${currentColor}">
                    </div>
                </div>
                <div class="color-presets-row mini" data-idx="${index}">
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#ffffff' ? 'active' : ''}" data-color="#ffffff" style="background: #ffffff;" title="White"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#0f172a' ? 'active' : ''}" data-color="#0f172a" style="background: #0f172a;" title="Charcoal"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#f59e0b' ? 'active' : ''}" data-color="#f59e0b" style="background: #f59e0b;" title="Amber"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#ef4444' ? 'active' : ''}" data-color="#ef4444" style="background: #ef4444;" title="Red"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background: #10b981;" title="Emerald"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#2563eb' ? 'active' : ''}" data-color="#2563eb" style="background: #2563eb;" title="Classic Blue"></button>
                    <button type="button" class="color-chip mini ${currentColor.toLowerCase() === '#64748b' ? 'active' : ''}" data-color="#64748b" style="background: #64748b;" title="Slate"></button>
                </div>
            </div>
            <div class="overlay-flips-bar">
                <div class="overlay-flip-toggle">
                    <label for="text-fliph-${index}" class="flip-toggle-label">Flip Horiz</label>
                    <div class="toggle-switch">
                        <input type="checkbox" id="text-fliph-${index}" class="update-text-check" data-idx="${index}" data-key="flipH" ${item.flipH ? "checked" : ""}>
                        <label for="text-fliph-${index}">Toggle</label>
                    </div>
                </div>
                <div class="overlay-flip-toggle">
                    <label for="text-flipv-${index}" class="flip-toggle-label">Flip Vert</label>
                    <div class="toggle-switch">
                        <input type="checkbox" id="text-flipv-${index}" class="update-text-check" data-idx="${index}" data-key="flipV" ${item.flipV ? "checked" : ""}>
                        <label for="text-flipv-${index}">Toggle</label>
                    </div>
                </div>
            </div>
          `;
          textList.appendChild(div);
      });

      document.querySelectorAll(".del-btn").forEach(btn => {
          btn.addEventListener("click", () => {
              const idx = parseInt(btn.dataset.idx, 10);
              overlays.texts.splice(idx, 1);
              saveConfig();
              renderTextList();
          });
      });
      document.querySelectorAll(".update-text-content").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              overlays.texts[idx].content = e.target.value;
              saveConfig();
          });
      });
      document.querySelectorAll(".update-text").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              const key = e.target.dataset.key;
              const val = parseFloat(e.target.value);
              overlays.texts[idx][key] = val;
              const badge = document.getElementById(`text-val-${key}-${idx}`);
              if (badge) {
                  const unit = (key === 'x' || key === 'y') ? '%' : (key === 'size' ? 'px' : '°');
                  badge.textContent = `${val}${unit}`;
              }
              saveConfig();
          });
      });
      document.querySelectorAll(".update-text-color").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              const key = e.target.dataset.key;
              const val = e.target.value;
              overlays.texts[idx][key] = val;
              const parent = e.target.closest(".overlay-color-section");
              if (parent) {
                  const pill = parent.querySelector(".color-preview-pill");
                  const hex = parent.querySelector(".color-hex-val");
                  if (pill) pill.style.backgroundColor = val;
                  if (hex) hex.textContent = val.toUpperCase();
                  parent.querySelectorAll(".color-chip").forEach(c => {
                      c.classList.toggle("active", c.dataset.color.toLowerCase() === val.toLowerCase());
                  });
              }
              saveConfig();
          });
      });
      document.querySelectorAll(".overlay-color-section .color-presets-row.mini .color-chip").forEach(chip => {
          chip.addEventListener("click", (e) => {
              e.preventDefault();
              const row = chip.closest(".color-presets-row");
              const idx = parseInt(row.dataset.idx, 10);
              const color = chip.dataset.color;
              overlays.texts[idx].color = color;
              const parent = row.closest(".overlay-color-section");
              if (parent) {
                  const input = parent.querySelector(".update-text-color");
                  const pill = parent.querySelector(".color-preview-pill");
                  const hex = parent.querySelector(".color-hex-val");
                  if (input) input.value = color;
                  if (pill) pill.style.backgroundColor = color;
                  if (hex) hex.textContent = color.toUpperCase();
                  row.querySelectorAll(".color-chip").forEach(c => c.classList.remove("active"));
                  chip.classList.add("active");
              }
              saveConfig();
          });
      });
      document.querySelectorAll(".update-text-check").forEach(input => {
          input.addEventListener("change", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              const key = e.target.dataset.key;
              overlays.texts[idx][key] = e.target.checked;
              saveConfig();
          });
      });
  }


  // --- Image Overlay Logic ---
  const imageUploadLabel = newImageInput.closest(".file-upload-bar") || newImageInput.closest(".file-upload-btn");
  if (imageUploadLabel && !isStandalone) {
      imageUploadLabel.addEventListener("click", (e) => {
          e.preventDefault();
          chrome.windows.create({
              url: chrome.runtime.getURL("popup.html?standalone=1&openImage=1"),
              type: "popup",
              width: 482,
              height: 700
          });
          window.close();
      });
  }

  newImageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
          const img = new Image();
          img.onload = () => {
              const MAX_WIDTH = 1600; 
              const scaleSize = MAX_WIDTH / img.width;
              const c = document.createElement('canvas');
              c.width = MAX_WIDTH;
              c.height = img.height * scaleSize;
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0, c.width, c.height);
              
              const dataUrl = c.toDataURL("image/png");

              overlays.images.push({
                  id: Date.now(),
                  src: dataUrl,
                  name: (file && file.name) ? file.name.replace(/\.[^/.]+$/, "") : `Image #${overlays.images.length + 1}`,
                  x: 50,
                  y: 50,
                  scale: 1.0,
                  opacity: 100,
                  rotation: 0,
                  flipH: false,
                  flipV: false
              });
              saveConfig();
              renderImageList();
              newImageInput.value = "";
          };
          img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
  });

  function renderImageList() {
      clearImageBtn.disabled = overlays.images.length === 0;
      imageList.innerHTML = "";
      if (overlays.images.length === 0) {
          imageList.innerHTML = `<div class="empty-hint">No image overlays added yet</div>`;
          return;
      }
      overlays.images.forEach((item, index) => {
          const div = document.createElement("div");
          div.className = "overlay-item";
          const currentRot = item.rotation || 0;
          const currentOpacity = item.opacity !== undefined ? item.opacity : 100;
          div.innerHTML = `
            <div class="overlay-card-header">
                <div class="overlay-card-title-wrap">
                    <img src="${item.src}" class="overlay-thumb" alt="Overlay preview">
                    <input type="text" class="overlay-text-edit update-img-name" data-idx="${index}" value="${escapeAttr(item.name || `Image #${index + 1}`)}" placeholder="Image label">
                </div>
                <button type="button" class="del-img-btn" data-idx="${index}" title="Delete image overlay">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
            <div class="overlay-controls-grid">
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">X Position</span>
                        <span class="field-val" id="img-val-x-${index}">${item.x}%</span>
                    </div>
                    <input type="range" min="0" max="100" class="update-img" data-idx="${index}" data-key="x" value="${item.x}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Y Position</span>
                        <span class="field-val" id="img-val-y-${index}">${item.y}%</span>
                    </div>
                    <input type="range" min="0" max="100" class="update-img" data-idx="${index}" data-key="y" value="${item.y}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Scale</span>
                        <span class="field-val" id="img-val-scale-${index}">${item.scale}x</span>
                    </div>
                    <input type="range" min="0.1" max="3" step="0.1" class="update-img" data-idx="${index}" data-key="scale" value="${item.scale}">
                </div>
                <div class="overlay-field">
                    <div class="field-label-row">
                        <span class="field-label">Rotation</span>
                        <span class="field-val" id="img-val-rotation-${index}">${currentRot}°</span>
                    </div>
                    <input type="range" min="-180" max="180" class="update-img" data-idx="${index}" data-key="rotation" value="${currentRot}">
                </div>
            </div>
            <div class="overlay-color-section">
                <div class="field-label-row">
                    <span class="field-label">Opacity</span>
                    <span class="field-val" id="img-val-opacity-${index}">${currentOpacity}%</span>
                </div>
                <input type="range" min="5" max="100" class="update-img" data-idx="${index}" data-key="opacity" value="${currentOpacity}">
            </div>
            <div class="overlay-flips-bar">
                <div class="overlay-flip-toggle">
                    <label for="img-fliph-${index}" class="flip-toggle-label">Flip Horiz</label>
                    <div class="toggle-switch">
                        <input type="checkbox" id="img-fliph-${index}" class="update-img-check" data-idx="${index}" data-key="flipH" ${item.flipH ? "checked" : ""}>
                        <label for="img-fliph-${index}">Toggle</label>
                    </div>
                </div>
                <div class="overlay-flip-toggle">
                    <label for="img-flipv-${index}" class="flip-toggle-label">Flip Vert</label>
                    <div class="toggle-switch">
                        <input type="checkbox" id="img-flipv-${index}" class="update-img-check" data-idx="${index}" data-key="flipV" ${item.flipV ? "checked" : ""}>
                        <label for="img-flipv-${index}">Toggle</label>
                    </div>
                </div>
            </div>
          `;
          imageList.appendChild(div);
      });

      document.querySelectorAll(".del-img-btn").forEach(btn => {
          btn.addEventListener("click", () => {
              const idx = parseInt(btn.dataset.idx, 10);
              overlays.images.splice(idx, 1);
              saveConfig();
              renderImageList();
          });
      });
      document.querySelectorAll(".update-img-name").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              overlays.images[idx].name = e.target.value;
              saveConfig();
          });
      });
      document.querySelectorAll(".update-img").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              const key = e.target.dataset.key;
              const val = parseFloat(e.target.value);
              overlays.images[idx][key] = val;
              const badge = document.getElementById(`img-val-${key}-${idx}`);
              if (badge) {
                  const unit = (key === 'x' || key === 'y' || key === 'opacity') ? '%' : (key === 'scale' ? 'x' : '°');
                  badge.textContent = `${val}${unit}`;
              }
              saveConfig();
          });
      });
      document.querySelectorAll(".update-img-check").forEach(input => {
          input.addEventListener("change", (e) => {
              const idx = parseInt(e.target.dataset.idx, 10);
              const key = e.target.dataset.key;
              overlays.images[idx][key] = e.target.checked;
              saveConfig();
          });
      });
  }


  // --- Preview Loop ---
  let previewStream = null;
  async function startPreview() {
    if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
    }
    isSynthetic = false;

    if (!cameraSelect.value) {
        // User deliberately chose "No Camera (Virtual Only)" — not an error,
        // so no permission prompt.
        isSynthetic = true;
        cpermitionEl.style.display = "none";
        drawPreview();
        return;
    }

    const constraints = {
        video: {
            deviceId: { exact: cameraSelect.value },
            width: { ideal: 1600 },
            height: { ideal: 900 }
        }
    };
    const wantsBlur = false; // Feature unavailable (under development)
    if (wantsBlur && window.NoriBgBlur && window.NoriBgBlur.supportsNativeBlur()) {
        constraints.video.backgroundBlur = true;
    }

    try {
      previewStream = await navigator.mediaDevices.getUserMedia(constraints);
      maincam.srcObject = previewStream;
      maincam.play();
      cpermitionEl.style.display = "none";
      const track = previewStream.getVideoTracks()[0];
      nativeBlurApplied = wantsBlur && !!(track && track.getSettings().backgroundBlur);
      // Kick off the (slow, one-time) model load now rather than on the
      // first frame that needs it, so the fallback doesn't stall the draw
      // loop if the native constraint above wasn't honored.
      if (wantsBlur && !nativeBlurApplied && window.NoriBgBlur) window.NoriBgBlur.ensureSegmenter();
      drawPreview();
    } catch (error) {
      console.warn("Camera failed, using synthetic", error);
      isSynthetic = true;
      // Only shown when a camera was actually picked but access failed
      // (permission denied/revoked, device error) — re-shown here in case
      // it had been hidden by an earlier successful preview.
      cpermitionEl.style.display = "";
      drawPreview();
    }
  }

  function drawPreview() {
      if (!isSynthetic && (maincam.paused || maincam.ended)) {
          setTimeout(drawPreview, 1000 / 30);
          return;
      }

      if (swatchPreviews.length > 0) {
          drawSwatchPreviews();
      }

      // Keep the canvas resolution matched to the real feed's native size
      // (or a stable 16:9 default) so drawImage never has to stretch the
      // frame into a mismatched aspect ratio.
      if (isSynthetic) {
          if (canvas.width !== 1280 || canvas.height !== 720) {
              canvas.width = 1280;
              canvas.height = 720;
          }
      } else if (maincam.videoWidth && (canvas.width !== maincam.videoWidth || canvas.height !== maincam.videoHeight)) {
          canvas.width = maincam.videoWidth;
          canvas.height = maincam.videoHeight;
      }

      // 1. Background
      // Use #000 for active video to match inject.js
      ctx.fillStyle = isSynthetic ? "#2d3436" : "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // 2. Video Stream
      if (isSynthetic) {
          ctx.fillStyle = "#636e72";
          ctx.font = "bold 40px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("No Signal", canvas.width/2, canvas.height/2);
      } else {
          if (sharpCanvas.width !== canvas.width || sharpCanvas.height !== canvas.height) {
              sharpCanvas.width = canvas.width;
              sharpCanvas.height = canvas.height;
          }
          sharpCtx.save();
          sharpCtx.fillStyle = "#000000";
          sharpCtx.fillRect(0, 0, canvas.width, canvas.height);

          const camRotation = parseFloat(rotateInput.value) || 0;
          if (camRotation) {
              sharpCtx.translate(canvas.width / 2, canvas.height / 2);
              sharpCtx.rotate(camRotation * Math.PI / 180);
              sharpCtx.translate(-canvas.width / 2, -canvas.height / 2);
          }
          if (flipHInput.checked) {
              sharpCtx.translate(canvas.width, 0);
              sharpCtx.scale(-1, 1);
          }
          if (flipVInput.checked) {
              sharpCtx.translate(0, canvas.height);
              sharpCtx.scale(1, -1);
          }

          const useAuto = autoEnhanceInput.checked;
          if (useAuto) {
              autoLevelsFrame++;
              if (autoLevelsFrame % 15 === 0) {
                  const levels = computeAutoLevels(maincam);
                  if (levels) { autoLevels = levels; updateLabels(); }
              }
          }
          const brightness = useAuto ? autoLevels.brightness : parseFloat(brightnessInput.value);
          const contrast = useAuto ? autoLevels.contrast : parseFloat(contrastInput.value);
          const saturation = parseFloat(saturationInput.value);
          sharpCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscaleValue}%) sepia(${sepiaValue}%) hue-rotate(${hueRotateValue}deg)`;

          const vW = maincam.videoWidth;
          const previewRatio = canvas.width / vW;
          const sw = canvas.width * parseFloat(scaleInput.value);
          const sh = canvas.height * parseFloat(scaleInput.value);

          const x = (canvas.width/2) - (sw/2) + (parseFloat(panXInput.value) * previewRatio);
          const y = (canvas.height/2) - (sh/2) + (parseFloat(panYInput.value) * previewRatio);

          sharpCtx.drawImage(maincam, x, y, sw, sh);
          sharpCtx.restore();

          if (backgroundBlurInput.checked && !nativeBlurApplied && window.NoriBgBlur) {
              window.NoriBgBlur.composite(ctx, sharpCanvas, canvas.width, canvas.height, parseFloat(blurStrengthInput.value), ctx);
          } else {
              ctx.drawImage(sharpCanvas, 0, 0);
          }
      }

      ctx.restore(); // Restore flip/rotate/filter context (must always pair with the save() above)

      // 3. Render Overlays (Images)
      overlays.images.forEach(img => {
          if (!loadedImages[img.id]) {
              const i = new Image();
              i.src = img.src;
              loadedImages[img.id] = i;
          }
          const i = loadedImages[img.id];
          if (i.complete && i.naturalWidth > 0) {
              const x = (img.x / 100) * canvas.width;
              const y = (img.y / 100) * canvas.height;
              const w = (i.width * img.scale) * (canvas.width / 800); 
              const h = (i.height * img.scale) * (canvas.width / 800);
              
              ctx.save();
              ctx.translate(x, y);
              if (img.rotation) ctx.rotate(img.rotation * Math.PI / 180);
              if (img.flipH) ctx.scale(-1, 1);
              if (img.flipV) ctx.scale(1, -1);
              ctx.globalAlpha = (img.opacity !== undefined ? img.opacity : 100) / 100;
              ctx.drawImage(i, -w/2, -h/2, w, h);
              ctx.restore();
          }
      });

      // 4. Render Overlays (Text)
      overlays.texts.forEach(txt => {
          ctx.save();
          const x = (txt.x / 100) * canvas.width;
          const y = (txt.y / 100) * canvas.height;
          const fontSize = txt.size * (canvas.width / 800); 
          
          ctx.translate(x, y);
          if (txt.rotation) ctx.rotate(txt.rotation * Math.PI / 180);
          if (txt.flipH) ctx.scale(-1, 1);
          if (txt.flipV) ctx.scale(1, -1);

          ctx.fillStyle = txt.color;
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 2;
          
          ctx.fillText(txt.content, 0, 0);
          ctx.restore();
      });

      // 5. Grid Lines (preview only — never drawn in inject.js's output)
      if (gridToggle.checked) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 1; i < 3; i++) {
              const gx = (canvas.width / 3) * i;
              ctx.moveTo(gx, 0);
              ctx.lineTo(gx, canvas.height);
              const gy = (canvas.height / 3) * i;
              ctx.moveTo(0, gy);
              ctx.lineTo(canvas.width, gy);
          }
          ctx.stroke();
          ctx.restore();
      }

      // setTimeout, not requestAnimationFrame: rAF is fully suspended once
      // the popup/popout window is hidden or loses focus, which froze the
      // preview when switching tabs.
      setTimeout(drawPreview, 1000 / 30);
  }

  loadConfig();
  getCameras();

  if (isStandalone && urlParams.has("openImage")) {
      document.querySelector('.radioitem[data-tab="image"]')?.click();
  }
});