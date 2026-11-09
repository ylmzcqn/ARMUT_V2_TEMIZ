#pragma once
#include <stdint.h>
#define pdTRUE 1
#define pdPASS 1
#define pdMS_TO_TICKS(x) (x)
#define pdFALSE 0
#define portMAX_DELAY 0xffffffffU
#define BIT0 1
#define BIT1 2

typedef uint32_t TickType_t;
#define configTICK_RATE_HZ 100
