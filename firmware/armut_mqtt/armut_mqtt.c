#include "armut_mqtt.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#ifndef cJSON_Parse
#define cJSON_Parse(s) cJSON_ParseWithLength((s), strlen(s))
#endif
#ifndef cJSON_GetObjectItem
#define cJSON_GetObjectItem(o, k) cJSON_GetObjectItemCaseSensitive((o), (k))
#endif
#ifndef cJSON_IsFalse
#define cJSON_IsFalse(item) (cJSON_IsBool(item) && !cJSON_IsTrue(item))
#endif

static inline cJSON *armut_cjson_add_object(cJSON *parent, const char *key) {
    cJSON *child = cJSON_CreateObject();
    if (!child) return NULL;
    cJSON_AddItemToObject(parent, key, child);
    return child;
}
#define cJSON_AddObjectToObject(o, k) armut_cjson_add_object((o), (k))

bool armut_mqtt_topic_matches(const char *pattern, const char *topic) {
    if (!pattern || !topic) return false;

    const char *p = pattern;
    const char *t = topic;

    while (*p && *t) {
        if (*p == '#') {
            return (*(p + 1) == '\0');
        }
        if (*p == '+') {
            while (*t && *t != '/') {
                t++;
            }
            p++;
            if (*p == '/' && *t == '/') {
                p++;
                t++;
                continue;
            }
            if (*p == '\0' && *t == '\0') return true;
            if (*p == '\0' && *t == '/') return false;
            continue;
        }
        if (*p != *t) return false;
        p++;
        t++;
    }

    if (*p == '#' && *(p + 1) == '\0') return true;
    if (*p == '+' && *(p + 1) == '\0' && *t == '\0') return true;

    return (*p == '\0' && *t == '\0');
}

esp_err_t armut_mqtt_build_status_json(char *buf, size_t max_len, const char *device_id, const char *boot_id, bool online) {
    if (!buf || max_len == 0 || !device_id) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    if (!root) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(root, "deviceId", device_id);
    if (boot_id && strlen(boot_id) > 0) {
        cJSON_AddStringToObject(root, "bootId", boot_id);
    }
    cJSON_AddBoolToObject(root, "online", online);

    char *printed = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!printed) return ESP_ERR_NO_MEM;
    if (strlen(printed) >= max_len) {
        free(printed);
        return ESP_ERR_INVALID_SIZE;
    }

    strncpy(buf, printed, max_len - 1);
    buf[max_len - 1] = '\0';
    free(printed);
    return ESP_OK;
}

esp_err_t armut_mqtt_build_state_json(char *buf, size_t max_len, const char *device_id, const char *boot_id,
                                      bool has_presence, bool presence, uint32_t sample_age_ms,
                                      int32_t distance_cm, int rssi) {
    if (!buf || max_len == 0 || !device_id) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    if (!root) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(root, "deviceId", device_id);
    if (boot_id && strlen(boot_id) > 0) {
        cJSON_AddStringToObject(root, "bootId", boot_id);
    }
    cJSON_AddBoolToObject(root, "online", true);

    if (has_presence) {
        cJSON_AddBoolToObject(root, "presence", presence);
        cJSON_AddNumberToObject(root, "sampleAgeMs", (double)sample_age_ms);
        if (distance_cm >= 0) {
            cJSON_AddNumberToObject(root, "distanceCm", (double)distance_cm);
        }
    }

    if (rssi != 0) {
        cJSON *wifi = cJSON_AddObjectToObject(root, "wifi");
        if (wifi) {
            cJSON_AddNumberToObject(wifi, "rssi", (double)rssi);
        }
    }

    char *printed = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!printed) return ESP_ERR_NO_MEM;
    if (strlen(printed) >= max_len) {
        free(printed);
        return ESP_ERR_INVALID_SIZE;
    }

    strncpy(buf, printed, max_len - 1);
    buf[max_len - 1] = '\0';
    free(printed);
    return ESP_OK;
}

