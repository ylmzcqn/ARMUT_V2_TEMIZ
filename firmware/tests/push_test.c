#include <assert.h>
#include "../armut_presence_push/armut_presence_push.c"
static int64_t timer_us=1000000;static int status_code=200,requests,reads;static uint32_t sample_age=20;static double observed=1;static char target[600],payload[600];static bool consumed;
int64_t esp_timer_get_time(void){return timer_us;}
int esp_http_client_set_url(void *c,const char *url){(void)c;snprintf(target,sizeof(target),"%s",url);return ESP_OK;}
int esp_http_client_open(void *c,int size){(void)c;(void)size;consumed=false;requests++;return ESP_OK;}
int esp_http_client_write(void *c,const char *data,int length){(void)c;assert(length<(int)sizeof(payload));memcpy(payload,data,(size_t)length);payload[length]=0;return length;}
long long esp_http_client_fetch_headers(void *c){(void)c;return 0;}
int esp_http_client_get_status_code(void *c){(void)c;return status_code;}
int esp_http_client_read(void *c,char *data,int length){(void)c;if(consumed)return 0;const char *response="{\"version\":1,\"nonce\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"leaseMs\":5000,\"reportIntervalMs\":1000}";assert(length>(int)strlen(response));strcpy(data,response);consumed=true;return (int)strlen(response);}
bool esp_http_client_is_complete_data_received(void *c){(void)c;return consumed;}
int esp_http_client_close(void *c){(void)c;return ESP_OK;}

esp_err_t esp_crt_bundle_attach(void *c){(void)c;return ESP_OK;}
esp_http_client_handle_t esp_http_client_init(const esp_http_client_config_t *c){assert(c->crt_bundle_attach==esp_crt_bundle_attach&&c->disable_auto_redirect&&c->keep_alive_enable&&c->timeout_ms==1500);return (void *)1;}
int esp_http_client_cleanup(void *c){(void)c;return ESP_OK;}
int esp_http_client_set_header(void *c,const char *name,const char *value){(void)c;assert(name&&value&&*value);return ESP_OK;}
uint32_t esp_random(void){return 123;}
SemaphoreHandle_t xSemaphoreCreateBinary(void){return malloc(1);}
void vSemaphoreDelete(SemaphoreHandle_t h){free(h);}
void xSemaphoreGive(SemaphoreHandle_t h){(void)h;}
int xSemaphoreTake(SemaphoreHandle_t h,unsigned timeout){(void)h;(void)timeout;return pdTRUE;}
int xTaskCreate(void (*fn)(void *),const char *name,unsigned stack,void *ctx,unsigned priority,TaskHandle_t *task){(void)fn;(void)name;(void)ctx;(void)priority;assert(stack==6144);*task=(void *)3;return pdPASS;}
TaskHandle_t xTaskGetCurrentTaskHandle(void){return (void *)2;}
void xTaskNotifyGive(TaskHandle_t task){(void)task;}
void vTaskDelete(TaskHandle_t task){(void)task;}
void vTaskSuspend(TaskHandle_t task){(void)task;}
unsigned ulTaskNotifyTake(int clear,unsigned timeout){(void)clear;(void)timeout;return 1;}
static esp_err_t read_presence(void *ctx,const char *id,double *value,uint32_t *age){(void)ctx;assert(!strcmp(id,"presence"));reads++;*value=observed;*age=sample_age;return ESP_OK;}
int main(void){
 armut_presence_push_config_t cfg={.origin="https://fixture.invalid",.publisher_key="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",.site_access_key="fixture-site-key",.read=read_presence};assert(valid_config(&cfg));cfg.origin="http://fixture.invalid";assert(!valid_config(&cfg));cfg.origin="https://user:key@fixture.invalid";assert(!valid_config(&cfg));
 struct armut_presence_push h={.cfg={.read=read_presence},.origin="https://fixture.invalid",.client=(void *)1};strcpy(h.boot,"aa010001aa010001aa010001aa010001");
 assert(cycle(&h));assert(strstr(target,"/hello"));assert(reads==0);assert(h.sequence==0);
 timer_us+=1000000;assert(cycle(&h));assert(strstr(target,"/report"));assert(h.sequence==1&&reads==1);
 cJSON *body=cJSON_ParseWithLength(payload,strlen(payload));assert(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(body,"value")));assert(cJSON_GetObjectItemCaseSensitive(body,"sinceLeaseMs")->valuedouble==1000);cJSON_Delete(body);
 observed=0;timer_us+=1000000;assert(cycle(&h));body=cJSON_ParseWithLength(payload,strlen(payload));assert(cJSON_IsBool(cJSON_GetObjectItemCaseSensitive(body,"value"))&&!cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(body,"value")));cJSON_Delete(body);
 sample_age=2000;timer_us+=1000000;assert(cycle(&h));body=cJSON_ParseWithLength(payload,strlen(payload));assert(cJSON_IsNull(cJSON_GetObjectItemCaseSensitive(body,"value")));cJSON_Delete(body);
 status_code=409;assert(!cycle(&h));assert(!h.nonce[0]);status_code=200;assert(cycle(&h));assert(strstr(target,"/hello"));assert(h.sequence==0);
 int before=requests;timer_us+=4000000;assert(!cycle(&h));assert(!h.nonce[0]&&requests==before);
 assert(backoff(0,0)==1000&&backoff(1,0)==2000&&backoff(10,0)==30000&&backoff(32,250)==30250);
 cfg.origin="https://fixture.invalid";armut_presence_push_handle_t started=NULL;int initial_reads=reads;assert(armut_presence_push_start(&cfg,&started)==ESP_OK);assert(reads==initial_reads);assert(armut_presence_push_stop(started,10000)==ESP_OK);
 puts("firmware outbound presence host tests passed");
}
