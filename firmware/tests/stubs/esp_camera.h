#pragma once
#include <stddef.h>
#include <stdint.h>
typedef enum { FRAMESIZE_VGA,FRAMESIZE_SXGA } framesize_t;
#define PIXFORMAT_JPEG 4
typedef struct { int format; size_t len; uint8_t *buf; } camera_fb_t;
typedef struct sensor sensor_t;
struct sensor {
    int pixformat;
    int (*set_framesize)(sensor_t *,framesize_t);
    int (*set_quality)(sensor_t *,int);
    int (*set_exposure_ctrl)(sensor_t *,int);
    int (*set_gain_ctrl)(sensor_t *,int);
    int (*set_whitebal)(sensor_t *,int);
    int (*set_aec2)(sensor_t *,int);
    int (*set_ae_level)(sensor_t *,int);
};
camera_fb_t *esp_camera_fb_get(void);
void esp_camera_fb_return(camera_fb_t *);
sensor_t *esp_camera_sensor_get(void);
