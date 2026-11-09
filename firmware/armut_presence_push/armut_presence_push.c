#include "armut_presence_push.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "cJSON.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
struct armut_presence_push {
 armut_presence_push_config_t cfg;
 char *origin,*auth,*site_auth;
 char boot[33],nonce[65];
 uint64_t sequence;
 int64_t received_us;
 unsigned failures;
 int status;
 esp_http_client_handle_t client;
 TaskHandle_t task;
 SemaphoreHandle_t done;
};
static bool ascii_key(const char *s,size_t max){if(!s||!*s||strlen(s)>max)return false;for(;*s;s++)if((unsigned char)*s<33||(unsigned char)*s>126)return false;return true;}
static bool valid_config(const armut_presence_push_config_t *c){
 if(!c||!c->read||!ascii_key(c->origin,512)||strncmp(c->origin,"https://",8)||!c->origin[8]||strpbrk(c->origin+8,"/@?#")||!ascii_key(c->publisher_key,256)||strlen(c->publisher_key)<32||!ascii_key(c->site_access_key,2048))return false;
 return true;
}
static uint32_t backoff(unsigned failures,uint32_t random){unsigned shift=failures>5?5:failures;uint32_t delay=1000U<<shift;return (delay>30000?30000:delay)+(random%251);}
static bool response_nonce(struct armut_presence_push *h,const char *text,size_t length){
 cJSON *root=cJSON_ParseWithLength(text,length);if(!root)return false;
 cJSON *v=cJSON_GetObjectItemCaseSensitive(root,"version"),*n=cJSON_GetObjectItemCaseSensitive(root,"nonce"),*lease=cJSON_GetObjectItemCaseSensitive(root,"leaseMs"),*interval=cJSON_GetObjectItemCaseSensitive(root,"reportIntervalMs");
 bool ok=cJSON_IsNumber(v)&&v->valuedouble==1&&cJSON_IsString(n)&&strlen(n->valuestring)==64&&cJSON_IsNumber(lease)&&lease->valuedouble==5000&&cJSON_IsNumber(interval)&&interval->valuedouble==1000;
 if(ok)for(size_t i=0;i<64;i++)if(!isxdigit((unsigned char)n->valuestring[i]))ok=false;
 if(ok){memcpy(h->nonce,n->valuestring,65);h->received_us=esp_timer_get_time();}
 cJSON_Delete(root);return ok;
}
static bool post(struct armut_presence_push *h,bool hello,const char *body){
 char url[600];snprintf(url,sizeof(url),"%s/api/presence/%s",h->origin,hello?"hello":"report");
 char response[1024];int total=0;bool ok=false;int64_t started=esp_timer_get_time();
 if(esp_http_client_set_url(h->client,url)!=ESP_OK)goto done;
 if(esp_http_client_open(h->client,(int)strlen(body))!=ESP_OK)goto done;
 int sent=0,length=(int)strlen(body);while(sent<length){int n=esp_http_client_write(h->client,body+sent,length-sent);if(n<=0||esp_timer_get_time()-started>2000000)goto done;sent+=n;}
 if(esp_http_client_fetch_headers(h->client)<0)goto done;
 h->status=esp_http_client_get_status_code(h->client);if(h->status!=200)goto done;
 while(total<(int)sizeof(response)-1){int n=esp_http_client_read(h->client,response+total,(int)sizeof(response)-1-total);if(n<0||esp_timer_get_time()-started>2000000)goto done;if(!n)break;total+=n;}
 if(!esp_http_client_is_complete_data_received(h->client)||total==(int)sizeof(response)-1)goto done;
 response[total]='\0';ok=response_nonce(h,response,(size_t)total);
 done:if(!ok)esp_http_client_close(h->client);return ok;
}
static bool cycle(struct armut_presence_push *h){
 bool hello=!h->nonce[0];h->status=0;
 cJSON *root=cJSON_CreateObject();if(!root)return false;
 cJSON_AddNumberToObject(root,"version",1);cJSON_AddStringToObject(root,"deviceId","camera-02");cJSON_AddStringToObject(root,"componentId","presence-radar");cJSON_AddStringToObject(root,"bootId",h->boot);
 if(!hello){
  int64_t elapsed=esp_timer_get_time()-h->received_us;
  if(elapsed<0||elapsed>=4000000||h->sequence>=9007199254740990ULL){h->nonce[0]=0;cJSON_Delete(root);return false;}
  cJSON_AddStringToObject(root,"nonce",h->nonce);cJSON_AddNumberToObject(root,"sequence",(double)(h->sequence+1));cJSON_AddNumberToObject(root,"sinceLeaseMs",(double)(elapsed/1000));
  double value=0;uint32_t age=0;esp_err_t result=h->cfg.read(h->cfg.context,"presence",&value,&age);
  if(result==ESP_OK&&(value==0||value==1)&&age<2000){cJSON_AddBoolToObject(root,"value",value==1);cJSON_AddNumberToObject(root,"sampleAgeMs",age);}else{cJSON_AddNullToObject(root,"value");cJSON_AddNullToObject(root,"sampleAgeMs");}
 }
 char *body=cJSON_PrintUnformatted(root);cJSON_Delete(root);
 bool ok=body&&post(h,hello,body);free(body);
 if(ok){if(hello)h->sequence=0;else h->sequence++;h->failures=0;}else{h->nonce[0]=0;if(h->failures<32)h->failures++;}
 return ok;
}
static void worker(void *context){struct armut_presence_push *h=context;for(;;){bool ok=cycle(h);uint32_t delay=ok?1000:(h->status==401||h->status==403?30000:backoff(h->failures?h->failures-1:0,esp_random()));if(ulTaskNotifyTake(pdTRUE,pdMS_TO_TICKS(delay)))break;}xSemaphoreGive(h->done);vTaskSuspend(NULL);}
static void release(struct armut_presence_push *h){if(h->client)esp_http_client_cleanup(h->client);if(h->done)vSemaphoreDelete(h->done);free(h->origin);free(h->auth);free(h->site_auth);free(h);}
esp_err_t armut_presence_push_start(const armut_presence_push_config_t *cfg,armut_presence_push_handle_t *out){
 if(!out)return ESP_ERR_INVALID_ARG;
 *out=NULL;if(!valid_config(cfg))return ESP_ERR_INVALID_ARG;
 struct armut_presence_push *h=calloc(1,sizeof(*h));if(!h)return ESP_ERR_NO_MEM;h->cfg=*cfg;h->origin=strdup(cfg->origin);h->auth=malloc(strlen(cfg->publisher_key)+8);h->site_auth=malloc(strlen(cfg->site_access_key)+8);h->done=xSemaphoreCreateBinary();
 if(!h->origin||!h->auth||!h->site_auth||!h->done)goto oom;
 snprintf(h->auth,strlen(cfg->publisher_key)+8,"Bearer %s",cfg->publisher_key);snprintf(h->site_auth,strlen(cfg->site_access_key)+8,"Bearer %s",cfg->site_access_key);
 snprintf(h->boot,sizeof(h->boot),"%08lx%08lx%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random());
 esp_http_client_config_t config={.url=h->origin,.method=HTTP_METHOD_POST,.timeout_ms=1500,.disable_auto_redirect=true,.crt_bundle_attach=esp_crt_bundle_attach,.keep_alive_enable=true};
 h->client=esp_http_client_init(&config);if(!h->client)goto oom;
 if(esp_http_client_set_header(h->client,"Content-Type","application/json")!=ESP_OK||esp_http_client_set_header(h->client,"Authorization",h->auth)!=ESP_OK||esp_http_client_set_header(h->client,"OAI-Sites-Authorization",h->site_auth)!=ESP_OK)goto oom;
 if(xTaskCreate(worker,"armut_push",6144,h,4,&h->task)!=pdPASS)goto oom;
 *out=h;return ESP_OK;
 oom:release(h);return ESP_ERR_NO_MEM;
}
esp_err_t armut_presence_push_stop(armut_presence_push_handle_t h,uint32_t timeout_ms){if(!h||!timeout_ms||xTaskGetCurrentTaskHandle()==h->task)return ESP_ERR_INVALID_ARG;xTaskNotifyGive(h->task);if(xSemaphoreTake(h->done,pdMS_TO_TICKS(timeout_ms))!=pdTRUE)return ESP_ERR_TIMEOUT;vTaskDelete(h->task);release(h);return ESP_OK;}
