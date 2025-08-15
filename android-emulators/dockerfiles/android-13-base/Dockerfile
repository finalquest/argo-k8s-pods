FROM debian:bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk \
    PATH=$PATH:/opt/android-sdk/emulator:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin

# --- Dependencias necesarias ---
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
    xserver-xorg x11vnc fluxbox \
    mesa-utils mesa-vulkan-drivers \
    libgl1-mesa-dri libglx-mesa0 libegl1-mesa libgbm1 libdrm2 \
    && apt-get clean\
    && rm -rf /var/lib/apt/lists/*


# --- Instalar Android SDK Tools ---
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools
RUN cd /tmp && \
    curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -o tools.zip && \
    unzip tools.zip -d tools && \
    mv tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm -rf tools tools.zip

# --- Instalar SDK y emulador ---
RUN yes | sdkmanager --sdk_root=${ANDROID_HOME} \
    "platform-tools" "emulator" \
    "system-images;android-33;google_apis;x86_64" \
    "platforms;android-33"

# --- Crear AVD con snapshot base ---
RUN echo "no" | avdmanager create avd -n test-avd -k "system-images;android-33;google_apis;x86_64" --device "pixel"
RUN echo "hw.ramSize=4096" >> /root/.android/avd/test-avd.avd/config.ini

# --- Copiar scripts ---
COPY ./scripts/runner.sh /runner.sh
COPY ./scripts/runner_generator.sh /runner_snapshot.sh
RUN chmod +x /runner.sh /runner_snapshot.sh

# --- Entrypoint para producción ---
EXPOSE 5554 5555 5900
ENTRYPOINT ["/runner.sh"]
