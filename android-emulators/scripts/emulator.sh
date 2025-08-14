#!/bin/bash
set -euo pipefail

# ===================== Config =====================
AVD_NAME="${AVD_NAME:-test-avd}"
EMULATOR_NO_WINDOW="${EMULATOR_NO_WINDOW:-false}"    # true|false
ENABLE_VNC="${ENABLE_VNC:-1}"                        # 1 para VNC si hay ventana
GPU_MODE="${GPU_MODE:-host}"                         # host | sw
SNAPSHOT_NAME_HOST="${SNAPSHOT_NAME_HOST:-host-boot}"
SNAPSHOT_NAME_SW="${SNAPSHOT_NAME_SW:-sw-boot}"
VNC_PORT="${VNC_PORT:-5900}"

# Tu iGPU en la VM es 00:10.0 -> PCI:0:16:0
PCI_BUSID="${PCI_BUSID:-PCI:0:16:0}"

# Mesa: gen9 suele ir con 'iris'. Si tu stack usa 'crocus', cámbialo.
export MESA_LOADER_DRIVER_OVERRIDE="${MESA_LOADER_DRIVER_OVERRIDE:-iris}"
export LIBGL_ALWAYS_SOFTWARE=0

# Forzá ICD de Intel (evita lavapipe/llvmpipe cuando hay Vulkan)
if [[ -f /usr/share/vulkan/icd.d/intel_icd.x86_64.json ]]; then
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/intel_icd.x86_64.json
fi

# ===================== Utils ======================
log() { echo "[$(date +'%H:%M:%S')] $*"; }
AVD_DIR="$HOME/.android/avd/${AVD_NAME}.avd"

# ===================== Xorg (siempre) ==============
export DISPLAY=:0
# Asegurarnos de no tener Xvfb
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

# >>> Fijar resolución 1280x800 en Xorg (equivalente a Xvfb -screen) <<<
cat >/etc/X11/xorg.conf.d/20-screen.conf <<'EOF'
Section "Monitor"
    Identifier "Monitor0"
    Option "PreferredMode" "1280x800"
EndSection

Section "Screen"
    Identifier "Screen0"
    Device     "iGPU"
    Monitor    "Monitor0"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Virtual 1280 800
        Modes "1280x800"
    EndSubSection
EndSection
EOF
# <<< fin resolución fija >>>

log "Iniciando Xorg real en ${DISPLAY} (modesetting/DRI3)…"
Xorg ${DISPLAY} -noreset +extension GLX +extension RANDR -logfile /tmp/Xorg.0.log &
for i in {1..40}; do xdpyinfo -display ${DISPLAY} >/dev/null 2>&1 && break; sleep 0.25; done

# WM + VNC (opcional)
if [[ "$EMULATOR_NO_WINDOW" != "true" && "$ENABLE_VNC" == "1" ]]; then
  log "Levantando fluxbox + x11vnc:${VNC_PORT}…"
  fluxbox >/dev/null 2>&1 &
  x11vnc -display ${DISPLAY} -noxdamage -shared -forever \
         -listen 0.0.0.0 -rfbport ${VNC_PORT} >/tmp/x11vnc.log 2>&1 &
fi

# Mostrar el renderer del X (debe ser Intel, NO llvmpipe)
if command -v glxinfo >/dev/null 2>&1; then
  log "GLXINFO:"
  DISPLAY=${DISPLAY} glxinfo -B | egrep 'OpenGL (vendor|renderer)' || true
fi

# ===================== ADB / Puentes =================
adb start-server || true
sleep 1
LOCAL_IP=$(hostname -I | awk '{print $1}')
socat TCP-LISTEN:5554,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5554 &
socat TCP-LISTEN:5555,bind=${LOCAL_IP},fork,reuseaddr TCP:127.0.0.1:5555 &

# ===================== Emulador =====================
EMU_BASE="$ANDROID_HOME/emulator/emulator -avd ${AVD_NAME} \
  -no-audio -no-boot-anim -accel on \
  -netdelay none -netspeed full"

if [[ "$GPU_MODE" == "host" ]]; then
  log "GPU_MODE=host -> -gpu host"
  # Asegurar config del AVD
  sed -i 's/^hw.gpu.enabled=.*/hw.gpu.enabled=yes/'  "${AVD_DIR}/config.ini" || echo 'hw.gpu.enabled=yes'  >> "${AVD_DIR}/config.ini"
  sed -i 's/^hw.gpu.mode=.*/hw.gpu.mode=host/'       "${AVD_DIR}/config.ini" || echo 'hw.gpu.mode=host'   >> "${AVD_DIR}/config.ini"

  EMU_CMD="${EMU_BASE} -gpu host"
  SNAP_NAME="${SNAPSHOT_NAME_HOST}"

else
  log "GPU_MODE=sw -> -gpu swangle_indirect"
  # Para software no hace falta forzar LIBGL_ALWAYS_SOFTWARE con Xorg real
  EMU_CMD="${EMU_BASE} -gpu swangle_indirect \
    -prop debug.hwui.disable_vulkan=1 \
    -prop debug.hwui.renderer=skiagl"
  SNAP_NAME="${SNAPSHOT_NAME_SW}"
fi

# Ventana sí/no
if [[ "$EMULATOR_NO_WINDOW" == "true" ]]; then
  EMU_CMD="${EMU_CMD} -no-window"
fi

# Snapshot por modo
SNAP_PATH="${AVD_DIR}/snapshots/${SNAP_NAME}/snapshot.pb"
if [[ -f "$SNAP_PATH" ]]; then
  log "Usando snapshot ${SNAP_NAME}"
  EMU_CMD="${EMU_CMD} -snapshot ${SNAP_NAME}"
else
  log "Snapshot ${SNAP_NAME} no existe; arranque limpio."
  EMU_CMD="${EMU_CMD} -no-snapshot-load"
fi

log "Launch: $EMU_CMD"
exec $EMU_CMD -verbose > /tmp/emulator.log 2>&1
