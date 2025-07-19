#!/bin/bash

REDIS_HOST=${RHOST:-redis}
REDIS_PORT=${RPORT:-6379}
TTL=${TTL:-15}
INTERVAL=${INTERVAL:-10}

POD_NAME=$(hostname)

echo "🔧 Registrando $POD_NAME en Redis @$REDIS_HOST:$REDIS_PORT"

while true; do
  echo redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$POD_NAME" state "idle"
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$POD_NAME" state "idle"
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXPIRE "$POD_NAME" "$TTL"
  echo "💓 Heartbeat enviado para $POD_NAME"
  sleep "$INTERVAL"
done
