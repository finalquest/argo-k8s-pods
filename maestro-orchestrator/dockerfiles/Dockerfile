FROM debian:bullseye-slim

LABEL maintainer="tu_nombre <tu_email>"
LABEL description="Imagen base para orquestador Maestro"
LABEL version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive
ENV ORAS_VERSION=1.1.0

# Instalar herramientas mínimas + Java para Maestro
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget unzip ca-certificates gnupg2 tar bash git jq adb \
    openjdk-17-jre-headless \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Instalar ORAS CLI
RUN curl -LO https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && tar -xzf oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && mv oras /usr/local/bin/ \
 && rm -f oras_${ORAS_VERSION}_linux_amd64.tar.gz

# Instalar Maestro CLI
RUN curl -L https://get.maestro.mobile.dev | bash \
 && mv /root/.maestro/bin/maestro /usr/local/bin/

# Comando por defecto
CMD ["bash"]
