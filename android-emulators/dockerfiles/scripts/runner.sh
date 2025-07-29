#!/bin/bash
set -e

echo "🚀 Starting graphical environment (Xvfb + fluxbox)..."

# Iniciar display virtual con 24-bit
Xvfb :0 -screen 0 1280x800x24 &
sleep 2

# Exportar display para todo
export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

# Iniciar gestor de ventanas
fluxbox > /dev/null 2>&1 &

echo "🖥️  Launching Android emulator..."

SNAPSHOT_PATH="/root/.android/avd/test-avd.avd/snapshots/default-boot/snapshot.pb"

if [ -f "$SNAPSHOT_PATH" ]; then
  echo "✅ Snapshot found. Using fast boot."
  $ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-snapshot-save -no-window \
  -memory 4096 \
  -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full \
  -snapshot default-boot -verbose > /tmp/emulator.log 2>&1 &
else
  echo "⚠️ No snapshot found. Normal boot."
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
echo "⏳ Waiting for Android to boot..."
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && \
      [[ "$(adb shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')" == "stopped" ]]; do
  echo "⌛ Still booting..."
  sleep 2
done

# 3. Lanzar socat
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "🔀 Forwarding ports 5554 and 5555 to ${LOCAL_IP} using socat..."
socat tcp-listen:5554,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5554 &
socat tcp-listen:5555,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5555 &

echo "✅ Emulator ready"

# Iniciar servidor VNC
echo "🖥️  Starting x11vnc on :0"
x11vnc -display :0 -nopw -forever -listen 0.0.0.0 -rfbport 5900 > /tmp/x11vnc.log 2>&1 &

# Iniciar noVNC
echo "🌐 Starting noVNC on port 6080"
/opt/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 > /tmp/novnc.log 2>&1 &

# Mantener contenedor vivo
echo "📌 Container running. Logs in /tmp/*.log"

#!/bin/bash

DEVICE="${DEVICE:-emulator-5554}"
# Verifica conexión con ADB
if ! adb -s "$DEVICE" get-state &>/dev/null; then
  echo "❌ ADB connection with $DEVICE not detected"
  exit 1
fi

while true; do
  yad --title="Controles ADB - $DEVICE" \
      --width=200 --height=100 \
      --button="Home!gtk-home:0" \
      --button="Back!gtk-go-back:1" \
      --button="Recents!gtk-refresh:2" \
      --button="Reboot!gtk-reboot:3" \
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
