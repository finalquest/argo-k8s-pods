#!/bin/bash
set -e

echo "🚀 Starting graphical environment (Xvfb + fluxbox)..."

Xvfb :0 -screen 0 1280x800x24 &
sleep 2

export DISPLAY=:0
export LIBGL_ALWAYS_SOFTWARE=1
export QT_XCB_GL_INTEGRATION=none

adb start-server
sleep 2
fluxbox > /dev/null 2>&1 &

EMU_CMD="$ANDROID_HOME/emulator/emulator -avd test-avd \
  -no-audio -no-boot-anim -no-window \
  -memory 3072 -gpu swangle_indirect -accel on \
  -netdelay none -netspeed full"

eval "$EMU_CMD -verbose > /tmp/emulator.log 2>&1 &"
EMU_PID=$!

adb wait-for-device

until [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == "1" ]] && \
      [[ "$(adb shell getprop init.svc.bootanim | tr -d '\r')" == "stopped" ]]; do
  echo "⌛ Still booting..."
  sleep 2
done

wait "$EMU_PID"
