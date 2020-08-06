"use strict";

(function () {
  // Modify this to change where we connect to
  // TODO: Make it possible to change and specify the address.
  const ws_spec = "ws://10.21.130.23:9090";

  let map_info = {
    ros_info: null,
    bounding_box: {
      x: null,
      y: null,
      h: null,
      w: null,
    },
  };

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
      // console.log(`Message received on ${topic.name} for prefix ${name}`);
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
   * You probably don't want this.
   * @param {Number} x raw x-coordinate to translate by
   * @param {Number} y raw y-coordinate to translate by
   * @param {Number} deg degrees to rotate by
   */
  function moveMapPointer(x, y, deg) {
    document.getElementById(
      "progress-map-pointer"
    ).style.transform = `translate(${x}px,${y}px) rotate(${deg}deg)`;
  }

  /**
   * Move the red pointer on top of the map canvas. wpct and hpct must be in
   * the interval [0,1]. angle is a string and must include the units for
   * rotation.
   * @param {Number} wpct normalized position along bounding box width
   * @param {Number} hpct normalized position along bounding box height
   * @param {String} angle angle spec for rotate() transform-function
   */
  function moveMapPointerFractional(wpct, hpct, angle) {
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
    }px) rotate(${angle})`;
  }

  /**
   * Translate position object from ROS to a relative coordinate in the current
   * bounding box.
   * @param {Object} position {x,y,z} object. (Only x and y are used.)
   * @returns [normalized position along bounding box width, ...height]
   */
  function translateRosCoordToPointer(position) {
    if (map_info.ros_info === null || map_info.bounding_box.x === null) {
      console.warn("Not ready to translate ros position to pointer position");
      return [0, 0];
    }

    const x_disp = position.x - map_info.ros_info.origin.position.x;
    const y_disp = position.y - map_info.ros_info.origin.position.y;

    const x_pixdist = x_disp / map_info.ros_info.resolution;
    const y_pixdist = y_disp / map_info.ros_info.resolution;

    const x_relativetobound =
      (x_pixdist - map_info.bounding_box.x) / map_info.bounding_box.w;
    const y_relativetobound =
      (y_pixdist - map_info.bounding_box.y) / map_info.bounding_box.h;

    if (x_relativetobound < 0 || x_relativetobound > 1) {
      console.warn(`Relative x-coord ${x_relativetobound} out of bounds`);
    }

    if (y_relativetobound < 0 || y_relativetobound > 1) {
      console.warn(`Relative y-coord ${y_relativetobound} out of bounds`);
    }

    return [x_relativetobound, y_relativetobound];
  }

  let next_report_id = 1;
  let num_defects = 0;
  /**
   * Add a defect point to the report.
   * @param {Number} mfl_max
   * @param {Object} position
   * @param {Boolean} offset
   */
  function addReportDefect(mfl_max, position, offset) {
    const count = document.getElementById("report-defective-count");
    const tbody = document.querySelector("#report-defective-table tbody");
    const map_container = document.getElementById("report-map-container");

    let top, left;
    if (typeof position === "object") {
      [top, left] = translateRosCoordToPointer(position);
      if (offset) {
        // TODO
      }
    } else if (typeof position === "string") {
      [top, left] = position.split(" ");
    } else {
      return;
    }

    num_defects++;

    count.innerHTML = `${num_defects} panel${
      num_defects === 1 ? "" : "s"
    } defective`;

    const new_row = document.createElement("tr");
    new_row.id = `report-defective-tr-${next_report_id}`;

    const new_th = document.createElement("th");
    new_th.scope = "row";
    new_th.textContent = `${next_report_id}`;

    const new_td = document.createElement("td");
    new_td.textContent = `${mfl_max}`;

    tbody.appendChild(new_row);
    new_row.appendChild(new_th);
    new_row.appendChild(new_td);

    const new_badge = document.createElement("div");
    new_badge.id = `report-defective-badge-${next_report_id}`;
    new_badge.classList.add("badge", "rounded-pill", "bg-primary");
    new_badge.style.position = "absolute";
    new_badge.style.top = `${top}%`;
    new_badge.style.left = `${left}%`;
    new_badge.textContent = `${next_report_id}`;

    map_container.appendChild(new_badge);

    return next_report_id++;
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

    map_info.ros_info = msg.info;

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

    map_info.bounding_box = {
      x: min_x,
      y: min_y,
      h: bound_height,
      w: bound_width,
    };

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
        // And the report canvas
        document
          .getElementById("report-map-canvas")
          .getContext("2d")
          .drawImage(bmp, 0, 0);
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

  const listener_position = new ROSLIB.Topic({
    ros: ros,
    name: "/amcl_pose",
    messageType: "geometry_msgs/PoseWithCovarianceStamped",
  });

  listener_position.subscribe(function (msg) {
    console.log("amcl_pose");
    const { z: or_z, w: or_w } = msg.pose.pose.orientation;

    const do_move = function () {
      const [x_frac, y_frac] = translateRosCoordToPointer(
        msg.pose.pose.position
      );

      // Wtf
      const ang_rad =
        Math.atan2(
          2 * (or_w * or_z) /*+ q.x * q.y*/,
          1 - 2 * /*q.y * q.y +*/ (or_z * or_z)
        ) +
        Math.PI / 2;

      moveMapPointerFractional(x_frac, y_frac, `${ang_rad}rad`);
    };

    // Check for map info. If it's not there, we need to wait until it's available and try again. Waiting for 1s should be enough
    if (map_info.ros_info === null || map_info.bounding_box.x === null) {
      setTimeout(do_move, 1);
    } else {
      // Do it now
      do_move();
    }
  });

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

    // Report export button handler
    document.getElementById("report-export").onclick = function (e) {
      console.warn("Stub: Report export");
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
    const canvas2 = document.getElementById("report-map-canvas");

    // TODO this doesn't work quite like I thought it would
    const side = Math.max(container.clientHeight, container.clientWidth);
    canvas.width = side;
    canvas.height = side;
    canvas2.width = canvas2.height = side;
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
  // For f12 tools
  window.debug = {
    moveMapPointerFractional,
    changeProgressBar,
    addReportDefect,
    listener_position,
    listener_map,
  };
})();
