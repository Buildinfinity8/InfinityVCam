// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("InfinityVCam: Extension installed.");
  chrome.storage.local.get(['config'], (result) => {
      if (!result.config) {
          chrome.storage.local.set({
              config: {
                  scale: 1.2,
                  panX: 0,
                  panY: 0,
                  flipH: false,
                  flipV: false,
                  texts: [],
                  images: []
              }
          });
      }
  });
});