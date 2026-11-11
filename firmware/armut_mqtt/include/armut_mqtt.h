#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define ARMUT_MQTT_MAX_TOPIC_LEN 128
#define ARMUT_MQTT_MAX_PAYLOAD_LEN 512
#define ARMUT_MQTT_MAX_ID_LEN 64

typedef struct {
    char command_id[ARMUT_MQTT_MAX_ID_LEN];
    char entity_id[ARMUT_MQTT_MAX_ID_LEN];
    char value_str[ARMUT_MQTT_MAX_ID_LEN];
    bool is_bool;
    bool bool_value;
    bool is_numeric;
    double num_value;
    uint64_t at_ms;
} armut_mqtt_command_t;

typedef struct {
    char command_id[ARMUT_MQTT_MAX_ID_LEN];
    char device_id[ARMUT_MQTT_MAX_ID_LEN];
    bool applied;
    int code;
    char error[ARMUT_MQTT_MAX_ID_LEN];
} armut_mqtt_ack_t;

/* MQTT Topic Matching (+ and # wildcards) */
bool armut_mqtt_topic_matches(const char *pattern, const char *topic);

/* JSON Telemetry Serializers */
esp_err_t armut_mqtt_build_status_json(char *buf, size_t max_len, const char *device_id, const char *boot_id, bool online);

esp_err_t armut_mqtt_build_state_json(char *buf, size_t max_len, const char *device_id, const char *boot_id,
                                      bool has_presence, bool presence, uint32_t sample_age_ms,
                                      int32_t distance_cm, int rssi);

esp_err_t armut_mqtt_build_event_json(char *buf, size_t max_len, const char *device_id, const char *event_name,
                                      bool presence, int32_t distance_cm, uint64_t timestamp_ms);

/* JSON Command Deserializer & ACK Serializer */
esp_err_t armut_mqtt_parse_command_json(const char *json_str, armut_mqtt_command_t *out_cmd);

esp_err_t armut_mqtt_build_ack_json(char *buf, size_t max_len, const char *command_id, const char *device_id,
                                    bool applied, int code, const char *error_msg);

#ifdef __cplusplus
}
#endif
