(function() {
  if (window.InfinityVCamInjected) return;
  window.InfinityVCamInjected = true;

  console.log("InfinityVCam: Virtual Device Mode Active v1.2.2");

  const VIRTUAL_DEVICE_ID = "infinity-8-virtual-cam-id";
  const VIRTUAL_DEVICE_LABEL = "Virtual Camera";
  const VIRTUAL_GROUP_ID = "infinity-virtual-group";

  let state = { 
      scale: 1.2, panX: 0, panY: 0, flipH: false, flipV: false,
      texts: [], images: [] 
  };
  
  const loadedImages = {};

  window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === "INFINITY_VCAM_CONFIG") {
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
  window.postMessage({ type: "INFINITY_VCAM_GET_CONFIG" }, "*");

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
          requestAnimationFrame(draw);
      }
      draw();

      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0];
      const origStop = track.stop.bind(track);
      track.stop = () => { active = false; canvas.remove(); origStop(); };
      
      Object.defineProperty(track, 'label', { get: () => VIRTUAL_DEVICE_LABEL });
      Object.defineProperty(track, 'deviceId', { get: () => VIRTUAL_DEVICE_ID });
      track.getSettings = () => ({ width: 1280, height: 720, deviceId: VIRTUAL_DEVICE_ID, groupId: VIRTUAL_GROUP_ID, frameRate: 30 });
      return stream;
  }

  async function processStream(stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return createSyntheticStream();

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
      function draw() {
          if (!active) return;
          if (videoTrack.readyState === 'ended') { cleanup(); return; }
          
          // Match #000 background for video
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
          ctx.save();
          
          if (state.flipH) { ctx.translate(width, 0); ctx.scale(-1, 1); }
          if (state.flipV) { ctx.translate(0, height); ctx.scale(1, -1); }
          
          const sw = width * state.scale; const sh = height * state.scale;
          const x = (width/2) - (sw/2) + parseFloat(state.panX);
          const y = (height/2) - (sh/2) + parseFloat(state.panY);
          
          ctx.drawImage(video, x, y, sw, sh);
          ctx.restore();

          drawOverlays(ctx, width, height);
          requestAnimationFrame(draw);
      }
      draw();

      const processedStream = canvas.captureStream(30);
      const processedTrack = processedStream.getVideoTracks()[0];

      function cleanup() { active = false; video.srcObject = null; video.remove(); canvas.remove(); }

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

      stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
      return processedStream;
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

      const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async function(constraints) {
          if (!constraints || !constraints.video) return origGUM(constraints);

          let requestedVirtual = false;
          if (typeof constraints.video === 'object') {
              const dId = constraints.video.deviceId;
              if (dId === VIRTUAL_DEVICE_ID || (dId && dId.exact === VIRTUAL_DEVICE_ID)) {
                  requestedVirtual = true;
              }
          }

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
