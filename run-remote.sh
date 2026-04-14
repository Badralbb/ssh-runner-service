#!/usr/bin/env bash
# Usage:
#   ./run-remote.sh <target-ip> <script>
#
# Example:
#   ./run-remote.sh 192.168.1.20 "uptime"
#   ./run-remote.sh 192.168.1.20 "df -h"

SERVER="http://192.168.1.10:3022"
SECRET="b54906aaea7a62424c32fabfe13ac4a2"

TARGET_IP="$1"
SCRIPT="$2"

if [[ -z "$TARGET_IP" || -z "$SCRIPT" ]]; then
  echo "Usage: $0 <target-ip> <script>"
  exit 1
fi

curl -s -X POST "$SERVER/run" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"ip\": \"$TARGET_IP\", \"script\": $(echo "$SCRIPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')}" \
  | python3 -m json.tool


curl -X POST http://192.168.1.10:3022/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer b54906aaea7a62424c32fabfe13ac4a2" \
  -d '{
    "ip": "192.168.1.10",
    "script": "sudo -S sysadminctl -addUser test-user -fullName \"Test User\" -password \"somepassword123\""
  }'

