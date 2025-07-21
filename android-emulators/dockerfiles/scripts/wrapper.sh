#!/bin/bash
set -e

# Inicia el heartbeat en segundo plano
/usr/local/bin/register_and_heartbeat.sh &

# Ejecuta tu runner con los argumentos originales y logs a stdout
exec /runner.sh "$@"