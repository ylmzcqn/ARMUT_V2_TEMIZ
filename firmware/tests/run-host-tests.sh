#!/bin/sh
set -eu
cd "$(dirname "$0")"
bin=$(mktemp /tmp/armut-host-XXXXXX)
trap 'rm -f "$bin"' EXIT
for test in protocol camera push mqtt; do
  cc -std=gnu11 -Wall -Wextra -Werror -ffunction-sections -fdata-sections \
    -Istubs -I../armut_link/include -I../armut_camera_http/include -I../armut_presence_push/include -I../armut_mqtt/include "${test}_test.c" \
    -Wl,--gc-sections -Wl,-l:libcjson.so.1 -lm -o "$bin"
  "$bin"
done
