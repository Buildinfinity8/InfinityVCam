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

  const CANVAS_DEFAULTS = { scale: 1.2, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false };
  resetCanvasBtn.addEventListener("click", () => {
      scaleInput.value = CANVAS_DEFAULTS.scale;
      panXInput.value = CANVAS_DEFAULTS.panX;
      panYInput.value = CANVAS_DEFAULTS.panY;
      rotateInput.value = CANVAS_DEFAULTS.rotation;
      flipHInput.checked = CANVAS_DEFAULTS.flipH;
      flipVInput.checked = CANVAS_DEFAULTS.flipV;
      saveConfig();
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
      normal:  { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hueRotate: 0 },
      fixtint: { brightness: 108, contrast: 108, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -6 },
      warm:    { brightness: 103, contrast: 102, saturation: 115, grayscale: 0, sepia: 18, hueRotate: -4 },
      cool:    { brightness: 100, contrast: 104, saturation: 105, grayscale: 0, sepia: 0, hueRotate: 10 },
      bw:      { brightness: 105, contrast: 115, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0 },
      vivid:   { brightness: 105, contrast: 118, saturation: 145, grayscale: 0, sepia: 0, hueRotate: 0 }
  };
  let grayscaleValue = 0, sepiaValue = 0, hueRotateValue = 0;
  let currentPresetName = "normal";

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
          grayscaleValue = config.grayscale || 0;
          sepiaValue = config.sepia || 0;
          hueRotateValue = config.hueRotate || 0;
          currentPresetName = config.filterPreset || "normal";
          setActiveSwatch(currentPresetName);
          autoEnhanceInput.checked = !!config.autoEnhance;
          updateAutoEnhanceUI();

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
          grayscale: grayscaleValue,
          sepia: sepiaValue,
          hueRotate: hueRotateValue,
          filterPreset: currentPresetName,
          autoEnhance: autoEnhanceInput.checked,
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

  function renderTextList() {
      clearTextBtn.disabled = overlays.texts.length === 0;
      textList.innerHTML = "";
      overlays.texts.forEach((item, index) => {
          const div = document.createElement("div");
          div.className = "overlay-item";
          div.innerHTML = `
            <div class="overlay-header">
                <span class="overlay-title">${item.content}</span>
                <button class="del-btn" data-idx="${index}">×</button>
            </div>
            <div class="control-grid">
                <div class="control-group">
                    <label>X Position</label>
                    <input type="range" min="0" max="100" class="update-text" data-idx="${index}" data-key="x" value="${item.x}">
                </div>
                <div class="control-group">
                    <label>Y Position</label>
                    <input type="range" min="0" max="100" class="update-text" data-idx="${index}" data-key="y" value="${item.y}">
                </div>
                <div class="control-group">
                    <label>Size</label>
                    <input type="range" min="10" max="200" class="update-text" data-idx="${index}" data-key="size" value="${item.size}">
                </div>
                <div class="control-group">
                    <label>Color</label>
                    <input type="color" class="update-text-color" data-idx="${index}" data-key="color" value="${item.color}">
                </div>
                <div class="control-group">
                    <label>Rotation</label>
                    <input type="range" min="-180" max="180" class="update-text" data-idx="${index}" data-key="rotation" value="${item.rotation || 0}">
                </div>
                <div class="control-group">
                    <label>Flip H</label>
                    <input type="checkbox" class="update-text-check" data-idx="${index}" data-key="flipH" ${item.flipH ? "checked" : ""}>
                </div>
                <div class="control-group">
                    <label>Flip V</label>
                    <input type="checkbox" class="update-text-check" data-idx="${index}" data-key="flipV" ${item.flipV ? "checked" : ""}>
                </div>
            </div>
          `;
          textList.appendChild(div);
      });

      document.querySelectorAll(".del-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
              overlays.texts.splice(e.target.dataset.idx, 1);
              saveConfig();
              renderTextList();
          });
      });
      document.querySelectorAll(".update-text").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = e.target.dataset.idx;
              const key = e.target.dataset.key;
              overlays.texts[idx][key] = parseFloat(e.target.value);
              saveConfig();
          });
      });
      document.querySelectorAll(".update-text-color").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = e.target.dataset.idx;
              const key = e.target.dataset.key;
              overlays.texts[idx][key] = e.target.value;
              saveConfig();
          });
      });
      document.querySelectorAll(".update-text-check").forEach(input => {
          input.addEventListener("change", (e) => {
              const idx = e.target.dataset.idx;
              const key = e.target.dataset.key;
              overlays.texts[idx][key] = e.target.checked;
              saveConfig();
          });
      });
  }


  // --- Image Overlay Logic ---
  const imageUploadLabel = newImageInput.closest(".file-upload-btn");
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
                  x: 50,
                  y: 50,
                  scale: 1.0,
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
      overlays.images.forEach((item, index) => {
          const div = document.createElement("div");
          div.className = "overlay-item";
          div.innerHTML = `
            <div class="overlay-header">
                <img src="${item.src}" class="overlay-thumb">
                <button class="del-img-btn" data-idx="${index}">×</button>
            </div>
            <div class="control-grid">
                <div class="control-group">
                    <label>X Position</label>
                    <input type="range" min="0" max="100" class="update-img" data-idx="${index}" data-key="x" value="${item.x}">
                </div>
                <div class="control-group">
                    <label>Y Position</label>
                    <input type="range" min="0" max="100" class="update-img" data-idx="${index}" data-key="y" value="${item.y}">
                </div>
                <div class="control-group">
                    <label>Scale</label>
                    <input type="range" min="0.1" max="3" step="0.1" class="update-img" data-idx="${index}" data-key="scale" value="${item.scale}">
                </div>
                <div class="control-group">
                    <label>Rotation</label>
                    <input type="range" min="-180" max="180" class="update-img" data-idx="${index}" data-key="rotation" value="${item.rotation || 0}">
                </div>
                <div class="control-group">
                    <label>Flip H</label>
                    <input type="checkbox" class="update-img-check" data-idx="${index}" data-key="flipH" ${item.flipH ? "checked" : ""}>
                </div>
                <div class="control-group">
                    <label>Flip V</label>
                    <input type="checkbox" class="update-img-check" data-idx="${index}" data-key="flipV" ${item.flipV ? "checked" : ""}>
                </div>
            </div>
          `;
          imageList.appendChild(div);
      });

      document.querySelectorAll(".del-img-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
              overlays.images.splice(e.target.dataset.idx, 1);
              saveConfig();
              renderImageList();
          });
      });
      document.querySelectorAll(".update-img").forEach(input => {
          input.addEventListener("input", (e) => {
              const idx = e.target.dataset.idx;
              const key = e.target.dataset.key;
              overlays.images[idx][key] = parseFloat(e.target.value);
              saveConfig();
          });
      });
      document.querySelectorAll(".update-img-check").forEach(input => {
          input.addEventListener("change", (e) => {
              const idx = e.target.dataset.idx;
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

    try {
      previewStream = await navigator.mediaDevices.getUserMedia(constraints);
      maincam.srcObject = previewStream;
      maincam.play();
      cpermitionEl.style.display = "none";
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
          const camRotation = parseFloat(rotateInput.value) || 0;
          if (camRotation) {
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate(camRotation * Math.PI / 180);
              ctx.translate(-canvas.width / 2, -canvas.height / 2);
          }
          if (flipHInput.checked) {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
          }
          if (flipVInput.checked) {
              ctx.translate(0, canvas.height);
              ctx.scale(1, -1);
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
          ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscaleValue}%) sepia(${sepiaValue}%) hue-rotate(${hueRotateValue}deg)`;

          const vW = maincam.videoWidth;
          const previewRatio = canvas.width / vW;
          const sw = canvas.width * parseFloat(scaleInput.value);
          const sh = canvas.height * parseFloat(scaleInput.value);

          const x = (canvas.width/2) - (sw/2) + (parseFloat(panXInput.value) * previewRatio);
          const y = (canvas.height/2) - (sh/2) + (parseFloat(panYInput.value) * previewRatio);

          ctx.drawImage(maincam, x, y, sw, sh);
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