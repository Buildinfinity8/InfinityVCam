# Nori V Cam

Nori V Cam is a Chrome extension (Manifest V3) that injects a customizable virtual webcam directly into your browser's WebRTC stack. If you're on Google Meet, Zoom Web, or Microsoft Teams, it lets you tweak transforms, drop lower-thirds, slap on logos, fix washed-out webcam lighting, and even turn your monitor into an edge-lit ring light—without installing bloated desktop driver software like OBS VirtualCam or paying for subscription overlays.

---

### What it actually solves

Building a virtual camera inside a browser extension sounds straightforward until you hit the weird edge cases of modern Chromium:

* **The background-tab freeze:** Ever switch away from a video call tab to check Slack or read docs, only to have your camera freeze on a mid-sentence face? Classic Chrome behavior—it throttles `<video>` element decoding the moment a tab gets hidden. We route video through WebCodecs insertable streams (`MediaStreamTrackProcessor`) pulling raw `VideoFrame` buffers directly from the media track. If your browser doesn't support it, it falls back cleanly to an offscreen canvas pump with interval timers that ignore visibility throttling.
* **The vanishing file picker trap:** Chrome closes extension popup bubbles the exact millisecond an OS file-picker steals window focus. That meant clicking "Upload Image" killed the extension before you could pick a PNG. We worked around this by transparently spinning up an isolated popup window (`popup.html?standalone=1`) that stays alive through system dialogues.
* **Ring light without blinded navigation:** Turning your monitor into a massive fill light helps in dim rooms, but hard-coded white borders make it impossible to see your tabs or close buttons. Our ring light script tracks cursor coordinates and fades the perimeter when your mouse gets within 140px of any screen edge.
* **Zero external network requests:** All ML assets—MediaPipe's selfie segmenter, WASM binaries, and TFLite models—are packaged locally in `files/vendor/mediapipe/`. No external CDN calls, no tracking, and no broken feeds behind corporate VPN firewalls.

---

### What's inside

#### Framing & Canvas Transforms
Everything runs through an offscreen 2D canvas pipeline before reaching the outgoing stream:
- **Zoom & Pan:** 0.2x to 3.0x scaling with sub-pixel X/Y panning. Tight crop when your lens is too wide; pulled back when you need breathing room.
- **Rotation:** -180° to +180° rotation. Fixes sideways capture cards or crooked monitor mounts instantly.
- **Flips:** Mirror horizontal or vertical independently.
- **Composition Grid:** A rule-of-thirds 3x3 overlay in the preview box. It stays strictly inside your preview window—never leaked to the outgoing meeting stream.

#### Lighting, Color & Filters
Bad webcam sensors murder contrast. Instead of messing with OS camera utilities:
- **Auto Fix Lighting:** Every 15 frames, a tiny 48x27 analysis canvas samples scene luminance, computes average luma and dynamic range, and balances your brightness and contrast on the fly.
- **Manual Adjustments:** Sliders for brightness (50–150%), contrast (50–150%), and saturation (0–200%).
- **Color Grading Presets:** Quick-pick grades—Normal, Fix Tint, Warm, Cool, Vivid, Fade, Vintage, Mono, Noir, Cinematic, and Chrome. Swatches show tiny live-rendered cuts of your actual camera feed so you don't have to guess how a filter will look on your skin tone.

#### Screen Ring Light
Don't have a desk lamp? Toggle the Ring Light tab. It injects a pure DOM overlay into whatever page you're viewing:
- **Styles:** Choose between a diffused gradient vignette (smooth fill) or a solid perimeter border.
- **Color Temperatures:** Tuned presets matching real lighting setups—Studio Daylight (5600K), Warm Daylight (5000K), Neutral Studio (4500K), Soft Tungsten (3200K), Golden Amber (2700K), Warm Sunset, Slate Ambient, and Deep Charcoal, plus a raw hex picker.
- **Smart Edge Fade:** Moves out of your way automatically as your cursor nears browser controls.

#### Text & Graphic Overlays
- **Text Layers:** Drop multiple text cards for your name, Twitter handle, role, or stream title. Adjust font size (10–200px), drop shadows, coordinates, and custom colors. Crucially, text layers have independent flip switches—if you mirror your camera so you feel natural, your name doesn't show up backwards.
- **Image Layers:** Upload transparent PNGs, badges, or brand marks. Resize, rotate, dial in opacity, and drag them anywhere on screen.

