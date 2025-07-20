#!/bin/bash

REDIS_HOST=${RHOST:-redis}
REDIS_PORT=${RPORT:-6379}
TTL=${TTL:-15}
INTERVAL=${INTERVAL:-10}

POD_NAME=$(hostname)
NAMESPACE=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
STS_NAME=$(echo "$POD_NAME" | rev | cut -d'-' -f2- | rev)
ADB_HOST="${POD_NAME}.${STS_NAME}.${NAMESPACE}.svc.cluster.local:5555"

echo "🔧 Registrando $POD_NAME en Redis @$REDIS_HOST:$REDIS_PORT"

while true; do
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    HSET "$POD_NAME" \
      state "idle" \
      adb_host "$ADB_HOST"

  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    EXPIRE "$POD_NAME" "$TTL"

  echo "💓 Heartbeat enviado para $POD_NAME → $ADB_HOST (TTL $TTL)"
  sleep "$INTERVAL"
done
