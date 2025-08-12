#!/bin/bash
set -e

# Lanzar el registro/heartbeat en background
/register_and_hb.sh &

# Ejecutar el runner (reemplaza el proceso con el emulador y se convierte en PID 1)
exec /emulator.sh
