document.getElementById("share").addEventListener("click", function () {
  notif("success", "share button clicked");
});
document.getElementById("popout").addEventListener("click", function () {
  window.open("#", "_blank", "width=482,height=700");
});

var notifs = [];
function everysecond() {
  var newdate = new Date();
  var ts = newdate.getTime();
  for (let index = 0; index < notifs.length; index++) {
    notif("success", ts - notifs[index][2]);
    if (ts - notifs[index][2] > 10) {
      notifs.pop(i);
      index--;
    }
  }
  var ns = "";
  notifs.forEach((elem) => {
    ns += `<div class="notifications" style="background-color: ${elem[3]}">
        <img src="images/${elem[0]}.png" alt="${elem[0]}" height="10" />
        <span style="display : none;" id="ts">${elem[2]}</span>
        <span>${elem[1]}</span>
        <img
          src="images/close.png"
          alt="close"
          class="noti-action"
          height="10"
        />
      </div>`;
    notifcont.innerHTML = ns;
  });
}
setTimeout(everysecond, 1);
function notif(type, text) {
  var newdate = new Date();
  var ts = newdate.getTime();

  var notifcont = document.getElementById("notification");
  var color = "";
  if (type == "alert") {
    color = "rgb(255, 145, 145)";
  } else if (type == "success") {
    color = "rgb(145, 255, 145)";
  }
  notifs.push([type, text, ts, color]);
  var ns = "";
  notifs.forEach((elem) => {
    ns += `<div class="notifications" style="background-color: ${elem[3]}">
        <img src="images/${elem[0]}.png" alt="${elem[0]}" height="10" />
        <span style="display : none;" id="ts">${elem[2]}</span>
        <span>${elem[1]}</span>
        <img
          src="images/close.png"
          alt="close"
          class="noti-action"
          height="10"
        />
      </div>`;
    notifcont.innerHTML = ns;
  });
}
