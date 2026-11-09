idf_component_register(SRCS "armut_camera_http.c" INCLUDE_DIRS "include"
    REQUIRES esp_http_server esp_timer json esp32-camera)
