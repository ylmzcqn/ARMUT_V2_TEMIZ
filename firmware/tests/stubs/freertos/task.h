#pragma once
typedef void *TaskHandle_t;
int xTaskCreate(void (*)(void *),const char *,unsigned,void *,unsigned,TaskHandle_t *);
unsigned ulTaskNotifyTake(int,unsigned);
void xTaskNotifyGive(TaskHandle_t);
void vTaskDelete(TaskHandle_t);
void vTaskSuspend(TaskHandle_t);
TaskHandle_t xTaskGetCurrentTaskHandle(void);
void vTaskDelay(unsigned);

TickType_t xTaskGetTickCount(void);
void vTaskDelayUntil(TickType_t *,TickType_t);
