FROM debian:bullseye-slim

LABEL maintainer="Gemini <gemini@google.com>"
LABEL description="Imagen para Appium Orchestrator Web"
LABEL version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive

# --- 1. Dependencias básicas del SO ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    unzip \
    vim \
    ca-certificates \
    gnupg2 \
    git \
    redis-tools \
    procps \
    openjdk-17-jre-headless \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- 2. Android SDK (para ADB) ---
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/cmdline-tools/latest/bin

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools
RUN cd /tmp && \
    curl -sSL https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -o tools.zip && \
    unzip -q tools.zip -d tools && \
    mv tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm -rf tools tools.zip

# Instalar platform-tools (adb) usando el sdkmanager
RUN yes | ${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null
RUN ${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager "platform-tools"

# --- 3. Node.js v20.x y Yarn ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && npm install -g yarn \
 && yarn --version \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- 4. ORAS CLI ---
ENV ORAS_VERSION=1.1.0
RUN curl -LO "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz" \
 && tar -zxf oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && mv oras /usr/local/bin/ \
 && rm -f oras_${ORAS_VERSION}_linux_amd64.tar.gz

# --- 5. Configuración de la Aplicación ---
WORKDIR /app

# Copiar archivos de dependencias y ejecutar npm install para las dependencias del orquestador
COPY package*.json ./
RUN npm install

# Copiar el resto de los archivos de la aplicación
COPY . .

# Exponer el puerto en el que corre la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación (cambiado a bash para depuración)
CMD ["bash"]
