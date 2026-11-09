idf_component_register(SRCS "armut_presence_push.c" INCLUDE_DIRS "include"
 REQUIRES armut_link esp_http_client esp_timer esp_system mbedtls json)
