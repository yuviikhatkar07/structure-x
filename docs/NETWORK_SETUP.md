# Network setup

```
Main ESP32 (AP)  STRUCTURE_X / structure123   192.168.4.1
ESP32-CAM (STA)  static                        192.168.4.2   stream :81/stream
Operator device  DHCP from the ESP32 AP        192.168.4.x   runs/opens the backend
```
The operator device **must stay connected to STRUCTURE_X** while operating. It will have no internet; the app needs none (fonts and libraries are bundled).

## Recommended: local demonstration
Run the backend on the laptop that is joined to the robot Wi-Fi and open `http://localhost:8080` (or `:5173` in dev). Everything is same-origin; no CORS or mixed-content problems exist because the browser never contacts the ESP32 directly (the backend proxies commands, telemetry and the camera stream).

## Phone as operator
Laptop on STRUCTURE_X runs the backend; the phone joins the same Wi-Fi and opens `http://<laptop-ip>:8080` (the URL is printed at startup). Allow port 8080 through the laptop firewall. Both devices drive the same robot and database; only one holds the drive lease at a time.
Alternative: a Raspberry Pi / mini-PC on the robot that joins STRUCTURE_X and serves the app.

## Hosted / remote deployment
An internet-hosted site **cannot** reach `192.168.4.x` (private address, browser mixed-content and Private-Network-Access rules). Run the backend on a machine that is on the robot network and expose *that* (VPN/Tailscale, or reverse proxy with HTTPS to the backend only). Never expose robot control to the public internet without authentication; this app has none by design (LAN tool).

## Direct camera mode
Settings → Camera mode → *Direct* makes the browser load `http://192.168.4.2:81/stream` itself. It only works over plain `http` pages on the robot network (HTTPS pages block it as mixed content). Default *Proxy* is recommended.

## Changing addresses
Settings → Network (ESP32 IP, camera IP, stream URL, endpoint paths, timeouts, reconnect interval). Update the firmware constants to match.
