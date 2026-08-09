(function () {
  var saved = localStorage.getItem("nori-theme");
  var theme = saved || "dark";
  document.documentElement.setAttribute("data-theme", theme);
})();
