#!/bin/bash
set -euo pipefail

# ===================== Config =====================
AVD_NAME="${AVD_NAME:-test-avd}"
GPU_MODE="${GPU_MODE:-host}"                 # host | sw

SNAPSHOT_NAME_HOST="${SNAPSHOT_NAME_HOST:-host-boot}"
SNAPSHOT_NAME_SW="${SNAPSHOT_NAME_SW:-sw-boot}"

# Tu iGPU en la VM es 00:10.0 -> PCI:0:16:0 (ajustá si cambia)
PCI_BUSID="${PCI_BUSID:-PCI:0:16:0}"

# Mesa: Intel Gen9+ suele usar 'iris'; si tu stack usa 'crocus', cámbialo
export MESA_LOADER_DRIVER_OVERRIDE="${MESA_LOADER_DRIVER_OVERRIDE:-iris}"
export LIBGL_ALWAYS_SOFTWARE=0

# Evitá lavapipe si hay Vulkan
if [[ -f /usr/share/vulkan/icd.d/intel_icd.x86_64.json ]]; then
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/intel_icd.x86_64.json
fi

# ===================== Utils ======================
log(){ echo "[$(date +'%H:%M:%S')] $*"; }
AVD_DIR="$HOME/.android/avd/${AVD_NAME}.avd"

# ===================== Xorg (siempre, no Xvfb) ====
export DISPLAY=:0
pkill -9 Xvfb 2>/dev/null || true

mkdir -p /etc/X11/xorg.conf.d
cat >/etc/X11/xorg.conf.d/10-modesetting.conf <<EOF
Section "Device"
  Identifier "iGPU"
  Driver "modesetting"
  BusID "${PCI_BUSID}"
  Option "AccelMethod" "glamor"
  Option "DRI" "3"
EndSection
EOF

log "Iniciando Xorg real en ${DISPLAY} (modesetting/DRI3)…"
Xorg ${DISPLAY} -noreset +extension GLX +extension RANDR -logfile /tmp/Xorg.0.log &
for i in {1..40}; do xdpyinfo -display ${DISPLAY} >/dev/null 2>&1 && break; sleep 0.25; done

# Mostrar renderer del X (debe ser Intel/Mesa; si sale llvmpipe, revisá /dev/dri y BusID)
if command -v glxinfo >/dev/null 2>&1; then
  log "GLXINFO:"
  DISPLAY=${DISPLAY} glxinfo -B | egrep 'OpenGL (vendor|renderer)' || true
fi

# ===================== ADB + socat =================
adb start-server || true
sleep 1
LOCAL_IP=$(hostname -I | awk '{print $1}')
socat TCP-LISTEN:5554,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5554 &
socat TCP-LISTEN:5555,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5555 &

# ===================== Emulador ====================
EMU_BASE="$ANDROID_HOME/emulator/emulator -avd ${AVD_NAME} \
  -no-audio -no-boot-anim -accel on -no-window\
  -netdelay none -netspeed full"

if [[ "$GPU_MODE" == "host" ]]; then
  log "GPU_MODE=host → -gpu host"
  # Asegurar config del AVD
  sed -i 's/^hw.gpu.enabled=.*/hw.gpu.enabled=yes/'  "${AVD_DIR}/config.ini" || echo 'hw.gpu.enabled=yes'  >> "${AVD_DIR}/config.ini"
  sed -i 's/^hw.gpu.mode=.*/hw.gpu.mode=host/'       "${AVD_DIR}/config.ini" || echo 'hw.gpu.mode=host'   >> "${AVD_DIR}/config.ini"

  EMU_CMD="${EMU_BASE} -gpu host"
  SNAP_NAME="${SNAPSHOT_NAME_HOST}"
else
  log "GPU_MODE=sw → -gpu swangle_indirect (sobre Xorg)"
  EMU_CMD="${EMU_BASE} -gpu swangle_indirect \
    -prop debug.hwui.disable_vulkan=1 \
    -prop debug.hwui.renderer=skiagl"
  SNAP_NAME="${SNAPSHOT_NAME_SW}"
fi

# Snapshot por modo
SNAP_PATH="${AVD_DIR}/snapshots/${SNAP_NAME}/snapshot.pb"
if [[ -f "$SNAP_PATH" ]]; then
  log "Usando snapshot ${SNAP_NAME}"
  EMU_CMD="${EMU_CMD} -snapshot ${SNAP_NAME}"
else
  log "Snapshot ${SNAP_NAME} no existe → arranque limpio"
  EMU_CMD="${EMULATOR_CMD:-$EMU_CMD} -no-snapshot-load"
fi

log "Launch: $EMU_CMD"
$EMU_CMD -verbose > /tmp/emulator.log 2>&1 &
EMU_PID=$!

# ===================== Esperar boot & snapshot =====
adb wait-for-device
until [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == "1" ]] \
   && [[ "$(adb shell getprop init.svc.bootanim | tr -d '\r')" == "stopped" ]]; do
  log "⌛ Booting…"
  sleep 2
done

# Crear snapshot si no existía en este modo
if [[ ! -f "$SNAP_PATH" ]]; then
  log "Guardando snapshot ${SNAP_NAME}…"
  adb emu avd snapshot save "${SNAP_NAME}" || true
fi

wait "$EMU_PID"
