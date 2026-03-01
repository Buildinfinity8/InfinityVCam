document.addEventListener("DOMContentLoaded", () => {
  const maincam = document.getElementById("maincam");
  const canvas = document.getElementById("maincanwas");
  const ctx = canvas.getContext("2d");
  const cameraSelect = document.querySelector(".cselement");

  // Tabs
  const tabs = document.querySelectorAll(".radioitem");
  const tabContents = document.querySelectorAll(".tab-content");

  // Controls (Canvas)
  const scaleInput = document.getElementById("scalerange");
  const panXInput = document.getElementById("leftrightrange");
  const panYInput = document.getElementById("updownrange");
  const flipVInput = document.getElementById("flipvertical");
  const flipHInput = document.getElementById("fliphorizontal");
  
  // Controls (Text)
  const addTextBtn = document.getElementById("addTextBtn");
  const newTextInput = document.getElementById("newTextContent");
  const textList = document.getElementById("textList");

  // Controls (Image)
  const newImageInput = document.getElementById("newImageFile");
  const imageList = document.getElementById("imageList");

  canvas.width = 480;
  canvas.height = 270;
  let isSynthetic = false;
  
  // State
  let overlays = {
      texts: [],
      images: []
  };
  const loadedImages = {}; // Cache for preview

  // --- Tab Logic ---
  tabs.forEach(tab => {
      tab.addEventListener("click", () => {
          tabs.forEach(t => t.classList.remove("selectedradio"));
          tab.classList.add("selectedradio");
          
          const target = tab.dataset.tab;
          tabContents.forEach(content => {
              content.style.display = content.id === `tab-${target}` ? "block" : "none";
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
                  if (device.label === "Virtual Camera") return;
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
          const config = result.config || { scale: 1.2, panX: 0, panY: 0, flipH: false, flipV: false, texts: [], images: [] };
          
          // Basic
          scaleInput.value = config.scale;
          panXInput.value = config.panX;
          panYInput.value = config.panY;
          flipHInput.checked = config.flipH;
          flipVInput.checked = config.flipV;
          
          // Overlays
          overlays.texts = config.texts || [];
          overlays.images = config.images || [];
          
          renderTextList();
          renderImageList();
          updateLabels();
      });
  }

  function saveConfig() {
      const config = {
          scale: parseFloat(scaleInput.value),
          panX: parseFloat(panXInput.value),
          panY: parseFloat(panYInput.value),
          flipH: flipHInput.checked,
          flipV: flipVInput.checked,
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
  }

  // --- Listeners (Basic) ---
  [scaleInput, panXInput, panYInput, flipVInput, flipHInput].forEach(el => {
      el.addEventListener('input', saveConfig);
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
          flipH: false,
          flipV: false
      });
      newTextInput.value = "";
      saveConfig();
      renderTextList();
  });

  function renderTextList() {
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
  newImageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
          const img = new Image();
          img.onload = () => {
              const MAX_WIDTH = 400; 
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
        isSynthetic = true;
        drawPreview();
        return;
    }

    const constraints = {
        video: { 
            deviceId: { exact: cameraSelect.value },
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
        }
    };

    try {
      previewStream = await navigator.mediaDevices.getUserMedia(constraints);
      maincam.srcObject = previewStream;
      maincam.play();
      drawPreview();
    } catch (error) {
      console.warn("Camera failed, using synthetic", error);
      isSynthetic = true;
      drawPreview();
    }
  }

  function drawPreview() {
      if (!isSynthetic && (maincam.paused || maincam.ended)) {
          requestAnimationFrame(drawPreview);
          return;
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
          if (flipHInput.checked) {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
          }
          if (flipVInput.checked) {
              ctx.translate(0, canvas.height);
              ctx.scale(1, -1);
          }
          
          const vW = maincam.videoWidth || 1280;
          const previewRatio = canvas.width / vW; 
          const sw = canvas.width * parseFloat(scaleInput.value);
          const sh = canvas.height * parseFloat(scaleInput.value);
          
          const x = (canvas.width/2) - (sw/2) + (parseFloat(panXInput.value) * previewRatio);
          const y = (canvas.height/2) - (sh/2) + (parseFloat(panYInput.value) * previewRatio);
          
          ctx.drawImage(maincam, x, y, sw, sh);
      }
      
      if (!isSynthetic) ctx.restore(); // Restore flip context

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
      
      requestAnimationFrame(drawPreview);
  }

  loadConfig();
  getCameras();
});