esp_err_t armut_mqtt_build_event_json(char *buf, size_t max_len, const char *device_id, const char *event_name,
                                      bool presence, int32_t distance_cm, uint64_t timestamp_ms) {
    if (!buf || max_len == 0 || !device_id || !event_name) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    if (!root) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddStringToObject(root, "event", event_name);
    cJSON_AddBoolToObject(root, "presence", presence);
    if (distance_cm >= 0) {
        cJSON_AddNumberToObject(root, "distanceCm", (double)distance_cm);
    }
    if (timestamp_ms > 0) {
        cJSON_AddNumberToObject(root, "timestamp", (double)timestamp_ms);
    }

    char *printed = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!printed) return ESP_ERR_NO_MEM;
    if (strlen(printed) >= max_len) {
        free(printed);
        return ESP_ERR_INVALID_SIZE;
    }

    strncpy(buf, printed, max_len - 1);
    buf[max_len - 1] = '\0';
    free(printed);
    return ESP_OK;
}

esp_err_t armut_mqtt_parse_command_json(const char *json_str, armut_mqtt_command_t *out_cmd) {
    if (!json_str || !out_cmd) return ESP_ERR_INVALID_ARG;
    memset(out_cmd, 0, sizeof(*out_cmd));

    cJSON *root = cJSON_Parse(json_str);
    if (!root) return ESP_FAIL;

    cJSON *cid = cJSON_GetObjectItemCaseSensitive(root, "commandId");
    if (cJSON_IsString(cid) && cid->valuestring) {
        strncpy(out_cmd->command_id, cid->valuestring, sizeof(out_cmd->command_id) - 1);
    }

    cJSON *eid = cJSON_GetObjectItemCaseSensitive(root, "entityId");
    if (cJSON_IsString(eid) && eid->valuestring) {
        strncpy(out_cmd->entity_id, eid->valuestring, sizeof(out_cmd->entity_id) - 1);
    }

    cJSON *val = cJSON_GetObjectItemCaseSensitive(root, "value");
    if (val) {
        if (cJSON_IsBool(val)) {
            out_cmd->is_bool = true;
            out_cmd->bool_value = cJSON_IsTrue(val);
            strncpy(out_cmd->value_str, out_cmd->bool_value ? "true" : "false", sizeof(out_cmd->value_str) - 1);
        } else if (cJSON_IsNumber(val)) {
            out_cmd->is_numeric = true;
            out_cmd->num_value = val->valuedouble;
            snprintf(out_cmd->value_str, sizeof(out_cmd->value_str), "%g", val->valuedouble);
        } else if (cJSON_IsString(val) && val->valuestring) {
            strncpy(out_cmd->value_str, val->valuestring, sizeof(out_cmd->value_str) - 1);
        }
    }

    cJSON *at = cJSON_GetObjectItemCaseSensitive(root, "at");
    if (cJSON_IsNumber(at)) {
        out_cmd->at_ms = (uint64_t)at->valuedouble;
    }

    cJSON_Delete(root);
    return (out_cmd->entity_id[0] != '\0' || out_cmd->command_id[0] != '\0') ? ESP_OK : ESP_ERR_INVALID_ARG;
}

esp_err_t armut_mqtt_build_ack_json(char *buf, size_t max_len, const char *command_id, const char *device_id,
                                    bool applied, int code, const char *error_msg) {
    if (!buf || max_len == 0 || !command_id) return ESP_ERR_INVALID_ARG;

    cJSON *root = cJSON_CreateObject();
    if (!root) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(root, "commandId", command_id);
    if (device_id && strlen(device_id) > 0) {
        cJSON_AddStringToObject(root, "deviceId", device_id);
    }
    cJSON_AddBoolToObject(root, "applied", applied);
    cJSON_AddNumberToObject(root, "code", (double)code);
    if (error_msg && strlen(error_msg) > 0) {
        cJSON_AddStringToObject(root, "error", error_msg);
    }

    char *printed = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!printed) return ESP_ERR_NO_MEM;
    if (strlen(printed) >= max_len) {
        free(printed);
        return ESP_ERR_INVALID_SIZE;
    }

    strncpy(buf, printed, max_len - 1);
    buf[max_len - 1] = '\0';
    free(printed);
    return ESP_OK;
}
