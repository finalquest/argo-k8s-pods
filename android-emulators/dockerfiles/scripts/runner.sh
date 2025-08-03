#!/bin/bash
set -e

Xvfb :0 -screen 0 1280x800x24 &
sleep 2

export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

adb start-server
sleep 2
fluxbox > /dev/null 2>&1 &

x11vnc -display :0 -nopw -forever -listen 0.0.0.0 -rfbport 5900 > /tmp/x11vnc.log 2>&1 &

LOCAL_IP=$(hostname -I | awk '{print $1}')
socat tcp-listen:5554,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5554 &
socat tcp-listen:5555,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5555 &

# Lanzar YAD en background antes del exec
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
      0) adb -s "$DEVICE" shell input keyevent 3 ;;
      1) adb -s "$DEVICE" shell input keyevent 4 ;;
      2) adb -s "$DEVICE" shell input keyevent 187 ;;
      3) adb -s "$DEVICE" reboot ;;
      *) exit 0 ;;
    esac
  done
) &

# Armar comando del emulador
EMU_CMD="$ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-snapshot-save -no-window \
  -memory 3072 -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full"

SNAPSHOT_PATH="/root/.android/avd/test-avd.avd/snapshots/default-boot/snapshot.pb"

if [ -f "$SNAPSHOT_PATH" ]; then
  EMU_CMD="$EMU_CMD -snapshot default-boot"
else
  EMU_CMD="$EMU_CMD -no-snapshot-load"
fi

# ✅ Finalmente: emulador como PID 1
exec $EMU_CMD -verbose > /tmp/emulator.log 2>&1
