#include "armut_camera_http.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include "cJSON.h"
#include "esp_camera.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "freertos/event_groups.h"

#define IDLE_BIT BIT0
#define DETACHED_BIT BIT1
#define BOUNDARY "armut-frame-boundary"
struct armut_camera_http {
    armut_camera_http_config_t cfg;
    char key[257];
    SemaphoreHandle_t state_lock, camera_lock;
    EventGroupHandle_t events;
    unsigned active;
    bool stopping, detach_queued, streaming;
};
struct frame { uint8_t *data; size_t len; };
struct profile { const char *name; framesize_t size; int quality, ae_level; };
static const struct profile profiles[]={
    {"smooth",FRAMESIZE_VGA,18,0}, {"lowlight",FRAMESIZE_VGA,16,2},
    {"detail",FRAMESIZE_SXGA,10,0}
};
static const struct profile *find_profile(const char *name) {
    if(!name) return NULL;
    for(size_t i=0;i<sizeof(profiles)/sizeof(profiles[0]);i++)
        if(!strcmp(name,profiles[i].name)) return &profiles[i];
    return NULL;
}
static bool same_secret(const char *a,const char *b) {
    size_t na=strlen(a),nb=strlen(b); unsigned diff=(unsigned)(na^nb);
    for(size_t i=0;i<nb;i++) diff|=(unsigned char)(i<na?a[i]:0)^(unsigned char)b[i];
    return diff==0;
}
static esp_err_t reply(httpd_req_t *r,const char *status,const char *text) {
    httpd_resp_set_status(r,status); httpd_resp_set_type(r,"application/json");
    httpd_resp_set_hdr(r,"Cache-Control","no-store");
    return httpd_resp_send(r,text,HTTPD_RESP_USE_STRLEN);
}
static bool authorized(httpd_req_t *r,struct armut_camera_http *h) {
    char auth[264]; size_t len=httpd_req_get_hdr_value_len(r,"Authorization");
    if(len<8||len>=sizeof(auth)||httpd_req_get_hdr_value_str(r,"Authorization",auth,sizeof(auth))!=ESP_OK||
       strncmp(auth,"Bearer ",7)||!same_secret(auth+7,h->key)) {
        httpd_resp_set_hdr(r,"WWW-Authenticate","Bearer");
        reply(r,"401 Unauthorized","{\"error\":\"unauthorized\"}"); return false;
    }
    return true;
}
static bool enter(struct armut_camera_http *h) {
    xSemaphoreTake(h->state_lock,portMAX_DELAY);
    bool ok=!h->stopping;
    if(ok) { h->active++; xEventGroupClearBits(h->events,IDLE_BIT); }
    xSemaphoreGive(h->state_lock); return ok;
}
static void leave(struct armut_camera_http *h,bool stream) {
    xSemaphoreTake(h->state_lock,portMAX_DELAY);
    if(stream) h->streaming=false;
    if(--h->active==0) xEventGroupSetBits(h->events,IDLE_BIT);
    xSemaphoreGive(h->state_lock);
}
static bool stopping(struct armut_camera_http *h) {
    xSemaphoreTake(h->state_lock,portMAX_DELAY); bool value=h->stopping;
    xSemaphoreGive(h->state_lock); return value;
}
static bool socket_timeout(httpd_req_t *r,struct armut_camera_http *h,bool receive) {
    struct timeval tv={.tv_sec=h->cfg.io_timeout_ms/1000,
                       .tv_usec=(h->cfg.io_timeout_ms%1000)*1000};
    return setsockopt(httpd_req_to_sockfd(r),SOL_SOCKET,receive?SO_RCVTIMEO:SO_SNDTIMEO,&tv,sizeof(tv))==0;
}
/* All fb operations and sensor mutations share this lock. A bounded JPEG copy
 * lets profile calls proceed while a slow client is receiving the previous frame. */
