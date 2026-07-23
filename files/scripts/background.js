// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("Nori V Cam: Extension installed.");
  chrome.storage.local.get(['config'], (result) => {
      if (!result.config) {
          chrome.storage.local.set({
              config: {
                  scale: 1.2,
                  panX: 0,
                  panY: 0,
                  rotation: 0,
                  flipH: false,
                  flipV: false,
                  texts: [],
                  images: []
              }
          });
      }
  });
});