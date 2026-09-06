// Background Blur (ML fallback)
//
// The native `backgroundBlur` getUserMedia constraint (handled entirely by
// inject.js before a stream ever reaches here) covers platforms where the OS
// or browser can blur the feed itself for free. Everywhere else, this module
// runs a MediaPipe Selfie Segmenter locally (bundled with the extension, no
// network fetch at runtime) to separate the person from the background, then
// composites a blurred backdrop behind a sharp foreground cutout.
//
// Loaded as a plain classic script (not a module) into the same MAIN-world
// context as inject.js / script.js, both of which call window.NoriBgBlur.
(function () {
  const VENDOR_BASE = "files/vendor/mediapipe/";
  const MODEL_PATH = VENDOR_BASE + "selfie_segmenter.tflite";
  const WASM_LOADER_PATH = VENDOR_BASE + "wasm/vision_wasm_internal.js";
  const WASM_BINARY_PATH = VENDOR_BASE + "wasm/vision_wasm_internal.wasm";

  // Re-segmenting every render frame is unnecessary and expensive; the mask
  // is reused for the frames in between (same idea as the existing
  // computeAutoLevels throttling in script.js/inject.js).
  const SEGMENT_EVERY_N_FRAMES = 3;

  let libLoadPromise = null;
  let segmenter = null;
  let segmenterFailed = false;

  function injectScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL(url);
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error("Failed to load " + url)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // The CJS bundle references a bare `exports` identifier; cjs-shim.js
  // predeclares it as a global before the bundle runs, both injected as real
  // <script src> tags so they load as extension resources (exempt from the
  // host page's CSP) rather than via eval/dynamic import (which isn't).
  async function loadVisionLib() {
    if (window.__noriVisionExports && window.__noriVisionExports.ImageSegmenter) {
      return window.__noriVisionExports;
    }
    if (!libLoadPromise) {
      libLoadPromise = (async () => {
        await injectScript(VENDOR_BASE + "cjs-shim.js");
        await injectScript(VENDOR_BASE + "vision_bundle.cjs");
        if (!window.__noriVisionExports || !window.__noriVisionExports.ImageSegmenter) {
          throw new Error("MediaPipe vision bundle did not initialize");
        }
        return window.__noriVisionExports;
      })();
    }
    return libLoadPromise;
  }

  async function ensureSegmenter() {
    if (segmenter || segmenterFailed) return segmenter;
    try {
      const vision = await loadVisionLib();
      const wasmFileset = {
        wasmLoaderPath: chrome.runtime.getURL(WASM_LOADER_PATH),
        wasmBinaryPath: chrome.runtime.getURL(WASM_BINARY_PATH)
      };
      const baseOptions = {
        modelAssetPath: chrome.runtime.getURL(MODEL_PATH),
        delegate: "GPU"
      };
      const options = {
        baseOptions,
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false
      };
      try {
        segmenter = await vision.ImageSegmenter.createFromOptions(wasmFileset, options);
      } catch (gpuErr) {
        // GPU delegate isn't available on every machine/driver combo.
        options.baseOptions = { ...baseOptions, delegate: "CPU" };
        segmenter = await vision.ImageSegmenter.createFromOptions(wasmFileset, options);
      }
    } catch (e) {
      console.warn("Nori V Cam: background blur model failed to load, disabling", e);
      segmenterFailed = true;
      segmenter = null;
    }
    return segmenter;
  }

  // If a very implausible share of the frame keeps coming back as "person"
  // (near-0% or near-100%) for several segmentations in a row, the model
  // isn't giving us anything usable — stop trying rather than keep drawing
  // a broken effect (e.g. blurring the person instead of the background).
  const MIN_PLAUSIBLE_PERSON_FRACTION = 0.005;
  const MAX_PLAUSIBLE_PERSON_FRACTION = 0.95;
  const DISABLE_AFTER_BAD_FRAMES = 8;

  // Per-instance state so a popup preview and an active call in the page can
  // each run their own independent pipeline without stepping on each other.
  function createSession() {
    return {
      sharpMaskSmall: null, smallCtx: null, // model-resolution mask canvas
      maskCanvas: null, maskCtx: null,      // full-res, feathered alpha mask
      personCanvas: null, personCtx: null,  // sharp foreground cutout scratch
      frameCount: 0,
      maskReady: false,
      consecutiveBadFrames: 0,
      disabled: false,
      width: 0,
      height: 0
    };
  }

  function ensureSized(session, width, height) {
    if (session.width === width && session.height === height && session.maskCanvas) return;
    session.width = width;
    session.height = height;

    session.maskCanvas = document.createElement("canvas");
    session.maskCanvas.width = width;
    session.maskCanvas.height = height;
    session.maskCtx = session.maskCanvas.getContext("2d");

    session.personCanvas = document.createElement("canvas");
    session.personCanvas.width = width;
    session.personCanvas.height = height;
    session.personCtx = session.personCanvas.getContext("2d");

    session.maskReady = false;
  }

  function updateMask(session, sharpCanvas, width, height) {
    const result = segmenter.segmentForVideo(sharpCanvas, performance.now());
    const mask = result && result.categoryMask;
    if (!mask) return;

    const mw = mask.width, mh = mask.height;
    const data = mask.getAsUint8Array();

    // The model is a binary segmenter, but which category id means "person"
    // vs. "background" isn't reliably knowable up front — trusting the
    // documented convention has produced the person getting blurred instead
    // of the background on some machines. Instead, assume the minority
    // category is the person: in ordinary webcam framing the background
    // covers more of the frame than the person does.
    let onesCount = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === 1) onesCount++;
    const oneIsPerson = onesCount <= data.length / 2;
    const personFraction = (oneIsPerson ? onesCount : data.length - onesCount) / data.length;

    if (personFraction < MIN_PLAUSIBLE_PERSON_FRACTION || personFraction > MAX_PLAUSIBLE_PERSON_FRACTION) {
      // Nothing plausible to cut out this frame (no one in view, or the
      // model is producing noise) — leave the last good mask (if any) in
      // place rather than composite garbage.
      session.consecutiveBadFrames++;
      if (session.consecutiveBadFrames >= DISABLE_AFTER_BAD_FRAMES) session.disabled = true;
      mask.close();
      if (result.close) result.close();
      return;
    }
    session.consecutiveBadFrames = 0;

    if (!session.sharpMaskSmall || session.sharpMaskSmall.width !== mw || session.sharpMaskSmall.height !== mh) {
      session.sharpMaskSmall = document.createElement("canvas");
      session.sharpMaskSmall.width = mw;
      session.sharpMaskSmall.height = mh;
      session.smallCtx = session.sharpMaskSmall.getContext("2d");
    }

    const imageData = session.smallCtx.createImageData(mw, mh);
    for (let i = 0; i < data.length; i++) {
      const isPerson = oneIsPerson ? data[i] === 1 : data[i] === 0;
      const o = i * 4;
      imageData.data[o] = 255;
      imageData.data[o + 1] = 255;
      imageData.data[o + 2] = 255;
      imageData.data[o + 3] = isPerson ? 255 : 0;
    }
    session.smallCtx.putImageData(imageData, 0, 0);

    mask.close();
    if (result.close) result.close();

    // Upscaling to full resolution (bilinear, via drawImage) plus a blur
    // pass softens the model's blocky edges into a natural-looking feather.
    session.maskCtx.clearRect(0, 0, width, height);
    session.maskCtx.filter = "blur(4px)";
    session.maskCtx.drawImage(session.sharpMaskSmall, 0, 0, width, height);
    session.maskCtx.filter = "none";
    session.maskReady = true;
  }

  const sessions = new WeakMap();

  function getSession(key) {
    let session = sessions.get(key);
    if (!session) {
      session = createSession();
      sessions.set(key, session);
    }
    return session;
  }

  // Draws `sharpCanvas` (the already fully composed — rotated/flipped/
  // filtered/panned — camera frame, before overlays) into `ctx` with the
  // background blurred out. Falls back to a plain draw if the model isn't
  // enabled, hasn't loaded yet, or failed to load.
  //
  // `sessionKey` scopes the per-instance canvases/frame-counter (pass the
  // owning ctx or canvas so a popup preview and a live call don't share
  // state); `strengthPercent` is 0-100.
  function composite(ctx, sharpCanvas, width, height, strengthPercent, sessionKey) {
    if (!segmenter) {
      ensureSegmenter();
      ctx.drawImage(sharpCanvas, 0, 0, width, height);
      return;
    }

    const session = getSession(sessionKey || ctx);
    ensureSized(session, width, height);

    if (session.disabled) {
      ctx.drawImage(sharpCanvas, 0, 0, width, height);
      return;
    }

    session.frameCount++;
    if (session.frameCount % SEGMENT_EVERY_N_FRAMES === 0) {
      try {
        updateMask(session, sharpCanvas, width, height);
      } catch (e) {
        console.warn("Nori V Cam: segmentation frame failed", e);
        session.consecutiveBadFrames++;
        if (session.consecutiveBadFrames >= DISABLE_AFTER_BAD_FRAMES) session.disabled = true;
      }
    }

    if (!session.maskReady || session.disabled) {
      ctx.drawImage(sharpCanvas, 0, 0, width, height);
      return;
    }

    const blurPx = Math.max(1, (strengthPercent / 100) * 28 * (width / 1280));

    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(sharpCanvas, 0, 0, width, height);
    ctx.filter = "none";
    ctx.restore();

    session.personCtx.clearRect(0, 0, width, height);
    session.personCtx.drawImage(sharpCanvas, 0, 0, width, height);
    session.personCtx.globalCompositeOperation = "destination-in";
    session.personCtx.drawImage(session.maskCanvas, 0, 0, width, height);
    session.personCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(session.personCanvas, 0, 0, width, height);
  }

  function supportsNativeBlur() {
    try {
      return !!(navigator.mediaDevices &&
          navigator.mediaDevices.getSupportedConstraints &&
          navigator.mediaDevices.getSupportedConstraints().backgroundBlur);
    } catch (e) {
      return false;
    }
  }

  window.NoriBgBlur = {
    supportsNativeBlur,
    ensureSegmenter,
    composite
  };
})();
