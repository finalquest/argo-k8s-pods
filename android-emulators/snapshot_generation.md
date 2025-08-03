
# 🧪 Generación manual de imagen Android con snapshot preboot

Este procedimiento genera una imagen Docker de emulador Android con snapshot cargado, lista para iniciar en caliente (`fast boot`) en Kubernetes.

---

## 🧱 Paso 1 – Build de imagen base

Construí la imagen base que ya contenga un AVD preconfigurado (`test-avd`), sin snapshot.

```bash
docker build -t android-emulators/emulator-base:13 .
```

---

## 🧪 Paso 2 – Ejecutar imagen base con KVM habilitado

```bash
docker run -it --rm \
  --device /dev/kvm \
  --cap-add=ALL \
  --entrypoint bash \
  android-emulators/emulator-base:13
```

---

## 🚀 Paso 3 – Iniciar el emulador y esperar boot completo

Corré el runner con `&` para que quede corriendo en segundo plano:

```bash
./runner_snapshot.sh &
```

Verificá que el emulador haya arrancado completamente:

```bash
adb wait-for-device

# Repetí hasta que ambas condiciones estén OK:
adb shell getprop sys.boot_completed  # debe devolver "1"
adb shell getprop init.svc.bootanim   # debe devolver "stopped"
```

---

## 💾 Paso 4 – Guardar el snapshot

```bash
adb emu avd snapshot save default-boot
```

---

## 🧹 Paso 5 – Limpiar locks y detener emulador

```bash
killall qemu-system-x86_64
rm -f /tmp/.X0-lock
rm -f ~/.android/avd/test-avd.avd/*.lock
```

---

## 🔧 Paso 6 – Ajustar el config.ini para snapshot

Dentro del container, corré:

```bash
echo "snapshot.present = true" >> /root/.android/avd/test-avd.avd/config.ini
echo "snapshot.name = default-boot" >> /root/.android/avd/test-avd.avd/config.ini
```

---

## 🧱 Paso 7 – Commit de la imagen con snapshot

```bash
docker commit <container_id> android-emulators/emulator-with-snapshot:13
```
