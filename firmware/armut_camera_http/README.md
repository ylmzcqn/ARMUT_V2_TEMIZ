# armut_camera_http

ESP-IDF 5.5 adapter for an **already initialized JPEG esp32-camera driver** and
caller-owned `httpd_handle_t`. No pin selection, camera initialization, server
startup, servo control or OTA.

- `GET /camera.jpg`: JPEG snapshot.
- `GET /stream`: one asynchronous MJPEG stream.
- `POST /profile`: JSON `{"profile":"smooth"|"lowlight"|"detail"}`.

All routes require the same per-device `Authorization: Bearer …` key used by the
controller's private camera proxy. Pass credentials at runtime; do not commit them.

Call `armut_camera_http_stop()` outside HTTP handlers **before** stopping the HTTP
server or deinitializing the camera. A timeout preserves the handle for retry.
The driver must be exclusively accessed through this adapter while attached.

See [integration instructions](../../docs/ESP32-INTEGRATION.md) for profiles,
frame/network bounds, managed dependency, API example and verification limits.
25 FPS is the maximum target, not a measured or guaranteed delivery rate.

Host checks: `firmware/tests/run-host-tests.sh` from the repository root.
Actual ESP-IDF compilation and physical camera validation remain required.
