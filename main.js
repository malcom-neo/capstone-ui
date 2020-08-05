"use strict";

(function () {
  // Modify this to change where we connect to
  // TODO: Make it possible to change and specify the address.
  const ws_spec = "ws://10.21.130.23:9090";

  /**
   * Write grayscale value into RGBA-bitmap data array.
   * @param {Uint8ClampedArray} data ImageData array.
   * @param {Number} i Pixel index (row major).
   * @param {Number} val The value to write (in interval [0, 255]).
   */
  function writeGrayscaleInBitmap(data, i, val) {
    data[4 * i] = val;
    data[4 * i + 1] = val;
    data[4 * i + 2] = val;
    data[4 * i + 3] = 255;
  }

  /**
   * Find bounding box of interesting pixels in a bitmap array.
   * @param {Uint8ClampedArray} data ImageData array.
   * @param {Function} pred Called on each pixel, input: [R,G,B,A], output: true if pixel is counted in bounding box.
   * @param {Number} height Height of image.
   * @param {Number} width Width of image.
   * @returns [min_x, min_y, max_x, max_y] corners of bounding box.
   */
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

  /**
   * Update a list item in the reading pane.
   * @param {String} name The name prefix of the list item in the reading pane
   * @param {String} value The text to replace inside the list item.
   * @param {String} style One of "success", "warning", "danger"
   */
  function updateReadingRow(name, value, style) {
    if (!reading_valid_styles.includes(style)) {
      console.error(`Invalid style: ${style}`);
      return;
    }
    const container = document.getElementById(`${name}-reading-container`);
    const display_text = document.getElementById(`${name}-reading`);

    display_text.innerHTML = value;
    container.classList.remove(...reading_valid_classes);
    container.classList.add(`list-group-item-${style}`);
  }

  /**
   * Update a list item in the reading pane based on ROS messages. The normalizer is called first followed by the formatter. So, you can save stuff in the message object from the normalizer for the formatter to use later.
   * @param {ROSLIB.Topic} topic The ROS message topic.
   * @param {String} name The name prefix of the list item in the reading pane
   * @param {Function} normalizer Called to translate the message to a number, which decides the colour of the list item. Normalized value >100: red, <0: green, >=0 and <=100: yellow
   * @param {Function} formatter Called to format the message for display. Returned value will replace the list item value.
   */
  function attachReadingUpdater(topic, name, normalizer, formatter) {
    topic.subscribe(function (msg) {
      console.log(`Message received on ${topic.name} for prefix ${name}`);
      const reading = normalizer(msg);
      let style;
      if (typeof reading !== "number" || isNaN(reading) || reading > 100) {
        style = "danger";
      } else if (reading < 0) {
        style = "success";
      } else {
        style = "warning";
      }

      updateReadingRow(name, formatter(msg), style);
    });
  }

  /**
   * Change the progress bar value in the reading pane.
   * @param {Number} progress Between 0 and 100.
   */
  function changeProgressBar(progress) {
    const pbar = document.querySelector("#progress-container .progress-bar");
    let new_width = "0%";
    if (typeof progress === "number" && progress >= 0 && progress <= 100) {
      new_width = `${progress}%`;
    }
    pbar.style.width = new_width;
    pbar.innerHTML = new_width;
  }

  /**
   * Move the red pointer on top of the map canvas.
   * @param {Number} x
   * @param {Number} y
   * @param {Number} deg
   */
  function moveMapPointer(x, y, deg) {
    document.getElementById(
      "progress-map-pointer"
    ).style.transform = `translate(${x}px,${y}px) rotate(${deg}deg)`;
  }

  /**
   * Move the red pointer on top of the map canvas.
   * @param {*} wpct
   * @param {*} hpct
   * @param {*} deg
   */
  function moveMapPointerFractional(wpct, hpct, deg) {
    if (typeof wpct !== "number" || wpct > 1 || wpct < 0) {
      console.error(`wpct not fractional: ${wpct}`);
      return;
    }

    if (typeof hpct !== "number" || hpct > 1 || hpct < 0) {
      console.error(`hpct not fractional: ${hpct}`);
      return;
    }

    const container = document.getElementById("progress-map");
    const pointer = document.getElementById("progress-map-pointer");
    const wmax = container.clientWidth - pointer.width;
    const hmax = container.clientHeight - pointer.height;

    pointer.style.transform = `translate(${wpct * wmax}px, ${
      hpct * hmax
    }px) rotate(${deg}deg)`;
  }

  /*******************************************************
   * Roslibjs-related stuff.
   * Connect to websocket and subscribe to messages here.
   *******************************************************/

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

    const rosmap_width = msg.info.width;
    const rosmap_height = msg.info.height;

    // Very slow
    // document.getElementById("rosmap-area").textContent = JSON.stringify(msg);

    const canvas = document.getElementById("progress-map-canvas");
    const ctx = canvas.getContext("2d");
    const img_data = ctx.createImageData(rosmap_width, rosmap_height);

    if (img_data.data.length < msg.data.length) {
      console.warn("Array length mismatch");
    }
    if (img_data.data.length > msg.data.length) {
      console.warn("Array length mismatch (bad)");
    }

    for (let i = 0; i < img_data.data.length; i++) {
      if (msg.data[i] > -1 && msg.data[i] < 100) {
        writeGrayscaleInBitmap(img_data.data, i, 255);
      } else {
        writeGrayscaleInBitmap(img_data.data, i, 0);
      }
    }

    // Find bounding box of nonblack pixels
    const [min_x, min_y, max_x, max_y] = findBoundingBox(
      img_data.data,
      (px) => px[0] >= 255,
      img_data.height,
      img_data.width
    );

    const bound_width = max_x - min_x;
    const bound_height = max_y - min_y;

    const resize_cb = function () {
      if (canvas.currentBitmap !== undefined) {
        canvas.currentBitmap.close();
        delete canvas.currentBitmap;
      }

      // This works on chrome but not firefox?
      createImageBitmap(img_data, min_x, min_y, bound_width, bound_height, {
        resizeWidth: canvas.width,
        resizeHeight: canvas.height,
        resizeQuality: "pixelated",
      }).then(function (bmp) {
        // Attach this bitmap to the canvas element
        canvas.currentBitmap = bmp;
        ctx.drawImage(bmp, 0, 0);
      });
    };

    resize_cb();
    window.resizeCanvasBitmap = resize_cb;
  });

  /* Skeleton for progress bar update
  const listener_progress = new ROSLIB.Topic({
    ros: ros,
    name: '',
    messageType: ''
  });

  listener_progress.subscribe((msg) => {
    console.log('Received message on ' + listener_progress.name);
    
    changeProgressBar(?);
  });
  */

  /*
  const listener_position = new ROSLIB.Topic({
    ros: ros,
    name: '',
    messageType: ''
  });

  listener_position.subscribe(function(msg){
    
  });
  */

  const listener_vel = new ROSLIB.Topic({
    ros: ros,
    name: "/cmd_vel",
    messageType: "geometry_msgs/Twist",
  });

  attachReadingUpdater(
    listener_vel,
    "linear-speed",
    (msg) => {
      // We can save stuff in the msg object for the formatter to use later
      msg.linear_norm = Math.sqrt(
        msg.linear.x ** 2 + msg.linear.y ** 2 + msg.linear.z ** 2
      );
      return -1;
    },
    (msg) => `${msg.linear_norm.toFixed(2)} m/s`
  );

  attachReadingUpdater(
    listener_vel,
    "angular-speed",
    (msg) => {
      msg.ang_norm = Math.sqrt(
        msg.angular.x ** 2 + msg.angular.y ** 2 + msg.angular.z ** 2
      );
      return -1;
    },
    (msg) => `${msg.ang_norm.toFixed(2)} rad/s`
  );

  window.addEventListener("DOMContentLoaded", function () {
    // E-stop button handler
    document.getElementById("modal-stop-confirm").onclick = function (e) {
      console.warn("Stub: Emergency stop");
      const modal = document.getElementById("modal-stop");
      bootstrap.Modal.getInstance(modal).hide();
    };

    // Hide stuff we're not using...
    document.getElementById("control-top").style.display = "none";
    document.getElementById("video-top").style.display = "none";

    // First run canvas resize
    resizeMapCanvas();
  });

  function resizeMapCanvas() {
    // Get enclosing element
    const container = document.getElementById("progress-map");
    const canvas = document.getElementById("progress-map-canvas");

    // TODO this doesn't work quite like I thought it would
    const side = Math.max(container.clientHeight, container.clientWidth);
    canvas.width = side;
    canvas.height = side;
    console.log(`Size: ${side}`);

    // If we have something in the canvas, redraw it
    if (typeof window.resizeCanvasBitmap === "function") {
      console.log("Resizing canvas bitmap...");
      window.resizeCanvasBitmap();
    } else {
      //
    }
  }

  window.addEventListener("resize", resizeMapCanvas);
  window.moveMapPointer = moveMapPointer;
  window.moveMapPointerFractional = moveMapPointerFractional;
  window.changeProgressBar = changeProgressBar;
})();
