#pragma once
#include <stddef.h>
#include "esp_err.h"
typedef void *httpd_handle_t;
typedef struct httpd_req { void *user_ctx; size_t content_len; } httpd_req_t;
typedef struct { const char *uri; int method; esp_err_t (*handler)(httpd_req_t *); void *user_ctx; } httpd_uri_t;
#define HTTP_GET 0
#define HTTP_POST 1
#define HTTPD_RESP_USE_STRLEN (-1)
esp_err_t httpd_resp_set_status(httpd_req_t *,const char *);
esp_err_t httpd_resp_set_type(httpd_req_t *,const char *);
esp_err_t httpd_resp_set_hdr(httpd_req_t *,const char *,const char *);
esp_err_t httpd_resp_send(httpd_req_t *,const char *,int);
esp_err_t httpd_resp_send_chunk(httpd_req_t *,const char *,size_t);
size_t httpd_req_get_hdr_value_len(httpd_req_t *,const char *);
esp_err_t httpd_req_get_hdr_value_str(httpd_req_t *,const char *,char *,size_t);
int httpd_req_to_sockfd(httpd_req_t *);
int httpd_req_recv(httpd_req_t *,char *,size_t);
esp_err_t httpd_req_async_handler_begin(httpd_req_t *,httpd_req_t **);
esp_err_t httpd_req_async_handler_complete(httpd_req_t *);
esp_err_t httpd_sess_trigger_close(httpd_handle_t,int);
esp_err_t httpd_register_uri_handler(httpd_handle_t,const httpd_uri_t *);
esp_err_t httpd_unregister_uri_handler(httpd_handle_t,const char *,int);
esp_err_t httpd_queue_work(httpd_handle_t,void (*)(void *),void *);
