#!/bin/bash

# Inicia el heartbeat en segundo plano
/usr/local/bin/register_and_heartbeat.sh &

# Ejecuta el entrypoint original del emulador
exec /home/androidusr/docker-android/mixins/scripts/run.sh "$@"
