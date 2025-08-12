#!/bin/bash
set -e

# Iniciar siempre el entorno gráfico virtual
echo "Iniciando entorno gráfico virtual (Xvfb)..."
Xvfb :0 -screen 0 1280x800x24 &
sleep 2

export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

fluxbox > /dev/null 2>&1 &

# Si EMULATOR_NO_WINDOW no es 'true', se configuran VNC y los controles.
if [ "${EMULATOR_NO_WINDOW}" != "true" ]; then
    echo "Iniciando con VNC y controles gráficos..."
    x11vnc -display :0 -nopw -forever -listen 0.0.0.0 -rfbport 5900 > /tmp/x11vnc.log 2>&1 &

    LOCAL_IP=$(hostname -I | awk '{print $1}')
    socat tcp-listen:5900,bind="${LOCAL_IP}",fork tcp:127.0.0.1:5900 &

    # Lanzar YAD en background
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
else
    echo "Iniciando en modo no-window (headless), sin VNC ni controles."
fi

adb start-server
sleep 2

LOCAL_IP=$(hostname -I | awk '{print $1}')

socat TCP-LISTEN:5554,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5554 &
socat TCP-LISTEN:5555,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5555 &

# Base del comando del emulador
EMU_CMD_BASE="$ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-snapshot-save \
  -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full"

# Añadir -no-window si es necesario
if [ "${EMULATOR_NO_WINDOW}" = "true" ]; then
    EMU_CMD="$EMU_CMD_BASE -no-window"
     
else
    EMU_CMD="$EMU_CMD_BASE"
fi

SNAPSHOT_PATH="/root/.android/avd/test-avd.avd/snapshots/default-boot/snapshot.pb"

if [ -f "$SNAPSHOT_PATH" ]; then
  EMU_CMD="$EMU_CMD -snapshot default-boot"
else
  EMU_CMD="$EMU_CMD -no-snapshot-load"
fi

# ✅ Finalmente: emulador como PID 1
echo "Ejecutando emulador: $EMU_CMD"
exec $EMU_CMD -verbose > /tmp/emulator.log 2>&1
