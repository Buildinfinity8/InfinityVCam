(function() {
  if (window.NoriVCamInjected) return;
  window.NoriVCamInjected = true;

  console.log("Nori V Cam: Virtual Device Mode Active v1.1.0 — by Omnori");

  const VIRTUAL_DEVICE_ID = "nori-v-cam-virtual-id";
  const VIRTUAL_DEVICE_LABEL = "Nori V Cam";
  const VIRTUAL_GROUP_ID = "nori-v-cam-virtual-group";

  let state = {
      scale: 1.2, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false,
      brightness: 100, contrast: 100, saturation: 100, autoEnhance: false,
      grayscale: 0, sepia: 0, hueRotate: 0,
      texts: [], images: []
  };

  const loadedImages = {};

  // Auto Fix Colors: periodically sample the live frame and derive
  // brightness/contrast that normalize it, instead of a fixed preset.
  let autoAnalysisCanvas, autoAnalysisCtx;
  function computeAutoLevels(source, srcWidth) {
      if (!srcWidth) return null;
      if (!autoAnalysisCanvas) {
          autoAnalysisCanvas = document.createElement('canvas');
          autoAnalysisCanvas.width = 48;
          autoAnalysisCanvas.height = 27;
          autoAnalysisCtx = autoAnalysisCanvas.getContext('2d', { willReadFrequently: true });
      }
      autoAnalysisCtx.drawImage(source, 0, 0, 48, 27);
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

  window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === "NORI_VCAM_CONFIG") {
          state = { ...state, ...event.data.payload };
          // Preload images
          if (state.images) {
              state.images.forEach(img => {
                  if (!loadedImages[img.id]) {
                      const i = new Image();
                      i.src = img.src;
                      loadedImages[img.id] = i;
                  }
              });
          }
      }
  });
  window.postMessage({ type: "NORI_VCAM_GET_CONFIG" }, "*");

  const hiddenContainer = document.createElement('div');
  hiddenContainer.style = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-9999';
  (document.body || document.documentElement).appendChild(hiddenContainer);

  function drawOverlays(ctx, width, height) {
      if (state.images) {
          state.images.forEach(img => {
              const i = loadedImages[img.id];
              if (i && i.complete && i.naturalWidth > 0) {
                  const x = (img.x / 100) * width;
                  const y = (img.y / 100) * height;
                  const scaleFactor = width / 800; 
                  const w = (i.width * img.scale) * scaleFactor;
                  const h = (i.height * img.scale) * scaleFactor;
                  
                  ctx.save();
                  ctx.translate(x, y);
                  if (img.rotation) ctx.rotate(img.rotation * Math.PI / 180);
                  // Apply flips relative to the item's center
                  if (img.flipH) ctx.scale(-1, 1);
                  if (img.flipV) ctx.scale(1, -1);

                  ctx.drawImage(i, -w/2, -h/2, w, h);
                  ctx.restore();
              }
          });
      }

      if (state.texts) {
          state.texts.forEach(txt => {
              ctx.save();
              const x = (txt.x / 100) * width;
              const y = (txt.y / 100) * height;
              const fontSize = txt.size * (width / 800);
              
              ctx.translate(x, y);
              if (txt.rotation) ctx.rotate(txt.rotation * Math.PI / 180);
              if (txt.flipH) ctx.scale(-1, 1);
              if (txt.flipV) ctx.scale(1, -1);

              ctx.fillStyle = txt.color;
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.shadowColor = "rgba(0,0,0,0.5)";
              ctx.shadowBlur = 4;
              
              ctx.fillText(txt.content, 0, 0);
              ctx.restore();
          });
      }
  }

  function createSyntheticStream() {
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', { alpha: false });
      hiddenContainer.appendChild(canvas);

      let active = true;
      function draw() {
          if (!active) return;
          ctx.fillStyle = "#2d3436"; ctx.fillRect(0, 0, 1280, 720);
          ctx.save();
          ctx.fillStyle = "#636e72";
          ctx.font = "bold 80px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("No Signal", 640, 360);
          ctx.restore();
          drawOverlays(ctx, 1280, 720);
      }
      draw();
      // setInterval, not requestAnimationFrame: rAF is fully suspended once
      // the tab is hidden/backgrounded, which froze the outgoing frame the
      // moment a user switched away from the call tab.
      const timerId = setInterval(draw, 1000 / 30);

      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0];
      const origStop = track.stop.bind(track);
      track.stop = () => { active = false; clearInterval(timerId); canvas.remove(); origStop(); };
      
      Object.defineProperty(track, 'label', { get: () => VIRTUAL_DEVICE_LABEL });
      Object.defineProperty(track, 'deviceId', { get: () => VIRTUAL_DEVICE_ID });
      track.getSettings = () => ({ width: 1280, height: 720, deviceId: VIRTUAL_DEVICE_ID, groupId: VIRTUAL_GROUP_ID, frameRate: 30 });
      return stream;
  }

  // Shared per-frame render: rotate/flip/filter/pan-scale the source into
  // the canvas, then draw overlays on top. `source` is either a <video>
  // element or a raw VideoFrame — both work with ctx.drawImage. autoState
  // is a small mutable {frameCount, levels} bag owned by the caller.
  function drawFrameToCanvas(ctx, source, srcWidth, width, height, autoState) {
      // Match #000 background for video
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
      ctx.save();

      if (state.rotation) {
          ctx.translate(width / 2, height / 2);
          ctx.rotate(state.rotation * Math.PI / 180);
          ctx.translate(-width / 2, -height / 2);
      }
      if (state.flipH) { ctx.translate(width, 0); ctx.scale(-1, 1); }
      if (state.flipV) { ctx.translate(0, height); ctx.scale(1, -1); }

      if (state.autoEnhance) {
          autoState.frameCount++;
          if (autoState.frameCount % 15 === 0) {
              const levels = computeAutoLevels(source, srcWidth);
              if (levels) autoState.levels = levels;
          }
      }
      const brightness = state.autoEnhance ? autoState.levels.brightness : (state.brightness || 100);
      const contrast = state.autoEnhance ? autoState.levels.contrast : (state.contrast || 100);
      const saturation = state.saturation || 100;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${state.grayscale || 0}%) sepia(${state.sepia || 0}%) hue-rotate(${state.hueRotate || 0}deg)`;

      const sw = width * state.scale; const sh = height * state.scale;
      const x = (width/2) - (sw/2) + parseFloat(state.panX);
      const y = (height/2) - (sh/2) + parseFloat(state.panY);

      ctx.drawImage(source, x, y, sw, sh);
      ctx.restore();

      drawOverlays(ctx, width, height);
  }

  function finishProcessedTrack(processedStream, videoTrack, cleanup, width, height) {
      const processedTrack = processedStream.getVideoTracks()[0];

      const originalStop = processedTrack.stop.bind(processedTrack);
      processedTrack.stop = () => { videoTrack.stop(); cleanup(); originalStop(); };

      Object.defineProperty(processedTrack, 'label', { get: () => VIRTUAL_DEVICE_LABEL });
      Object.defineProperty(processedTrack, 'deviceId', { get: () => VIRTUAL_DEVICE_ID });

      processedTrack.getSettings = () => ({
          ...videoTrack.getSettings(),
          width, height,
          deviceId: VIRTUAL_DEVICE_ID,
          groupId: VIRTUAL_GROUP_ID
      });

      return processedTrack;
  }

  // Reads raw VideoFrames straight off the track via Insertable Streams,
  // instead of through a hidden <video> element. Chrome throttles decode of
  // <video> elements once the tab is backgrounded (switching tabs during a
  // call): our draw loop kept running, but it kept re-painting the same
  // stale frame because the <video> itself had stopped updating. Frames
  // read this way aren't subject to that page-visibility throttling.
  async function processStreamViaTrackProcessor(stream, videoTrack) {
      const settings = videoTrack.getSettings();
      const width = settings.width || 1280;
      const height = settings.height || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      hiddenContainer.appendChild(canvas);

      const processor = new MediaStreamTrackProcessor({ track: videoTrack });
      const reader = processor.readable.getReader();

      let active = true;
      const autoState = { frameCount: 0, levels: { brightness: 100, contrast: 100 } };

      const processedStream = canvas.captureStream(30);

      function cleanup() { active = false; reader.cancel().catch(() => {}); canvas.remove(); }

      const processedTrack = finishProcessedTrack(processedStream, videoTrack, cleanup, width, height);

      (async function pump() {
          while (active) {
              let result;
              try {
                  result = await reader.read();
              } catch (e) {
                  break;
              }
              if (result.done) break;
              const frame = result.value;
              if (active) drawFrameToCanvas(ctx, frame, frame.displayWidth, width, height, autoState);
              frame.close();
          }
          // The reader ended on its own (source track died — unplugged,
          // permission revoked) rather than via processedTrack.stop().
          // Without this, the outgoing track never signals 'ended' and the
          // call app just freezes on the last frame instead of noticing.
          if (active) processedTrack.stop();
      })();

      stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
      return processedStream;
  }

  // Fallback for browsers without MediaStreamTrackProcessor support.
  async function processStreamViaVideoElement(stream, videoTrack) {
      const video = document.createElement('video');
      video.muted = true; video.autoplay = true; video.playsInline = true;
      video.srcObject = stream;
      hiddenContainer.appendChild(video);

      await new Promise(r => {
          if (video.readyState >= 2) r();
          else video.onloadedmetadata = () => r();
          setTimeout(r, 1500);
      });
      try { await video.play(); } catch(e) {}

      const canvas = document.createElement('canvas');
      const settings = videoTrack.getSettings();
      const width = settings.width || video.videoWidth || 1280;
      const height = settings.height || video.videoHeight || 720;
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      hiddenContainer.appendChild(canvas);

      let active = true;
      let timerId;
      const autoState = { frameCount: 0, levels: { brightness: 100, contrast: 100 } };

      const processedStream = canvas.captureStream(30);

      function cleanup() { active = false; clearInterval(timerId); video.srcObject = null; video.remove(); canvas.remove(); }

      const processedTrack = finishProcessedTrack(processedStream, videoTrack, cleanup, width, height);

      function draw() {
          if (!active) return;
          // Source track died (unplugged, permission revoked) — stop the
          // outgoing track too, so the call app sees it end instead of
          // freezing on the last frame forever.
          if (videoTrack.readyState === 'ended') { processedTrack.stop(); return; }
          drawFrameToCanvas(ctx, video, video.videoWidth, width, height, autoState);
      }
      draw();
      // setInterval, not requestAnimationFrame: rAF is fully suspended once
      // the tab is hidden/backgrounded, which froze the outgoing frame the
      // moment a user switched away from the call tab.
      timerId = setInterval(draw, 1000 / 30);

      stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
      return processedStream;
  }

  async function processStream(stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return createSyntheticStream();

      if (typeof MediaStreamTrackProcessor !== 'undefined') {
          return processStreamViaTrackProcessor(stream, videoTrack);
      }
      return processStreamViaVideoElement(stream, videoTrack);
  }

  if (navigator.mediaDevices) {
      const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = async function() {
          const devices = await origEnumerate();
          const virtualDevice = {
              deviceId: VIRTUAL_DEVICE_ID,
              kind: 'videoinput',
              label: VIRTUAL_DEVICE_LABEL,
              groupId: VIRTUAL_GROUP_ID
          };
          return [...devices, virtualDevice];
      };

      // deviceId constraints aren't always a bare string or {exact:id} —
      // apps also send {ideal:id}, or wrap either in an array per the
      // ConstrainDOMString spec. Missing those meant sites using those forms
      // fell through to the real camera, unprocessed, even after the user
      // explicitly picked "Nori V Cam".
      function matchesVirtualDevice(dId) {
          if (!dId) return false;
          if (typeof dId === 'string') return dId === VIRTUAL_DEVICE_ID;
          if (Array.isArray(dId)) return dId.includes(VIRTUAL_DEVICE_ID);
          if (typeof dId === 'object') {
              return matchesVirtualDevice(dId.exact) || matchesVirtualDevice(dId.ideal);
          }
          return false;
      }

      const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async function(constraints) {
          if (!constraints || !constraints.video) return origGUM(constraints);

          const requestedVirtual = typeof constraints.video === 'object' &&
              matchesVirtualDevice(constraints.video.deviceId);

          if (requestedVirtual) {
              const realConstraints = { 
                  audio: constraints.audio, 
                  video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
              };
              
              try {
                  const realStream = await origGUM(realConstraints);
                  return await processStream(realStream);
              } catch (e) {
                  return createSyntheticStream();
              }
          } else {
              return origGUM(constraints);
          }
      };
  }
})();
