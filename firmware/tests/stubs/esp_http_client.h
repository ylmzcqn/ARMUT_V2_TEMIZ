#pragma once
#include <stdbool.h>
typedef void *esp_http_client_handle_t;
typedef struct { const char *url; int method, timeout_ms; const char *cert_pem; bool disable_auto_redirect; } esp_http_client_config_t;
#define HTTP_METHOD_POST 1
esp_http_client_handle_t esp_http_client_init(const esp_http_client_config_t *);
int esp_http_client_set_header(void *,const char *,const char *);
int esp_http_client_open(void *,int);
int esp_http_client_write(void *,const char *,int);
long long esp_http_client_fetch_headers(void *);
int esp_http_client_get_status_code(void *);
int esp_http_client_read(void *,char *,int);
bool esp_http_client_is_complete_data_received(void *);
int esp_http_client_close(void *);
int esp_http_client_cleanup(void *);
