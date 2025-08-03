#!/bin/bash
set -e

echo "🚀 Starting graphical environment (Xvfb + fluxbox)..."

Xvfb :0 -screen 0 1280x800x24 &
sleep 2

export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

echo "🧩 Starting ADB server..."
adb start-server
sleep 2

fluxbox > /dev/null 2>&1 &

# Iniciar servidor VNC
echo "🖥️  Starting x11vnc on :0"
x11vnc -display :0 -nopw -forever -listen 0.0.0.0 -rfbport 5900 > /tmp/x11vnc.log 2>&1 &

# Lanzar socat para puertos ADB
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "🔀 Forwarding ports 5554 and 5555 to ${LOCAL_IP} using socat..."
socat tcp-listen:5554,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5554 &
socat tcp-listen:5555,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5555 &

echo "🖥️  Launching Android emulator..."

SNAPSHOT_PATH="/root/.android/avd/test-avd.avd/snapshots/default-boot/snapshot.pb"

EMU_CMD="$ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-snapshot-save -no-window \
  -memory 3072 \
  -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full"

if [ -f "$SNAPSHOT_PATH" ]; then
  echo "✅ Snapshot found. Using fast boot."
  EMU_CMD="$EMU_CMD -snapshot default-boot"
else
  echo "⚠️ No snapshot found. Normal boot."
  EMU_CMD="$EMU_CMD -no-snapshot-load"
fi

# Lanzar emulador en segundo plano TEMPORAL
eval "$EMU_CMD -verbose > /tmp/emulator.log 2>&1 &"
EMU_PID=$!

echo "🔌 Waiting for ADB to start..."
adb wait-for-device

echo "⏳ Waiting for Android to boot..."
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && \
      [[ "$(adb shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')" == "stopped" ]]; do
  echo "⌛ Still booting..."
  sleep 2
done

echo "✅ Android booted. Launching ADB UI..."

# Lanzar ventana flotante de controles ADB en background
(
  DEVICE="${DEVICE:-emulator-5554}"
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
) &

echo "📌 Emulator ready. Handing over control to main process."

# Convertir qemu (emulador) en el PID 1 del contenedor
exec wait "$EMU_PID"
