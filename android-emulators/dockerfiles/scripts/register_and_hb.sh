#!/bin/bash

REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}
EMULATOR_PORT=${EMULATOR_PORT:-5555}
TTL=${TTL:-15}
INTERVAL=${INTERVAL:-10}

POD_IP=$(hostname -i | awk '{print $1}')
POD_NAME=$(hostname)

KEY="emulator:${POD_NAME}"

echo "🔧 Registrando $KEY en Redis @$REDIS_HOST:$REDIS_PORT"

while true; do
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$KEY" host "$POD_IP" port "$EMULATOR_PORT" state "idle"
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXPIRE "$KEY" "$TTL"
  echo "💓 Heartbeat enviado para $KEY"
  sleep "$INTERVAL"
done
