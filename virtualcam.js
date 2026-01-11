document.addEventListener("DOMContentLoaded", () => {
  var maincam = document.getElementById("maincam");
  const canvas = document.getElementById("maincanwas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");

  async function startcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      // notif function assumed to be defined elsewhere in your code
      if (typeof notif === "function") notif("success", "Camera Connected");
      maincam.srcObject = stream;
      maincam.play();
    } catch (error) {
      if (typeof notif === "function") notif("alert", "Camera Access Denied");
    }
  }

  startcam();

  // Function to create the static/noise effect
  function drawStatic() {
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Generate a random grayscale value between 0 and 255
      const value = Math.random() * 255;
      data[i]     = value; // Red
      data[i + 1] = value; // Green
      data[i + 2] = value; // Blue
      data[i + 3] = 255;   // Alpha (Opaque)
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Optional: Add a "No Signal" text overlay
    ctx.fillStyle = "white";
    ctx.font = "bold 100px Arial";
    ctx.textAlign = "center";
    ctx.fillText("NO SIGNAL", width / 2, height / 2);
  }

  function drawFrame() {
    var scale = document.getElementById("scalerange").value;
    document.getElementById("rangetext").innerText = scale;
    var leftright = document.getElementById("leftrightrange").value;
    document.getElementById("leftrighttext").innerText = leftright;
    var updown = document.getElementById("updownrange").value;
    document.getElementById("updowntext").innerText = updown;

    // Check if camera is actually providing frames
    if (maincam.paused || maincam.ended || maincam.readyState < 2) {
      drawStatic();
      return;
    }

    var x = leftright;
    var y = updown;
    var x1 = maincam.videoWidth * scale;
    var y1 = maincam.videoHeight * scale;

    ctx.drawImage(maincam, x, y, x1, y1);
  }

  function animate() {
    // Clear the background
    ctx.fillStyle = "rgba(37, 37, 37, 1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawFrame();
    requestAnimationFrame(animate);
  }

  animate();
});