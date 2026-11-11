#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "armut_mqtt.h"
#include "../armut_mqtt/armut_mqtt.c"
#include "cJSON.h"

static void test_topic_matching(void) {
    assert(armut_mqtt_topic_matches("armut/#", "armut/devices/camera-02/status"));
    assert(armut_mqtt_topic_matches("armut/commands/#", "armut/commands/hub-display-layout"));
    assert(armut_mqtt_topic_matches("armut/commands/+", "armut/commands/hub-display-layout"));
    assert(!armut_mqtt_topic_matches("armut/commands/+", "armut/commands/hub/sub/deep"));
    assert(armut_mqtt_topic_matches("armut/devices/+/status", "armut/devices/camera-02/status"));
    assert(!armut_mqtt_topic_matches("armut/devices/+/status", "armut/devices/camera-02/state"));
    assert(armut_mqtt_topic_matches("exact/topic", "exact/topic"));
    assert(!armut_mqtt_topic_matches("exact/topic", "exact/other"));
    printf("✓ test_topic_matching passed\n");
}

static void test_status_json(void) {
    char buf[256];
    esp_err_t err = armut_mqtt_build_status_json(buf, sizeof(buf), "camera-02", "c4dc00bb", true);
    assert(err == ESP_OK);

    cJSON *root = cJSON_Parse(buf);
    assert(root != NULL);
    assert(strcmp(cJSON_GetObjectItem(root, "deviceId")->valuestring, "camera-02") == 0);
    assert(strcmp(cJSON_GetObjectItem(root, "bootId")->valuestring, "c4dc00bb") == 0);
    assert(cJSON_IsTrue(cJSON_GetObjectItem(root, "online")));
    cJSON_Delete(root);

    err = armut_mqtt_build_status_json(buf, sizeof(buf), "hub", "a1ff8237", false);
    assert(err == ESP_OK);
    root = cJSON_Parse(buf);
    assert(root != NULL);
    assert(cJSON_IsFalse(cJSON_GetObjectItem(root, "online")));
    cJSON_Delete(root);

    printf("✓ test_status_json passed\n");
}

static void test_state_json(void) {
    char buf[512];
    esp_err_t err = armut_mqtt_build_state_json(buf, sizeof(buf), "camera-02", "c4dc00bb",
                                                true, true, 250, 115, -64);
    assert(err == ESP_OK);

    cJSON *root = cJSON_Parse(buf);
    assert(root != NULL);
    assert(strcmp(cJSON_GetObjectItem(root, "deviceId")->valuestring, "camera-02") == 0);
    assert(cJSON_IsTrue(cJSON_GetObjectItem(root, "presence")));
    assert(cJSON_GetObjectItem(root, "sampleAgeMs")->valuedouble == 250);
    assert(cJSON_GetObjectItem(root, "distanceCm")->valuedouble == 115);
    cJSON *wifi = cJSON_GetObjectItem(root, "wifi");
    assert(wifi != NULL);
    assert(cJSON_GetObjectItem(wifi, "rssi")->valuedouble == -64);
    cJSON_Delete(root);

    printf("✓ test_state_json passed\n");
}

static void test_event_json(void) {
    char buf[512];
    esp_err_t err = armut_mqtt_build_event_json(buf, sizeof(buf), "camera-02", "motion_detected",
                                                true, 92, 1731365400000ULL);
    assert(err == ESP_OK);

    cJSON *root = cJSON_Parse(buf);
    assert(root != NULL);
    assert(strcmp(cJSON_GetObjectItem(root, "event")->valuestring, "motion_detected") == 0);
    assert(cJSON_IsTrue(cJSON_GetObjectItem(root, "presence")));
    assert(cJSON_GetObjectItem(root, "distanceCm")->valuedouble == 92);
    cJSON_Delete(root);

    printf("✓ test_event_json passed\n");
}

static void test_command_parse_and_ack(void) {
    const char *cmd_json = "{\"commandId\":\"cmd-test-99\",\"entityId\":\"hub-display-layout\",\"value\":\"assistant\",\"at\":1731365450000}";
    armut_mqtt_command_t cmd;
    esp_err_t err = armut_mqtt_parse_command_json(cmd_json, &cmd);
    assert(err == ESP_OK);
    assert(strcmp(cmd.command_id, "cmd-test-99") == 0);
    assert(strcmp(cmd.entity_id, "hub-display-layout") == 0);
    assert(strcmp(cmd.value_str, "assistant") == 0);
    assert(!cmd.is_bool);
    assert(cmd.at_ms == 1731365450000ULL);

    const char *bool_cmd = "{\"commandId\":\"cmd-led-1\",\"entityId\":\"cam01-led\",\"value\":true}";
    err = armut_mqtt_parse_command_json(bool_cmd, &cmd);
    assert(err == ESP_OK);
    assert(cmd.is_bool);
    assert(cmd.bool_value == true);

    char ack_buf[256];
    err = armut_mqtt_build_ack_json(ack_buf, sizeof(ack_buf), "cmd-test-99", "hub", true, 200, NULL);
    assert(err == ESP_OK);

    cJSON *ack = cJSON_Parse(ack_buf);
    assert(ack != NULL);
    assert(strcmp(cJSON_GetObjectItem(ack, "commandId")->valuestring, "cmd-test-99") == 0);
    assert(cJSON_IsTrue(cJSON_GetObjectItem(ack, "applied")));
    assert(cJSON_GetObjectItem(ack, "code")->valuedouble == 200);
    cJSON_Delete(ack);

    printf("✓ test_command_parse_and_ack passed\n");
}

int main(void) {
    test_topic_matching();
    test_status_json();
    test_state_json();
    test_event_json();
    test_command_parse_and_ack();
    printf("firmware mqtt host tests passed\n");
    return 0;
}
