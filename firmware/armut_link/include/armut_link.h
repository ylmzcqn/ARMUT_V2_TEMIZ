#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif
#define ARMUT_LINK_MAX_CHANNELS 16
/* Configuration strings and channels are copied by start. No GPIO is initialized. */
typedef enum { ARMUT_SWITCH, ARMUT_PRESENCE, ARMUT_SENSOR } armut_kind_t;
typedef struct {
    const char *id; /* stable ASCII identifier, <=96 bytes; [A-Za-z0-9][A-Za-z0-9_.-]* */
    const char *name; /* nonempty human-readable name, <=63 UTF-8 bytes */
    const char *unit; /* sensor only, optional */
    armut_kind_t kind;
} armut_channel_t;
/* Called on the link task. Return actual observed state and its age, never desired state. */
typedef esp_err_t (*armut_read_fn)(void *context, const char *channel_id,
                                  double *value, uint32_t *age_ms);
/* Only switch channels. Set actual_value even on failure. Must be bounded and idempotent.
 * Return ESP_OK only after hardware application is confirmed. No startup invocation. */
typedef esp_err_t (*armut_apply_fn)(void *context, const char *channel_id,
                                   bool requested_value, bool *actual_value);
typedef struct {
    const char *server_url; /* origin, e.g. https://controller.example; no trailing slash */
    const char *device_key;
    const char *device_id; /* same ASCII grammar/96-byte limit as channel id */
    const char *role; /* hub, camera or node */
    const armut_channel_t *channels;
    size_t channel_count;
    armut_read_fn read;
    armut_apply_fn apply;
    void *context; /* caller-owned until stop completes */
    const char *server_cert_pem; /* optional private CA PEM, copied */
    uint32_t timeout_ms; /* 100..10000, zero => 3000 */
} armut_link_config_t;
typedef struct armut_link *armut_link_handle_t;
esp_err_t armut_link_start(const armut_link_config_t *config, armut_link_handle_t *out);
/* Must be called outside callbacks. timeout leaves handle valid for another stop call. */
esp_err_t armut_link_stop(armut_link_handle_t handle, uint32_t timeout_ms);
#ifdef __cplusplus
}
#endif
