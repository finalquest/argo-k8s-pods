FROM debian:bullseye-slim

LABEL maintainer="fbasello"
LABEL description="Imagen base para orquestador Maestro"
LABEL version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive

# Instalar herramientas mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget unzip ca-certificates gnupg2 tar bash git jq adb \
 && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Instalar ORAS CLI
ENV ORAS_VERSION=1.1.0
RUN curl -LO https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && tar -xzf oras_${ORAS_VERSION}_linux_amd64.tar.gz \
 && mv oras /usr/local/bin/ \
 && rm -f oras_${ORAS_VERSION}_linux_amd64.tar.gz

# Instalar Maestro CLI
RUN curl -L https://get.maestro.mobile.dev | bash \
 && mv maestro /usr/local/bin/

# Comando por defecto
CMD ["bash"]
