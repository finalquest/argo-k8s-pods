FROM debian:bullseye-slim

LABEL maintainer="tu_nombre <tu_email>"
LABEL description="Imagen base para orquestador Maestro"
LABEL version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive
ENV ORAS_VERSION=1.1.0

# --- Dependencias básicas ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget unzip ca-certificates gnupg2 tar bash git jq adb \
    openjdk-17-jre-headless \
    vim redis \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

 # --- Variables de entorno ---
ENV ANDROID_HOME=/opt/android-sdk \
    PATH=$PATH:/opt/android-sdk/emulator:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools

# --- Descargar command-line tools y colocarlos en el layout correcto ---
RUN cd /tmp && \
    curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -o tools.zip && \
    unzip tools.zip -d tools && \
    mv tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm -rf tools tools.zip

RUN ln -sf /usr/bin /opt/android-sdk/platform-tools

 # --- Node.js y Yarn (vía npm) ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && npm install -g yarn \
 && yarn --version \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# --- ORAS CLI ---
RUN curl -LO https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && tar -xzf oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && mv oras /usr/local/bin/ \
 && rm -f oras_${ORAS_VERSION}_linux_amd64.tar.gz

# --- Maestro CLI ---
RUN curl -fsSL "https://get.maestro.mobile.dev" | bash

# --- yq CLI para YAML ---
RUN wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

# --- Script del orquestador ---
COPY runner.sh /root/runner.sh
COPY runner_appium.sh /root/runner_appium.sh
RUN chmod +x /root/runner_appium.sh
RUN chmod +x /root/runner.sh

# --- Comando por defecto ---
CMD ["bash"]