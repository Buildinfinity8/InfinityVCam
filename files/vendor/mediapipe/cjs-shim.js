// Lets vision_bundle.cjs (a plain Node-style CommonJS bundle) run as a
// classic <script> tag: it assigns to a bare `exports` identifier at its
// top level, which only resolves if something already declared it as a
// global before the bundle runs.
window.__noriVisionExports = window.__noriVisionExports || {};
var exports = window.__noriVisionExports;