---

### Installation

#### From Chrome Web Store
Grab the packaged release on the [Chrome Web Store](https://chromewebstore.google.com/detail/infinityvcam/kckmcaholkgphbbjcijcghjgciagndab).

#### Loading Unpacked (Local Dev)
1. Clone the repo:
   ```bash
   git clone https://github.com/omnori/NoriVCam.git
   ```
2. Open Chrome and head to `chrome://extensions/`.
3. Flip on **Developer mode** (top right switch).
4. Hit **Load unpacked** and select this directory.
5. Pin Nori V Cam to your toolbar.

---

### Using it in calls

1. Click the extension icon. Pick your real webcam from the dropdown to start the preview.
2. Dial in your zoom, drop on your name or logo, or flip on Auto Fix Lighting.
3. In Google Meet, Zoom, or Teams, jump into **Settings > Video** and choose **Nori V Cam** as your camera.
4. Keep the popout window open beside your call if you want to toggle layers or adjust lighting on the fly.

> Tip: If a meeting page was already open before you installed the extension, give the tab a quick refresh so the injected media device shims can initialize.

---

### How it works under the hood

```
Page Context (Main World)            Isolated World                Extension
┌─────────────────────────┐          ┌──────────────┐          ┌───────────────────┐
│ Google Meet / Zoom      │          │ content.js   │          │ popup.html        │
│ navigator.mediaDevices  │ ◄──────► │ Message      │ ◄──────► │ virtualcam.js     │
│ .getUserMedia() hook    │          │ Bridge       │          │ UI Controls       │
└───────────┬─────────────┘          └──────────────┘          └─────────┬─────────┘
            │                                                            │
    inject.js: TrackProcessor                                    chrome.storage.local
    or Offscreen Canvas                                                  │
            │                                                            ▼
            ▼                                                  ┌───────────────────┐
┌─────────────────────────┐                                    │ ringlight.js      │
│ Frame Compositing       │                                    │ Viewport DOM Glow │
│ Pan / Zoom / Filters    │                                    └───────────────────┘
│ Overlays & MediaPipe ML │
└─────────────────────────┘
```

The extension operates across two execution contexts:

1. **Main World (`files/scripts/inject.js`)**: Runs directly in the web page's JavaScript context. It shims `navigator.mediaDevices.enumerateDevices` to append "Nori V Cam" and wraps `getUserMedia`. When a web app asks for our virtual device ID—handling string IDs, `{exact: ...}`, `{ideal: ...}`, or array constraints—we intercept the hardware stream, process each frame through offscreen canvases, and return a processed stream that looks identical to a native hardware track.
2. **Isolated World (`files/scripts/content.js` & `ringlight.js`)**: Bridges configuration from `chrome.storage.local` to the page using `window.postMessage`. The ring light runs here independently, modifying viewport styles without interfering with the web application's own scripts.

---

### File Structure

```
.
├── manifest.json              # MV3 configuration, permissions, content script rules
├── popup.html                 # Control panel interface
├── README.md
├── files/
│   ├── style.css              # Custom design system and glassmorphic panels
│   ├── script.js              # Theme switcher, popout management, notifications
│   ├── virtualcam.js          # Canvas rendering pipeline, overlays, and config sync
│   ├── images/                # App icons and SVG indicators
│   ├── scripts/
│   │   ├── background.js      # Background service worker with default schema seeding
│   │   ├── content.js         # Isolated-world storage bridge
│   │   ├── inject.js          # Main-world virtual camera driver & frame processor
│   │   ├── ringlight.js       # Viewport border glow with cursor-proximity detection
│   │   ├── bgblur.js          # MediaPipe selfie segmenter wrapper & canvas compositor
│   │   └── theme-init.js      # Synchronous early theme hydration (stops dark-mode flash)
│   └── vendor/
│       └── mediapipe/         # Offline WebAssembly binaries and TFLite vision models
└── release/                   # Packaged production archives
```

---

### Omnori

We build small, sharp, open-source productivity utilities. Tools that solve everyday friction without charging subscriptions or locking down your workflow.

* Lab: [github.com/omnori](https://github.com/omnori)
* Chat: [Discord Community](https://discord.gg/5ag9gjsDde)
* Socials: [@omnori.tech](https://www.instagram.com/omnori.tech)
