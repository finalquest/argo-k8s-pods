FROM debian:bullseye-slim

# --- Variables de entorno ---
ENV ANDROID_HOME=/opt/android-sdk \
    PATH=$PATH:/opt/android-sdk/emulator:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin

RUN apt-get update && apt-get install -y \
    curl unzip wget git openjdk-17-jdk \
    libglu1-mesa libvirt-daemon-system qemu-kvm \
    libqt5widgets5 libpulse0 libx11-6 \
    x11vnc xvfb fluxbox net-tools \
    python3 python3-pip \
    vim \
    redis-tools \
    procps \
    socat \
    iputils-ping \
    yad \
    && apt-get clean

# --- Crear estructura SDK ---
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools

# --- Descargar command-line tools y colocarlos en el layout correcto ---
RUN cd /tmp && \
    curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -o tools.zip && \
    unzip tools.zip -d tools && \
    mv tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm -rf tools tools.zip

# --- Instalar SDK y emulador ---
RUN yes | sdkmanager --sdk_root=${ANDROID_HOME} \
    "platform-tools" "emulator" \
    "system-images;android-34;google_apis;x86_64" \
    "platforms;android-34"

# --- Crear AVD (con nombre test-avd) ---
RUN echo "no" | avdmanager create avd -n test-avd -k "system-images;android-34;google_apis;x86_64" --device "pixel"
RUN echo "hw.ramSize=2048" >> /root/.android/avd/test-avd.avd/config.ini


# --- Instalar noVNC ---
RUN mkdir -p /opt/novnc && \
    git clone https://github.com/novnc/noVNC.git /opt/novnc && \
    git clone https://github.com/novnc/websockify /opt/novnc/utils/websockify

# --- Entrypoint ---
COPY ./scripts/runner.sh /runner.sh
RUN chmod +x /runner.sh

EXPOSE 5555 5900 6080
ENTRYPOINT ["/runner.sh"]

