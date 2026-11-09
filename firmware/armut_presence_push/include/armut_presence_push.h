#pragma once
#include "armut_link.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Only reads the existing driver's bounded, thread-safe presence snapshot.
 * It does not initialize Wi-Fi, radar, camera, GPIO, NVS or OTA. */
typedef struct {
 const char *origin; /* HTTPS origin, no path/query/credentials */
 const char *publisher_key; /* dedicated fixed camera-02/presence-radar publisher */
 const char *site_access_key; /* private Sites service access, never browser code */
 armut_read_fn read; /* channel "presence"; 0/1 + actual UART sample age */
 void *context;
} armut_presence_push_config_t;
typedef struct armut_presence_push *armut_presence_push_handle_t;
esp_err_t armut_presence_push_start(const armut_presence_push_config_t *,armut_presence_push_handle_t *);
/* Outside callbacks. Timeout keeps handle valid. Stop before releasing driver context. */
esp_err_t armut_presence_push_stop(armut_presence_push_handle_t,uint32_t timeout_ms);
#ifdef __cplusplus
}
#endif
