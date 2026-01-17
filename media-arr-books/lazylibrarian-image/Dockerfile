FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    build-essential \
    libffi-dev \
    libssl-dev \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash lazylib

WORKDIR /app
RUN git clone --depth 1 https://gitlab.com/LazyLibrarian/LazyLibrarian.git /app
RUN python -m pip install --upgrade pip \
  && python -m pip install .

RUN mkdir -p /config /downloads /books \
  && chown -R 1000:1000 /config /downloads /books /app

USER 1000

EXPOSE 5299

CMD ["python", "LazyLibrarian.py", "--nolaunch", "--datadir", "/config", "--port", "5299"]
