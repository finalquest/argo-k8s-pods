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

# Mesa (host iGPU suele ser iris; cambiá a crocus si aplica)
export MESA_LOADER_DRIVER_OVERRIDE="${MESA_LOADER_DRIVER_OVERRIDE:-iris}"
export LIBGL_ALWAYS_SOFTWARE=0
if [[ -f /usr/share/vulkan/icd.d/intel_icd.x86_64.json ]]; then
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/intel_icd.x86_64.json
fi

log() { echo "[$(date +'%H:%M:%S')] $*"; }
AVD_DIR="$HOME/.android/avd/${AVD_NAME}.avd"

# ===================== DISPLAY =====================
export DISPLAY=:0

if [[ "$GPU_MODE" == "sw" ]]; then
  # ---- Ruta SW: Xvfb (lo viejo que te funcionaba) ----
  log "GPU_MODE=sw → usando Xvfb :0 (1280x800x24)"
  pkill -9 Xorg Xvfb 2>/dev/null || true
  Xvfb :0 -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 &
  for i in {1..40}; do xdpyinfo -display :0 >/dev/null 2>&1 && break; sleep 0.25; done
  # Evita negros con ANGLE sobre X/GLX (suele ayudar igual en Xvfb)
  export LIBGL_DRI3_DISABLE="${LIBGL_DRI3_DISABLE:-1}"

  if [[ "$EMULATOR_NO_WINDOW" != "true" ]]; then
    log "VNC sobre Xvfb:${VNC_PORT}"
    # For SW mode we keep per-pod WM+VNC to provide a window
    mkdir -p /root/.fluxbox
    cat >/root/.fluxbox/apps <<'EOF'
[app] (title=Android Emulator)
  [Position] (0 0)
[end]
EOF
    fluxbox >/dev/null 2>&1 &
    x11vnc -display :0 -noshm -noxdamage -shared -forever \
           -listen 0.0.0.0 -rfbport ${VNC_PORT} >/tmp/x11vnc.log 2>&1 &
  fi

else
  # ---- Ruta HW: Xorg externo por socket compartido ----
  log "GPU_MODE=host → usando Xorg externo (socket /tmp/.X11-unix)"
  for i in {1..120}; do
    if [ -S /tmp/.X11-unix/X0 ] && xdpyinfo -display :0 >/dev/null 2>&1; then
      break
    fi
    sleep 1
    [[ "$i" -eq 120 ]] && { echo "[X] Xorg externo no disponible en :0"; exit 1; }
  done
  # En modo host, Fluxbox y VNC corren centralizados en el pod Xorg
fi

# (Opcional) ver renderer del X actual
if command -v glxinfo >/dev/null 2>&1; then
  log "GLXINFO:"
  DISPLAY=:0 glxinfo -B | egrep 'OpenGL (vendor|renderer)' || true
fi

# ===================== ADB / Puentes =================
adb start-server || true
sleep 1
LOCAL_IP=$(hostname -I | awk '{print $1}')
socat TCP-LISTEN:5554,bind=${LOCAL_IP},fork,reuseaddr TC P:127.0.0.1:5554 &
socat TCP-LISTEN:5555,bind=${LOCAL_IP},fork=reuseaddr TCP:127.0.0.1:5555 &

# ===================== Emulador =====================
EMU_BASE="$ANDROID_HOME/emulator/emulator -avd ${AVD_NAME} \
  -no-audio -no-boot-anim -accel on \
  -netdelay none -netspeed full"

# Ventana sí/no
if [[ "$EMULATOR_NO_WINDOW" == "true" ]]; then
  EMU_BASE="${EMU_BASE} -no-window"
fi

if [[ "$GPU_MODE" == "host" ]]; then
  log "Lanzando emu con -gpu host"
  sed -i 's/^hw.gpu.enabled=.*/hw.gpu.enabled=yes/'  "${AVD_DIR}/config.ini" || echo 'hw.gpu.enabled=yes'  >> "${AVD_DIR}/config.ini"
  sed -i 's/^hw.gpu.mode=.*/hw.gpu.mode=host/'       "${AVD_DIR}/config.ini" || echo 'hw.gpu.mode=host'   >> "${AVD_DIR}/config.ini"
  EMU_CMD="${EMU_BASE} -gpu host"
  SNAP_NAME="${SNAPSHOT_NAME_HOST}"
else
  log "Lanzando emu con -gpu swangle_indirect (SW)"
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
  log "Snapshot ${SNAP_NAME} no existe; arranque limpio."
  EMU_CMD="${EMU_CMD} -no-snapshot-load"
fi

log "Launch: $EMU_CMD"
exec $EMU_CMD -verbose > /tmp/emulator.log 2>&1