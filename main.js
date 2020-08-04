"use strict";

(function () {
  // Modify this to change where we connect to
  const ws_spec = "ws://10.21.130.23:9090";

  function writeInCanvas(data, i, val) {
    data[4 * i] = val;
    data[4 * i + 1] = val;
    data[4 * i + 2] = val;
    data[4 * i + 3] = 255;
  }

  function findBoundingBox(data, pred, height, width) {
    let min_x = width;
    let min_y = height;
    let max_x = 0;
    let max_y = 0;

    for (let i = 0; i < data.length / 4; i++) {
      const pixeldata = data.slice(i * 4, (i + 1) * 4);
      if (pred(pixeldata)) {
        const this_x = i % width;
        const this_y = Math.trunc(i / width);

        if (this_x < min_x) {
          min_x = this_x;
        }
        if (this_x > max_x) {
          max_x = this_x;
        }
        if (this_y < min_y) {
          min_y = this_y;
        }
        if (this_y > max_y) {
          max_y = this_y;
        }
      }
    }

    return [min_x, min_y, max_x, max_y];
  }

  const reading_valid_styles = ["success", "warning", "danger"];
  const reading_valid_classes = reading_valid_styles.map(
    (x) => `list-group-item-${x}`
  );

  function updateReadingRow(name, value, style) {
    if (!reading_valid_styles.includes(style)) {
      console.error(`Improper style: ${style}`);
      return;
    }
    const container = document.getElementById(`${name}-reading-container`);
    const display_text = document.getElementById(`${name}-reading`);

    display_text.innerHTML = value;
    console.log(reading_valid_classes);
    container.classList.remove(...reading_valid_classes);
    container.classList.add(`list-group-item-${style}`);
  }

  function attachUpdater(topic, name, normalizer, formatter) {
    topic.subscribe(function (msg) {
      /* Here we would normalize the reading.
         Normalized value >100: red, <0: green, >=0 and <=100: yellow */
      const reading = normalizer(msg.data);
      let style;
      if (reading > 100) {
        style = "danger";
      } else if (reading < 0) {
        style = "success";
      } else {
        style = "warning";
      }

      updateReadingRow(name, formatter(msg.data), style);
    });
  }

  const ros = new ROSLIB.Ros({
    url: ws_spec,
  });

  ros.on("connection", function () {
    console.log("Connected to websocket");
    document.getElementById(
      "navbar-status-text"
    ).innerHTML = `Connected to ${ws_spec}`;
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
    const img_data = ctx.createImageData(384, 384);
    if (img_data.data.length < msg.data.length) {
      console.warn("Array length mismatch");
    }
    if (img_data.data.length > msg.data.length) {
      console.error("Array length mismatch (bad)");
    }
    for (let i = 0; i < img_data.data.length; i++) {
      if (msg.data[i] > -1 && msg.data[i] < 100) {
        writeInCanvas(img_data.data, i, 255);
      } else {
        writeInCanvas(img_data.data, i, 0);
      }
    }

    // Find bound
    const [min_x, min_y, max_x, max_y] = findBoundingBox(
      img_data.data,
      (px) => px[0] >= 255,
      384,
      384
    );

    const bound_width = max_x - min_x;
    const bound_height = max_y - min_y;

    // This works on chrome but not firefox??
    createImageBitmap(img_data, min_x, min_y, bound_width, bound_height, {
      resizeWidth: 384,
      resizeHeight: 384,
      resizeQuality: "pixelated",
    }).then(function (bmp) {
      ctx.drawImage(bmp, 0, 0);
    });

    // Redraw
    // ctx.transform(-min_x, -min_y);
    //ctx.scale(2, 2);
    // ctx.putImageData(img_data, 0, 0, min_x, min_y, bound_width, bound_height);
  });

  /* Skeleton for progress bar update
  const listener_progress = new ROSLIB.Topic({
    ros: ros,
    name: '',
    messageType: ''
  });

  listener_progress.subscribe((msg) => {
    console.log('Received message on ' + listener_progress.name);
    
    const pbar = document.querySelector('#progress-container .progress-bar');
    const new_width = "25%"
    pbar.style.width = new_width;
    pbar.innerHTML = new_width;
  });
  */

  // Skeleton for sensor update. Make copies to subscribe to more topics
  // and update more list items.
  attachUpdater(
    new ROSLIB.Topic({
      ros: ros,
      name: "",
      messageType: "",
    }),
    // Name prefix of the reading list item
    "mfl",
    // Normalizing function.
    // Normalized value >100: red, <0: green, >=0 and <=100: yellow
    (data) => parseInt(data.msg) - 100,
    // Formatting function. The return will replace the reading text.
    (data) => `${data.msg} &micro;T`
  );

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
