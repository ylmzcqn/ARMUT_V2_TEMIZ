#pragma once
#include <stdint.h>
#include "esp_err.h"
#include "esp_http_server.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct armut_camera_http *armut_camera_http_handle_t;
typedef struct {
    httpd_handle_t server; /* already running; allow >=3 URI handlers */
    const char *device_key; /* copied; same private key used by the controller proxy */
    uint32_t target_fps; /* 1..25, zero =>25; maximum target, not delivered FPS guarantee */
    uint32_t io_timeout_ms; /* 100..3000, zero =>1000; socket send/receive bound */
    uint32_t frame_timeout_ms; /* 100..5000, zero =>2000; late captures discarded */
    uint32_t max_frame_bytes; /* 4096..1048576, zero =>524288; frame copy allocation bound */
} armut_camera_http_config_t;
/* Requires an already initialized JPEG esp32-camera driver and available network.
 * Exclusively owns access to esp_camera_fb_get/return and sensor controls while active.
 * Does not initialize camera/GPIO, apply a profile at startup, or start a server.
 * Do not accept external requests until start returns successfully. */
esp_err_t armut_camera_http_start(const armut_camera_http_config_t *config,
                                 armut_camera_http_handle_t *out);
/* Call outside HTTP handlers, before httpd_stop or camera deinit. Single caller.
 * Timeout preserves handle; retry stop. Success invalidates handle.
 * Detaches routes on the HTTP server task, then waits for all active requests.
 * Does not stop the caller-owned server or deinitialize the camera. */
esp_err_t armut_camera_http_stop(armut_camera_http_handle_t handle, uint32_t timeout_ms);
#ifdef __cplusplus
}
#endif
