// background.js

// Listen for a click on the extension's browser action (the icon)
chrome.action.onClicked.addListener((tab) => {
  // The 'tab' object is automatically provided by the event listener.
  // It contains details about the tab where the icon was clicked.

  const time = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
  console.log(`Icon clicked at ${time}. Injecting script into tab: ${tab.id}`);

  // Now that we have a valid 'tab' object, this will work.
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});
