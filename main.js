"use strict";

(function () {
  function writeInCanvas(data, i, val) {
    data[4 * i] = val;
    data[4 * i + 1] = val;
    data[4 * i + 2] = val;
    data[4 * i + 3] = 255;
  }

  const ros = new ROSLIB.Ros({
    url: "ws://10.21.130.23:9090",
  });

  ros.on("connection", function () {
    console.log("Connected to websocket");
    document.getElementById("navbar-status-text").innerHTML = "Connected";
  });

  ros.on("error", function () {
    console.log("Error connecting to websocket");
  });

  ros.on("close", function () {
    console.log("Disconnected from websocket");
    document.getElementById("navbar-status-text").innerHTML = "Disconnected";
  });

  const listener_map = new ROSLIB.Topic({
    ros: ros,
    name: "/map",
    messageType: "nav_msgs/OccupancyGrid",
  });

  listener_map.subscribe(function (msg) {
    console.log("Received message on " + listener_map.name);

    const ctx = document.getElementById("map-canvas").getContext("2d");
    const img_data = ctx.getImageData(0, 0, 384, 384);
    if (img_data.data.length !== msg.data.length) {
      console.error("Array length mismatch");
    }
    for (let i = 0; i < img_data.data.length; i++) {
      if (msg.data[i] > -1 && msg.data[i] < 100) {
        writeInCanvas(img_data.data, i, 255);
      } else {
        writeInCanvas(img_data.data, i, 0);
      }
    }

    ctx.putImageData(img_data, 0, 0);
  });

  /*
const listener_progress = new ROSLIB.Topic({
  ros: ros,
  name: '',
  messageType: ''
});

listener_progress.subscribe(function(msg){
  console.log('Received message on ' + listener.name);
  
  const pbar = document.querySelector('#progress-container .progress-bar');
  const new_width = "25%"
  pbar.style.width = new_width;
  pbar.innerHTML = new_width;
});
*/

  window.addEventListener("DOMContentLoaded", function () {
    document.getElementById("modal-stop-confirm").onclick = function (e) {
      console.warn("Stub: Emergency stop");
      const modal = document.getElementById("modal-stop");
      bootstrap.Modal.getInstance(modal).hide();
    };

    // Hide stuff we're not using...
    document.getElementById("control-top").style.display = "none";
    document.getElementById("video-top").style.display = "none";
  });
})();
