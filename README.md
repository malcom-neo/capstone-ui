# capstone-ui

You just need to make sure you can reach the NUC at `10.21.130.23` and that the rosbridge_server 
is running on port 9090. Make sure the ROS nodes are running. If they aren't, the UI page will 
show "Connected" but sensor values won't change and the map will remain blank. Once the nodes 
start publishing the page will start updating.

If the UI can't connect it will show "Disconnected" in the top navbar. This is not recoverable 
and you'll need to refresh the page to try to connect again. (This is something nice to fix, but
it's not exactly very high on the to-do list right now.)

The e-stop button isn't wired to anything right now.

There are some external dependencies and if you're running without internet access the page will
be broken. It's not a huge problem for now.

There is **no security** on the websocket! Don't try to run the UI over the public internet. You
could tunnel the connection in a VPN if you really want to try that for the online showcase.

## Sensors I'd like (in roughly decreasing order of desirability)
- Live MFL reading
- Progress through planned path
- Current system task ("mapping"/"scanning"/"idle"/"manual control"/etc...)
- Lidar (distance to closest obstacle) 
- Battery (apparently just 90min-$UPTIME)
- Signal strength (probably not technically possible)
