// content.js - Runs in Isolated World
// Bridge between Page (Main World) and Extension (Storage/Background)

// 1. Listen for messages from Injected Script
window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data.type && event.data.type === "INFINITY_VCAM_GET_CONFIG") {
        chrome.storage.local.get(['config'], (result) => {
            const config = result.config || {};
            window.postMessage({
                type: "INFINITY_VCAM_CONFIG",
                payload: config
            }, "*");
        });
    }
});

// 2. Listen for Storage Changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.config) {
        window.postMessage({
            type: "INFINITY_VCAM_CONFIG",
            payload: changes.config.newValue
        }, "*");
    }
});

// 3. Initial Push
chrome.storage.local.get(['config'], (result) => {
    if (result.config) {
        setTimeout(() => {
            window.postMessage({
                type: "INFINITY_VCAM_CONFIG",
                payload: result.config
            }, "*");
        }, 100);
    }
});
