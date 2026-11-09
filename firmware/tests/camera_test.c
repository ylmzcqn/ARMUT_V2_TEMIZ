#include <assert.h>
#include "../armut_camera_http/armut_camera_http.c"
static camera_fb_t fb;
static uint8_t jpeg[]={0xff,0xd8,0xff,0xd9};
static sensor_t sensor;
static int returned,completed,closed,deleted,quality,ae_level,frame_size;
static int sensor_error;
static int64_t fake_time;
static TickType_t fake_tick,delay_anchor,delay_period;
int xSemaphoreTake(SemaphoreHandle_t s,unsigned ticks) { (void)s; (void)ticks; return pdTRUE; }
void xSemaphoreGive(SemaphoreHandle_t s) { (void)s; }
EventBits_t xEventGroupSetBits(EventGroupHandle_t e,EventBits_t b) { (void)e; return b; }
int64_t esp_timer_get_time(void) { return fake_time; }
camera_fb_t *esp_camera_fb_get(void) { return &fb; }
void esp_camera_fb_return(camera_fb_t *f) { assert(f==&fb); returned++; }
sensor_t *esp_camera_sensor_get(void) { return &sensor; }
static int framesize(sensor_t *s,framesize_t v) { assert(s==&sensor); frame_size=v; return sensor_error; }
static int set_quality(sensor_t *s,int v) { (void)s; quality=v; return 0; }
static int set_ae(sensor_t *s,int v) { (void)s; ae_level=v; return 0; }
static int set_auto(sensor_t *s,int v) { (void)s; assert(v==1); return 0; }
esp_err_t httpd_resp_set_type(httpd_req_t *r,const char *s) { (void)r; (void)s; return ESP_OK; }
esp_err_t httpd_resp_set_hdr(httpd_req_t *r,const char *n,const char *s) { (void)r; (void)n; (void)s; return ESP_OK; }
esp_err_t httpd_resp_send_chunk(httpd_req_t *r,const char *s,size_t n) { (void)r; (void)s; (void)n; return ESP_FAIL; }
esp_err_t httpd_req_async_handler_complete(httpd_req_t *r) { (void)r; completed++; return ESP_OK; }
int httpd_req_to_sockfd(httpd_req_t *r) { (void)r; return 7; }
esp_err_t httpd_sess_trigger_close(httpd_handle_t h,int fd) { (void)h; assert(fd==7); closed++; return ESP_OK; }
void vTaskDelete(TaskHandle_t h) { assert(h==NULL); deleted++; }
void vTaskDelay(unsigned ticks) { (void)ticks; }
TickType_t xTaskGetTickCount(void) { return fake_tick; }
void vTaskDelayUntil(TickType_t *anchor,TickType_t period) {
    delay_anchor=*anchor; delay_period=period; *anchor+=period;
}
int main(void) {
    TickType_t period=(configTICK_RATE_HZ+25-1)/25;
    assert(period==4); /* 25 FPS at 100 Hz: four ticks, without a fifth tick. */
    TickType_t anchor=100; fake_tick=101; pace_stream(&anchor,period);
    assert(delay_anchor==100 && delay_period==4 && anchor==104);
    fake_tick=120; pace_stream(&anchor,period);
    assert(delay_anchor==120 && anchor==124); /* overrun rebases; no catch-up burst */
    assert(same_secret("device-key","device-key"));
    assert(!same_secret("device-key-extra","device-key"));
    assert(!same_secret("device-ke","device-key"));
    assert(!same_secret("Device-key","device-key"));
    assert(!find_profile("unknown"));
    struct armut_camera_http h={.cfg={.target_fps=25,.frame_timeout_ms=2000,.max_frame_bytes=4096}};
    sensor=(sensor_t){.pixformat=PIXFORMAT_JPEG,.set_framesize=framesize,.set_quality=set_quality,
        .set_exposure_ctrl=set_auto,.set_gain_ctrl=set_auto,.set_whitebal=set_auto,.set_aec2=set_auto,.set_ae_level=set_ae};
    assert(apply_profile(&h,find_profile("smooth"))==ESP_OK);
    assert(frame_size==FRAMESIZE_VGA && quality==18 && ae_level==0);
    assert(apply_profile(&h,find_profile("lowlight"))==ESP_OK);
    assert(frame_size==FRAMESIZE_VGA && quality==16 && ae_level==2);
    assert(apply_profile(&h,find_profile("detail"))==ESP_OK);
    assert(frame_size==FRAMESIZE_SXGA && quality==10 && ae_level==0);
    sensor_error=-1; assert(apply_profile(&h,find_profile("smooth"))!=ESP_OK);
    fb=(camera_fb_t){.format=PIXFORMAT_JPEG,.buf=jpeg,.len=sizeof(jpeg)};
    struct frame copy;
    assert(capture(&h,&copy)==ESP_OK && copy.len==sizeof(jpeg));
    assert(copy.data!=jpeg && !memcmp(copy.data,jpeg,sizeof(jpeg))); free(copy.data);
    assert(returned==1);
    fb.len=4097; assert(capture(&h,&copy)!=ESP_OK && returned==2 && !copy.data);
    fb.len=sizeof(jpeg); fb.format=0; assert(capture(&h,&copy)!=ESP_OK && returned==3);
    fb.format=PIXFORMAT_JPEG; h.active=1; h.streaming=true;
    httpd_req_t req={.user_ctx=&h};
    stream_worker(&req); /* failed send must release fb, async request and stream slot */
    assert(returned==4 && completed==1 && closed==1 && deleted==1);
    assert(!h.streaming && h.active==0);
    puts("firmware camera host tests passed");
}
