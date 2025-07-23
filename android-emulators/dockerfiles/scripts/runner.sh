#!/bin/bash
set -e

echo "🚀 Iniciando entorno gráfico (Xvfb + fluxbox)..."

# Iniciar display virtual con 24-bit
Xvfb :0 -screen 0 1280x800x24 &
sleep 2

# Exportar display para todo
export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

# Iniciar gestor de ventanas
fluxbox > /dev/null 2>&1 &

echo "🖥️  Lanzando emulador Android..."

SNAPSHOT_PATH="/root/.android/avd/test-avd.avd/snapshots/default-boot/snapshot.pb"

if [ -f "$SNAPSHOT_PATH" ]; then
  echo "✅ Snapshot encontrado. Usando boot rápido."
  $ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-snapshot-save \
  -memory 4096 \
  -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full \
  -snapshot default-boot -verbose > /tmp/emulator.log 2>&1 &
else
  echo "⚠️ No hay snapshot. Boot normal."
  $ANDROID_HOME/emulator/emulator -avd test-avd \
    -no-audio -no-boot-anim -no-snapshot-save \
    -memory 4096 \
    -gpu swangle_indirect -accel on \
    -netdelay none -netspeed full \
    -no-snapshot-load -verbose > /tmp/emulator.log 2>&1 &
    # ... (creación del AVD)
fi


# Esperar a que ADB esté listo
adb wait-for-device

# Esperar a que Android esté totalmente booteado
echo "⏳ Esperando boot de Android..."
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && \
      [[ "$(adb shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')" == "stopped" ]]; do
  echo "⌛ Aún booteando..."
  sleep 2
done

# Iniciar Heartbeat en segundo plano
echo "💓 Iniciando script de registro y heartbeat..."
/usr/local/bin/register_and_hb.sh &

# 3. Lanzar socat
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "🔀 Reenviando puertos 5554 y 5555 a ${LOCAL_IP} usando socat..."
socat tcp-listen:5554,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5554 &
socat tcp-listen:5555,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5555 &

echo "✅ Emulador listo"

# Iniciar servidor VNC
echo "🖥️  Iniciando x11vnc en :0"
x11vnc -display :0 -nopw -forever -listen 0.0.0.0 -rfbport 5900 > /tmp/x11vnc.log 2>&1 &

# Iniciar noVNC
echo "🌐 Iniciando noVNC en puerto 6080"
/opt/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 > /tmp/novnc.log 2>&1 &

# Mantener contenedor vivo
echo "📌 Contenedor corriendo. Logs en /tmp/*.log"

#!/bin/bash

DEVICE="${DEVICE:-emulator-5554}"
# Verifica conexión con ADB
if ! adb -s "$DEVICE" get-state &>/dev/null; then
  echo "❌ No se detecta conexión ADB con $DEVICE"
  exit 1
fi

while true; do
  yad --title="Controles ADB - $DEVICE" \
      --width=200 --height=100 \
      --button="Home!gtk-home:0" \
      --button="Back!gtk-go-back:1" \
      --button="Recents!gtk-refresh:2" \
      --button="Reboot!gtk-refresh:3" \
      --on-top --no-markup --skip-taskbar --undecorated

  case $? in
    0) adb -s "$DEVICE" shell input keyevent 3 ;;     # Home
    1) adb -s "$DEVICE" shell input keyevent 4 ;;     # Back
    2) adb -s "$DEVICE" shell input keyevent 187 ;;   # Recents
    3) adb -s "$DEVICE" reboot ;;                     # Reboot
    *) exit 0 ;;
  esac
done

tail -f /dev/null
