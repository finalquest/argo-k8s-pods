FROM debian:bullseye-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      xserver-xorg \
      x11-xserver-utils \
      x11-utils \
      mesa-utils \
      xserver-xorg-video-modesetting \
      libgl1-mesa-dri \
      libgl1-mesa-glx \
      pciutils \
      bash \
      && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:0

WORKDIR /root
CMD ["bash"]