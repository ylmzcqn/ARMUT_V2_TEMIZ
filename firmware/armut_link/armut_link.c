#include "armut_link.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "esp_http_client.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#define CACHE_SIZE 32
#define RESPONSE_SIZE 8192
#define MAX_SEQUENCE 9007199254740991ULL
struct command { char id[97]; uint64_t sequence; bool applied, value, pending; };
struct armut_link {
    armut_link_config_t cfg;
    armut_channel_t channels[ARMUT_LINK_MAX_CHANNELS];
    char *url, *auth, *cert;
    char device[97], role[8], boot[40];
    uint64_t sequence, command_sequence;
    size_t next_slot;
    struct command commands[CACHE_SIZE];
    size_t used;
    TaskHandle_t task;
    SemaphoreHandle_t done;
};
static const char *kinds[] = {"switch", "presence", "sensor"};
static bool string_ok(const char *s, size_t max) { return s && *s && strlen(s) <= max; }
static bool identifier_ok(const char *s) {
    if(!string_ok(s,96)) return false;
    for(size_t i=0;s[i];i++) {
        unsigned char c=(unsigned char)s[i];
        bool alnum=(c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9');
        if(!alnum && (i==0 || (c!='_' && c!='.' && c!='-'))) return false;
    }
    return true;
}
static void release(struct armut_link *h) {
    for (size_t i=0;i<h->cfg.channel_count;i++) {
        free((void *)h->channels[i].id); free((void *)h->channels[i].name); free((void *)h->channels[i].unit);
    }
    free(h->url); free(h->auth); free(h->cert);
    if(h->done) vSemaphoreDelete(h->done);
    free(h);
}
/* Bound parser recursion independently of the SDK cJSON nesting setting. */
static bool shallow_json(const char *s, size_t len) {
    unsigned depth=0; bool quoted=false, escaped=false;
    for(size_t i=0;i<len;i++) {
        char c=s[i];
        if(quoted) {
            if(escaped) escaped=false;
            else if(c=='\\') escaped=true;
            else if(c=='"') quoted=false;
        } else if(c=='"') quoted=true;
        else if(c=='{'||c=='[') { if(++depth>16) return false; }
        else if(c=='}'||c==']') { if(!depth) return false; depth--; }
    }
    return !quoted && !depth;
}
static bool add(cJSON *o, const char *k, const char *v) { return cJSON_AddStringToObject(o,k,v)!=NULL; }
static cJSON *report(struct armut_link *h) {
    cJSON *r=cJSON_CreateObject(), *entities=NULL, *acks=NULL;
    if(!r) return NULL;
    if(!cJSON_AddNumberToObject(r,"version",1) || !add(r,"deviceId",h->device) ||
       !add(r,"role",h->role) || !add(r,"bootId",h->boot) ||
       !cJSON_AddNumberToObject(r,"sequence",(double)++h->sequence) ||
       !cJSON_AddArrayToObject(r,"capabilities") ||
       !(entities=cJSON_AddArrayToObject(r,"entities")) ||
       !(acks=cJSON_AddArrayToObject(r,"acknowledgements"))) goto fail;
    for(size_t i=0;i<h->cfg.channel_count;i++) {
        double value=0; uint32_t age=0;
        const armut_channel_t *ch=&h->channels[i];
        if(h->cfg.read(h->cfg.context,ch->id,&value,&age)!=ESP_OK || !isfinite(value)) continue;
        if(ch->kind!=ARMUT_SENSOR && value!=0 && value!=1) continue;
        cJSON *e=cJSON_CreateObject();
        if(!e) goto fail;
        cJSON_AddItemToArray(entities,e);
        if(!add(e,"id",ch->id) || !add(e,"name",ch->name) || !add(e,"kind",kinds[ch->kind]) ||
           !cJSON_AddNumberToObject(e,"ageMs",age)) goto fail;
        if(ch->unit && !add(e,"unit",ch->unit)) goto fail;
        if(ch->kind==ARMUT_SENSOR) { if(!cJSON_AddNumberToObject(e,"value",value)) goto fail; }
        else if(!cJSON_AddBoolToObject(e,"value",value!=0)) goto fail;
    }
    for(size_t i=0;i<h->used;i++) if(h->commands[i].pending) {
        struct command *c=&h->commands[i]; cJSON *a=cJSON_CreateObject();
        if(!a) goto fail;
        cJSON_AddItemToArray(acks,a);
        if(!add(a,"commandId",c->id) || !cJSON_AddBoolToObject(a,"applied",c->applied) ||
           !cJSON_AddBoolToObject(a,"value",c->value)) goto fail;
    }
    return r;
fail: cJSON_Delete(r); return NULL;
}
static uint32_t consume(struct armut_link *h, cJSON *r) {
    cJSON *version=cJSON_GetObjectItemCaseSensitive(r,"version");
    cJSON *list=cJSON_GetObjectItemCaseSensitive(r,"commands");
    if(!cJSON_IsNumber(version) || version->valuedouble!=1 || !cJSON_IsArray(list) || cJSON_GetArraySize(list)>32) return 2000;
    for(size_t i=0;i<h->used;i++) h->commands[i].pending=false;
    cJSON *item=NULL;
    cJSON_ArrayForEach(item,list) {
        cJSON *id=cJSON_GetObjectItemCaseSensitive(item,"commandId");
        cJSON *boot=cJSON_GetObjectItemCaseSensitive(item,"bootId");
        cJSON *channel=cJSON_GetObjectItemCaseSensitive(item,"channelId");
        cJSON *value=cJSON_GetObjectItemCaseSensitive(item,"value");
        cJSON *seq=cJSON_GetObjectItemCaseSensitive(item,"sequence");
        if(!cJSON_IsString(id)||!string_ok(id->valuestring,96)||!cJSON_IsString(boot)||
           strcmp(boot->valuestring,h->boot)||!cJSON_IsString(channel)||!cJSON_IsBool(value)||
           !cJSON_IsNumber(seq)||!isfinite(seq->valuedouble)||seq->valuedouble<1||
           seq->valuedouble>MAX_SEQUENCE||floor(seq->valuedouble)!=seq->valuedouble) continue;
        uint64_t command_sequence=(uint64_t)seq->valuedouble;
        size_t n=0; for(;n<h->used;n++) if(!strcmp(h->commands[n].id,id->valuestring)) break;
        if(n<h->used) {
            if(h->commands[n].sequence==command_sequence) h->commands[n].pending=true;
            continue;
        }
        /* Evicted or replayed commands never cause another physical write. */
        if(command_sequence<=h->command_sequence) continue;
        h->command_sequence=command_sequence;
        struct command *c=&h->commands[h->next_slot];
        h->next_slot=(h->next_slot+1)%CACHE_SIZE;
        if(h->used<CACHE_SIZE) h->used++;
        memset(c,0,sizeof(*c)); c->sequence=command_sequence;
        snprintf(c->id,sizeof(c->id),"%s",id->valuestring); c->pending=true;
        for(size_t j=0;j<h->cfg.channel_count;j++) {
            const armut_channel_t *ch=&h->channels[j];
            if(ch->kind==ARMUT_SWITCH && !strcmp(ch->id,channel->valuestring) && h->cfg.apply) {
                bool actual=false;
                c->applied=h->cfg.apply(h->cfg.context,ch->id,cJSON_IsTrue(value),&actual)==ESP_OK;
                c->value=actual;
                if(actual!=cJSON_IsTrue(value)) c->applied=false;
                break;
            }
        }
    }
    cJSON *interval=cJSON_GetObjectItemCaseSensitive(r,"reportIntervalMs");
    return cJSON_IsNumber(interval)&&interval->valuedouble>=250&&interval->valuedouble<=60000 ? (uint32_t)interval->valuedouble : 2000;
}
static void worker(void *arg) {
    struct armut_link *h=arg; uint32_t interval=2000;
    while(h->sequence<MAX_SEQUENCE) {
        cJSON *r=report(h); char *body=r?cJSON_PrintUnformatted(r):NULL; cJSON_Delete(r);
        if(body) {
            esp_http_client_config_t cfg={.url=h->url,.method=HTTP_METHOD_POST,
                .timeout_ms=(int)h->cfg.timeout_ms,.cert_pem=h->cert,.disable_auto_redirect=true};
            esp_http_client_handle_t client=esp_http_client_init(&cfg);
            if(client) {
                esp_http_client_set_header(client,"Authorization",h->auth);
                esp_http_client_set_header(client,"Content-Type","application/json");
                if(esp_http_client_open(client,(int)strlen(body))==ESP_OK) {
                    int sent=esp_http_client_write(client,body,(int)strlen(body));
                    if(sent==(int)strlen(body) && esp_http_client_fetch_headers(client)>=0 && esp_http_client_get_status_code(client)==200) {
                        char *response=calloc(1,RESPONSE_SIZE+1); int total=0, got=0;
                        if(response) {
                            int64_t deadline=esp_timer_get_time()+(int64_t)h->cfg.timeout_ms*1000;
                            while(total<RESPONSE_SIZE && esp_timer_get_time()<deadline && (got=esp_http_client_read(client,response+total,RESPONSE_SIZE-total))>0) total+=got;
                            if(got>=0 && total<RESPONSE_SIZE && esp_http_client_is_complete_data_received(client) && shallow_json(response,(size_t)total)) {
                                cJSON *answer=cJSON_ParseWithLength(response,(size_t)total);
                                if(answer) interval=consume(h,answer);
                                cJSON_Delete(answer);
                            }
                            free(response);
                        }
                    }
                    esp_http_client_close(client);
                }
                esp_http_client_cleanup(client);
            }
            free(body);
        }
        if(ulTaskNotifyTake(pdTRUE,pdMS_TO_TICKS(interval))) break;
    }
    xSemaphoreGive(h->done); vTaskSuspend(NULL);
}
static bool config_valid(const armut_link_config_t *cfg) {
    if(!cfg) return false;
    if(!string_ok(cfg->server_url,512)||!string_ok(cfg->device_key,256)||
       !identifier_ok(cfg->device_id)||!cfg->role||
       (strcmp(cfg->role,"hub")&&strcmp(cfg->role,"camera")&&strcmp(cfg->role,"node"))||
       cfg->channel_count>ARMUT_LINK_MAX_CHANNELS||
       (cfg->channel_count && (!cfg->channels||!cfg->read))||
       (cfg->server_cert_pem && strlen(cfg->server_cert_pem)>16384)||
       (cfg->timeout_ms && (cfg->timeout_ms<100||cfg->timeout_ms>10000))||
       (strncmp(cfg->server_url,"http://",7)&&strncmp(cfg->server_url,"https://",8))||
       strchr(cfg->device_key,'\r')||strchr(cfg->device_key,'\n')) return false;
    for(size_t i=0;i<cfg->channel_count;i++) {
        const armut_channel_t *ch=&cfg->channels[i];
        if(!identifier_ok(ch->id)||!string_ok(ch->name,63)||ch->kind<ARMUT_SWITCH||ch->kind>ARMUT_SENSOR||
           (ch->unit&&strlen(ch->unit)>24)) return false;
        for(size_t j=0;j<i;j++) if(!strcmp(ch->id,cfg->channels[j].id)) return false;
    }
    return true;
}
esp_err_t armut_link_start(const armut_link_config_t *cfg, armut_link_handle_t *out) {
    if(!out) return ESP_ERR_INVALID_ARG;
    *out=NULL;
    if(!config_valid(cfg)) return ESP_ERR_INVALID_ARG;
    struct armut_link *h=calloc(1,sizeof(*h)); if(!h) return ESP_ERR_NO_MEM;
    h->cfg=*cfg; h->cfg.channel_count=0; h->cfg.timeout_ms=cfg->timeout_ms?cfg->timeout_ms:3000;
    h->url=malloc(strlen(cfg->server_url)+32); h->auth=malloc(strlen(cfg->device_key)+8);
    h->cert=cfg->server_cert_pem?strdup(cfg->server_cert_pem):NULL;
    h->done=xSemaphoreCreateBinary();
    if(!h->url||!h->auth||!h->done||(cfg->server_cert_pem&&!h->cert)) goto oom;
    snprintf(h->url,strlen(cfg->server_url)+32,"%s/api/device/report",cfg->server_url);
    snprintf(h->auth,strlen(cfg->device_key)+8,"Bearer %s",cfg->device_key);
    snprintf(h->device,sizeof(h->device),"%s",cfg->device_id); snprintf(h->role,sizeof(h->role),"%s",cfg->role);
    snprintf(h->boot,sizeof(h->boot),"%08lx%08lx-%llx",(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long long)esp_timer_get_time());
    for(size_t i=0;i<cfg->channel_count;i++) {
        h->channels[i]=cfg->channels[i];
        h->channels[i].id=strdup(cfg->channels[i].id); h->channels[i].name=strdup(cfg->channels[i].name);
        h->channels[i].unit=cfg->channels[i].unit?strdup(cfg->channels[i].unit):NULL;
        h->cfg.channel_count++;
        if(!h->channels[i].id||!h->channels[i].name||(cfg->channels[i].unit&&!h->channels[i].unit)) goto oom;
    }
    if(xTaskCreate(worker,"armut_link",6144,h,5,&h->task)!=pdPASS) goto oom;
    *out=h; return ESP_OK;
oom: release(h); return ESP_ERR_NO_MEM;
}
esp_err_t armut_link_stop(armut_link_handle_t h, uint32_t timeout_ms) {
    if(!h || xTaskGetCurrentTaskHandle()==h->task) return ESP_ERR_INVALID_ARG;
    xTaskNotifyGive(h->task);
    if(xSemaphoreTake(h->done,pdMS_TO_TICKS(timeout_ms))!=pdTRUE) return ESP_ERR_TIMEOUT;
    vTaskDelete(h->task); release(h); return ESP_OK;
}
