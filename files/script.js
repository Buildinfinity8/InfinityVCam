// UI Helper Script

// Theme toggle (light/dark). Initial theme is set synchronously in
// popup.html's <head> via localStorage to avoid a flash on open.
document.getElementById("themeToggle").addEventListener("click", function () {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("nori-theme", next);
});

document.getElementById("share").addEventListener("click", function () {
  notif("success", "Link copied to clipboard!");
});

document.getElementById("popout").addEventListener("click", function () {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 482,
    height: 700
  });
});

var notifs = [];
const notifcont = document.getElementById("notification");

function updateNotifsUI() {
  var ns = "";
  notifs.forEach((elem) => {
    ns += `<div class="notifications" style="background-color: ${elem.color}">
        <img src="files/images/${elem.type}.png" alt="${elem.type}" height="10" />
        <span>${elem.text}</span>
      </div>`;
  });
  notifcont.innerHTML = ns;
}

function notif(type, text) {
  var color = type === "alert" ? "rgb(255, 145, 145)" : "rgb(145, 255, 145)";
  var id = Date.now();
  
  notifs.push({ id, type, text, color });
  updateNotifsUI();

  setTimeout(() => {
    notifs = notifs.filter(n => n.id !== id);
    updateNotifsUI();
  }, 3000);
}