static esp_err_t capture(struct armut_camera_http *h,struct frame *out) {
    memset(out,0,sizeof(*out));
    if(xSemaphoreTake(h->camera_lock,pdMS_TO_TICKS(h->cfg.frame_timeout_ms))!=pdTRUE) return ESP_ERR_TIMEOUT;
    int64_t started=esp_timer_get_time();
    camera_fb_t *fb=esp_camera_fb_get(); /* esp32-camera 2.1.3: native 4000ms wait */
    esp_err_t err=ESP_FAIL;
    if(fb) {
        if(fb->format==PIXFORMAT_JPEG && fb->len>0 && fb->len<=h->cfg.max_frame_bytes &&
           esp_timer_get_time()-started<=(int64_t)h->cfg.frame_timeout_ms*1000) {
            out->data=malloc(fb->len);
            if(out->data) { memcpy(out->data,fb->buf,fb->len); out->len=fb->len; err=ESP_OK; }
            else err=ESP_ERR_NO_MEM;
        }
        esp_camera_fb_return(fb);
    }
    xSemaphoreGive(h->camera_lock); return err;
}
static esp_err_t send_frame(httpd_req_t *r,struct armut_camera_http *h,const struct frame *frame) {
    int64_t deadline=esp_timer_get_time()+(int64_t)h->cfg.frame_timeout_ms*1000;
    for(size_t offset=0;offset<frame->len;) {
        if(stopping(h)||esp_timer_get_time()>=deadline) return ESP_ERR_TIMEOUT;
        size_t n=frame->len-offset; if(n>4096) n=4096;
        esp_err_t err=httpd_resp_send_chunk(r,(const char *)frame->data+offset,n);
        if(err!=ESP_OK) return err;
        offset+=n;
    }
    return ESP_OK;
}
static esp_err_t snapshot(httpd_req_t *r) {
    struct armut_camera_http *h=r->user_ctx;
    if(!enter(h)) return reply(r,"503 Service Unavailable","{\"error\":\"stopping\"}");
    esp_err_t err=ESP_FAIL;
    if(authorized(r,h) && socket_timeout(r,h,false)) {
        struct frame frame;
        if(capture(h,&frame)==ESP_OK) {
            httpd_resp_set_type(r,"image/jpeg"); httpd_resp_set_hdr(r,"Cache-Control","no-store");
            err=send_frame(r,h,&frame); free(frame.data);
            if(err==ESP_OK) err=httpd_resp_send_chunk(r,NULL,0);
        } else err=reply(r,"503 Service Unavailable","{\"error\":\"frame-unavailable\"}");
    }
    leave(h,false); return err;
}
static void pace_stream(TickType_t *last_wake, TickType_t period) {
    TickType_t now=xTaskGetTickCount();
    /* An overrun starts a new cadence instead of emitting catch-up frames. */
    if((TickType_t)(now-*last_wake)>=period) *last_wake=now;
    vTaskDelayUntil(last_wake,period);
}
static void stream_worker(void *arg) {
    httpd_req_t *r=arg; struct armut_camera_http *h=r->user_ctx;
    httpd_resp_set_type(r,"multipart/x-mixed-replace;boundary=" BOUNDARY);
    httpd_resp_set_hdr(r,"Cache-Control","no-store");
    bool failed=false;
    TickType_t period=(configTICK_RATE_HZ+h->cfg.target_fps-1)/h->cfg.target_fps;
    TickType_t last_wake=xTaskGetTickCount();
    while(!stopping(h)) {
        struct frame frame;
        if(capture(h,&frame)!=ESP_OK) { failed=true; break; }
        char header[160];
        int n=snprintf(header,sizeof(header),"\r\n--" BOUNDARY "\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",(unsigned)frame.len);
        esp_err_t err=httpd_resp_send_chunk(r,header,n);
        if(err==ESP_OK) err=send_frame(r,h,&frame);
        free(frame.data);
        if(err!=ESP_OK) { failed=true; break; }
        pace_stream(&last_wake,period);
    }
    if(!failed) httpd_resp_send_chunk(r,NULL,0);
    int fd=httpd_req_to_sockfd(r);
    /* Completion returns the request to httpd exactly once, even on disconnect. */
    httpd_req_async_handler_complete(r);
    if(failed) httpd_sess_trigger_close(h->cfg.server,fd);
    leave(h,true); vTaskDelete(NULL);
}
static esp_err_t stream(httpd_req_t *r) {
    struct armut_camera_http *h=r->user_ctx;
    if(!enter(h)) return reply(r,"503 Service Unavailable","{\"error\":\"stopping\"}");
    if(!authorized(r,h)||!socket_timeout(r,h,false)) { leave(h,false); return ESP_FAIL; }
    xSemaphoreTake(h->state_lock,portMAX_DELAY);
    bool busy=h->streaming; if(!busy) h->streaming=true;
    xSemaphoreGive(h->state_lock);
    if(busy) { leave(h,false); return reply(r,"409 Conflict","{\"error\":\"stream-busy\"}"); }
    httpd_req_t *async=NULL;
    if(httpd_req_async_handler_begin(r,&async)!=ESP_OK) {
        leave(h,true); return reply(r,"503 Service Unavailable","{\"error\":\"async-unavailable\"}");
    }
    if(xTaskCreate(stream_worker,"armut_camera",6144,async,5,NULL)!=pdPASS) {
        reply(async,"503 Service Unavailable","{\"error\":\"worker-unavailable\"}");
        httpd_req_async_handler_complete(async); leave(h,true);
    }
    return ESP_OK;
}
static esp_err_t apply_profile(struct armut_camera_http *h,const struct profile *p) {
    if(xSemaphoreTake(h->camera_lock,pdMS_TO_TICKS(h->cfg.frame_timeout_ms))!=pdTRUE) return ESP_ERR_TIMEOUT;
    sensor_t *s=esp_camera_sensor_get(); esp_err_t err=ESP_FAIL;
    if(s && s->pixformat==PIXFORMAT_JPEG && s->set_framesize && s->set_quality &&
       s->set_exposure_ctrl && s->set_gain_ctrl && s->set_whitebal && s->set_aec2 && s->set_ae_level) {
        if(s->set_framesize(s,p->size)==0 && s->set_quality(s,p->quality)==0 &&
           s->set_exposure_ctrl(s,1)==0 && s->set_gain_ctrl(s,1)==0 &&
           s->set_whitebal(s,1)==0 && s->set_aec2(s,1)==0 && s->set_ae_level(s,p->ae_level)==0) err=ESP_OK;
    }
    xSemaphoreGive(h->camera_lock); return err;
}
static esp_err_t profile_handler(httpd_req_t *r) {
    struct armut_camera_http *h=r->user_ctx;
    if(!enter(h)) return reply(r,"503 Service Unavailable","{\"error\":\"stopping\"}");
    esp_err_t err=ESP_FAIL;
    if(!socket_timeout(r,h,false)||!socket_timeout(r,h,true)||!authorized(r,h)) goto done;
    if(r->content_len==0||r->content_len>128) { err=reply(r,"400 Bad Request","{\"error\":\"invalid-body\"}"); goto done; }
    char body[129]; size_t used=0;
    int64_t deadline=esp_timer_get_time()+(int64_t)h->cfg.io_timeout_ms*1000;
    while(used<r->content_len) {
        if(esp_timer_get_time()>=deadline) goto done;
        int n=httpd_req_recv(r,body+used,r->content_len-used);
        if(n<=0) goto done;
        used+=(size_t)n;
    }
    body[used]='\0';
    /* Flat JSON only: cap parser recursion before entering cJSON. */
    unsigned depth=0; bool quoted=false,escaped=false,valid=true;
    for(size_t i=0;i<used;i++) {
        char c=body[i];
        if(quoted) { if(escaped) escaped=false; else if(c=='\\') escaped=true; else if(c=='"') quoted=false; }
        else if(c=='"') quoted=true;
        else if(c=='{'||c=='[') { if(++depth>2) valid=false; }
        else if(c=='}'||c==']') { if(!depth) valid=false; else depth--; }
    }
    cJSON *json=valid&&!depth&&!quoted?cJSON_ParseWithLengthOpts(body,used+1,NULL,1):NULL;
    cJSON *name=json?cJSON_GetObjectItemCaseSensitive(json,"profile"):NULL;
    const struct profile *p=cJSON_IsString(name)?find_profile(name->valuestring):NULL;
    if(!p) err=reply(r,"400 Bad Request","{\"error\":\"invalid-profile\"}");
    else if(apply_profile(h,p)!=ESP_OK) err=reply(r,"503 Service Unavailable","{\"error\":\"profile-not-applied\"}");
    else {
        char response[96]; snprintf(response,sizeof(response),"{\"profile\":\"%s\",\"maxTargetFps\":%lu}",p->name,(unsigned long)h->cfg.target_fps);
        err=reply(r,"200 OK",response);
    }
    cJSON_Delete(json);
done: leave(h,false); return err;
}
static void detach(void *arg) {
    struct armut_camera_http *h=arg;
    httpd_unregister_uri_handler(h->cfg.server,"/camera.jpg",HTTP_GET);
    httpd_unregister_uri_handler(h->cfg.server,"/stream",HTTP_GET);
    httpd_unregister_uri_handler(h->cfg.server,"/profile",HTTP_POST);
    xEventGroupSetBits(h->events,DETACHED_BIT);
}
static void release(struct armut_camera_http *h) {
    if(h->state_lock) vSemaphoreDelete(h->state_lock);
    if(h->camera_lock) vSemaphoreDelete(h->camera_lock);
    if(h->events) vEventGroupDelete(h->events);
    memset(h->key,0,sizeof(h->key)); free(h);
}
esp_err_t armut_camera_http_start(const armut_camera_http_config_t *cfg,armut_camera_http_handle_t *out) {
    if(!out) return ESP_ERR_INVALID_ARG;
    *out=NULL;
    if(!cfg||!cfg->server||!cfg->device_key||!cfg->device_key[0]||strlen(cfg->device_key)>256||
       strchr(cfg->device_key,'\r')||strchr(cfg->device_key,'\n')||
       cfg->target_fps>25||
       (cfg->io_timeout_ms&&(cfg->io_timeout_ms<100||cfg->io_timeout_ms>3000))||
       (cfg->frame_timeout_ms&&(cfg->frame_timeout_ms<100||cfg->frame_timeout_ms>5000))||
       (cfg->max_frame_bytes&&(cfg->max_frame_bytes<4096||cfg->max_frame_bytes>1048576))) return ESP_ERR_INVALID_ARG;
    sensor_t *sensor=esp_camera_sensor_get();
    if(!sensor||sensor->pixformat!=PIXFORMAT_JPEG) return ESP_ERR_INVALID_STATE;
    struct armut_camera_http *h=calloc(1,sizeof(*h)); if(!h) return ESP_ERR_NO_MEM;
    h->cfg=*cfg; memcpy(h->key,cfg->device_key,strlen(cfg->device_key)+1); h->cfg.device_key=h->key;
    if(!h->cfg.target_fps) h->cfg.target_fps=25;
    if(!h->cfg.io_timeout_ms) h->cfg.io_timeout_ms=1000;
    if(!h->cfg.frame_timeout_ms) h->cfg.frame_timeout_ms=2000;
    if(!h->cfg.max_frame_bytes) h->cfg.max_frame_bytes=524288;
    h->state_lock=xSemaphoreCreateMutex(); h->camera_lock=xSemaphoreCreateMutex(); h->events=xEventGroupCreate();
    if(!h->state_lock||!h->camera_lock||!h->events) { release(h); return ESP_ERR_NO_MEM; }
    xEventGroupSetBits(h->events,IDLE_BIT);
    httpd_uri_t uris[]={
        {.uri="/camera.jpg",.method=HTTP_GET,.handler=snapshot,.user_ctx=h},
        {.uri="/stream",.method=HTTP_GET,.handler=stream,.user_ctx=h},
        {.uri="/profile",.method=HTTP_POST,.handler=profile_handler,.user_ctx=h}
    };
    for(size_t i=0;i<3;i++) {
        esp_err_t err=httpd_register_uri_handler(cfg->server,&uris[i]);
        if(err!=ESP_OK) {
            for(size_t j=0;j<i;j++) httpd_unregister_uri_handler(cfg->server,uris[j].uri,uris[j].method);
            release(h); return err;
        }
    }
    *out=h; return ESP_OK;
}
esp_err_t armut_camera_http_stop(armut_camera_http_handle_t h,uint32_t timeout_ms) {
    if(!h) return ESP_ERR_INVALID_ARG;
    xSemaphoreTake(h->state_lock,portMAX_DELAY); h->stopping=true;
    bool queue=!h->detach_queued; h->detach_queued=true;
    xSemaphoreGive(h->state_lock);
    if(queue) {
        esp_err_t err=httpd_queue_work(h->cfg.server,detach,h);
        if(err!=ESP_OK) {
            xSemaphoreTake(h->state_lock,portMAX_DELAY); h->detach_queued=false; xSemaphoreGive(h->state_lock);
            return err;
        }
    }
    EventBits_t bits=xEventGroupWaitBits(h->events,IDLE_BIT|DETACHED_BIT,pdFALSE,pdTRUE,pdMS_TO_TICKS(timeout_ms));
    if((bits&(IDLE_BIT|DETACHED_BIT))!=(IDLE_BIT|DETACHED_BIT)) return ESP_ERR_TIMEOUT;
    /* Synchronize with the last leave(), which signals IDLE under this lock. */
    xSemaphoreTake(h->state_lock,portMAX_DELAY); xSemaphoreGive(h->state_lock);
    release(h); return ESP_OK;
}
